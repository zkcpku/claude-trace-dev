import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from "child_process";
import type { MCPServerConfig, MCPToolDefinition, LemmyTool } from "../types.js";
import { jsonSchemaToZodSchema } from "../utils/schema-converter.js";
import { defineTool } from "@mariozechner/lemmy";

/**
 * MCP Client wrapper for communicating with MCP servers
 */
export class MCPClient {
	private client: Client;
	private transport: StdioClientTransport;
	private process: ChildProcess;
	private connected = false;
	private tools: MCPToolDefinition[] = [];

	constructor(
		private serverName: string,
		private config: MCPServerConfig,
	) {}

	/**
	 * Connect to the MCP server
	 */
	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		try {
			// Spawn the MCP server process
			this.process = spawn(this.config.command, this.config.args, {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, ...this.config.env },
				cwd: this.config.cwd,
			});

			// Create transport
			this.transport = new StdioClientTransport({
				reader: this.process.stdout!,
				writer: this.process.stdin!,
			});

			// Create client
			this.client = new Client(
				{
					name: `lemmy-tools-${this.serverName}`,
					version: "1.0.0",
				},
				{
					capabilities: {
						tools: {},
					},
				},
			);

			// Handle process errors
			this.process.on("error", (error) => {
				console.error(`MCP server ${this.serverName} process error:`, error);
			});

			this.process.stderr?.on("data", (data) => {
				console.error(`MCP server ${this.serverName} stderr:`, data.toString());
			});

			// Connect with timeout
			const connectPromise = this.client.connect(this.transport);
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error("Connection timeout")), this.config.timeout || 30000);
			});

			await Promise.race([connectPromise, timeoutPromise]);
			this.connected = true;

			// List available tools
			await this.loadTools();
		} catch (error) {
			await this.disconnect();
			throw new Error(`Failed to connect to MCP server ${this.serverName}: ${error.message}`);
		}
	}

	/**
	 * Disconnect from the MCP server
	 */
	async disconnect(): Promise<void> {
		if (!this.connected) {
			return;
		}

		try {
			if (this.client && this.transport) {
				await this.client.close();
			}
		} catch (error) {
			console.warn(`Error closing MCP client ${this.serverName}:`, error);
		}

		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
			// Force kill after 5 seconds
			setTimeout(() => {
				if (this.process && !this.process.killed) {
					this.process.kill("SIGKILL");
				}
			}, 5000);
		}

		this.connected = false;
		this.tools = [];
	}

	/**
	 * Load available tools from the MCP server
	 */
	private async loadTools(): Promise<void> {
		if (!this.connected) {
			throw new Error("Not connected to MCP server");
		}

		try {
			const response = await this.client.listTools();
			this.tools = response.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema as Record<string, unknown>,
			}));
		} catch (error) {
			throw new Error(`Failed to load tools from MCP server ${this.serverName}: ${error.message}`);
		}
	}

	/**
	 * Get list of available tools
	 */
	getTools(): MCPToolDefinition[] {
		return [...this.tools];
	}

	/**
	 * Call a tool on the MCP server
	 */
	async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
		if (!this.connected) {
			throw new Error("Not connected to MCP server");
		}

		try {
			// Create promise that can be cancelled
			const callPromise = this.client.callTool({
				name,
				arguments: args,
			});

			if (!signal) {
				const response = await callPromise;
				return response.content[0]?.text || response.content[0] || "No response content";
			}

			// Race between call and cancellation
			const cancelPromise = new Promise((_, reject) => {
				signal.addEventListener("abort", () => {
					reject(new Error("MCP tool call cancelled"));
				});
			});

			const response = await Promise.race([callPromise, cancelPromise]);
			return response.content[0]?.text || response.content[0] || "No response content";
		} catch (error) {
			if (error.message.includes("cancelled")) {
				throw error;
			}
			throw new Error(`MCP tool call failed (${this.serverName}.${name}): ${error.message}`);
		}
	}

	/**
	 * Check if the client is connected
	 */
	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Get server name
	 */
	getServerName(): string {
		return this.serverName;
	}

	/**
	 * Convert MCP tools to LemmyTools
	 */
	toLemmyTools(): LemmyTool[] {
		return this.tools.map((mcpTool) => {
			const zodSchema = jsonSchemaToZodSchema(mcpTool.inputSchema);

			return defineTool({
				name: `mcp__${this.serverName}__${mcpTool.name}`,
				description: mcpTool.description,
				category: "mcp",
				schema: zodSchema,
				execute: async (args: any, signal?: AbortSignal) => {
					return await this.callTool(mcpTool.name, args, signal);
				},
			}) as LemmyTool;
		});
	}
}
