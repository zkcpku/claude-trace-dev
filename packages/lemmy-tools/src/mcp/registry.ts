import type { MCPServerConfig, LemmyTool } from "../types.js";
import { MCPClient } from "./client.js";

/**
 * Registry for managing multiple MCP servers and their tools
 */
export class MCPRegistry {
	private clients = new Map<string, MCPClient>();
	private connectionPromises = new Map<string, Promise<void>>();

	/**
	 * Register an MCP server
	 */
	async registerServer(name: string, config: MCPServerConfig): Promise<void> {
		if (this.clients.has(name)) {
			throw new Error(`MCP server '${name}' is already registered`);
		}

		const client = new MCPClient(name, config);
		this.clients.set(name, client);

		// Store connection promise to avoid multiple connection attempts
		const connectionPromise = client.connect().catch((error) => {
			// Remove failed client
			this.clients.delete(name);
			this.connectionPromises.delete(name);
			throw error;
		});

		this.connectionPromises.set(name, connectionPromise);

		try {
			await connectionPromise;
		} finally {
			this.connectionPromises.delete(name);
		}
	}

	/**
	 * Unregister an MCP server
	 */
	async unregisterServer(name: string): Promise<void> {
		const client = this.clients.get(name);
		if (!client) {
			return; // Already unregistered
		}

		// Wait for any pending connection
		const connectionPromise = this.connectionPromises.get(name);
		if (connectionPromise) {
			try {
				await connectionPromise;
			} catch {
				// Ignore connection errors during unregistration
			}
		}

		await client.disconnect();
		this.clients.delete(name);
	}

	/**
	 * Get all available tools from all registered servers
	 */
	async getAvailableTools(): Promise<LemmyTool[]> {
		const allTools: LemmyTool[] = [];

		for (const [serverName, client] of this.clients) {
			try {
				// Wait for connection if still pending
				const connectionPromise = this.connectionPromises.get(serverName);
				if (connectionPromise) {
					await connectionPromise;
				}

				if (client.isConnected()) {
					const tools = client.toLemmyTools();
					allTools.push(...tools);
				}
			} catch (error) {
				console.warn(`Failed to get tools from MCP server '${serverName}':`, error.message);
				// Continue with other servers
			}
		}

		return allTools;
	}

	/**
	 * Get tools from a specific server
	 */
	async getServerTools(serverName: string): Promise<LemmyTool[]> {
		const client = this.clients.get(serverName);
		if (!client) {
			throw new Error(`MCP server '${serverName}' is not registered`);
		}

		// Wait for connection if still pending
		const connectionPromise = this.connectionPromises.get(serverName);
		if (connectionPromise) {
			await connectionPromise;
		}

		if (!client.isConnected()) {
			throw new Error(`MCP server '${serverName}' is not connected`);
		}

		return client.toLemmyTools();
	}

	/**
	 * Get list of registered server names
	 */
	getServerNames(): string[] {
		return Array.from(this.clients.keys());
	}

	/**
	 * Get connection status for all servers
	 */
	getConnectionStatus(): Record<string, { connected: boolean; pending: boolean }> {
		const status: Record<string, { connected: boolean; pending: boolean }> = {};

		for (const [serverName, client] of this.clients) {
			status[serverName] = {
				connected: client.isConnected(),
				pending: this.connectionPromises.has(serverName),
			};
		}

		return status;
	}

	/**
	 * Reconnect to a server
	 */
	async reconnectServer(serverName: string): Promise<void> {
		const client = this.clients.get(serverName);
		if (!client) {
			throw new Error(`MCP server '${serverName}' is not registered`);
		}

		// Disconnect first
		await client.disconnect();

		// Reconnect
		const connectionPromise = client.connect();
		this.connectionPromises.set(serverName, connectionPromise);

		try {
			await connectionPromise;
		} finally {
			this.connectionPromises.delete(serverName);
		}
	}

	/**
	 * Shutdown all MCP servers
	 */
	async shutdown(): Promise<void> {
		const disconnectionPromises = Array.from(this.clients.values()).map((client) =>
			client.disconnect().catch((error) => {
				console.warn("Error disconnecting MCP client:", error);
			}),
		);

		await Promise.all(disconnectionPromises);

		this.clients.clear();
		this.connectionPromises.clear();
	}

	/**
	 * Health check for all servers
	 */
	async healthCheck(): Promise<Record<string, { healthy: boolean; error?: string }>> {
		const results: Record<string, { healthy: boolean; error?: string }> = {};

		for (const [serverName, client] of this.clients) {
			try {
				if (client.isConnected()) {
					// Try to list tools as a health check
					client.getTools();
					results[serverName] = { healthy: true };
				} else {
					results[serverName] = { healthy: false, error: "Not connected" };
				}
			} catch (error) {
				results[serverName] = { healthy: false, error: error.message };
			}
		}

		return results;
	}
}
