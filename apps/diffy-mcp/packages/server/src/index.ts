#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DiffyServer } from "./diffy-server.js";
import { openTool } from "./mcp/open.js";
import { closeTool } from "./mcp/close.js";
import { highlightTool } from "./mcp/highlight.js";
import { refreshTool } from "./mcp/refresh.js";

/**
 * Main MCP server entry point for Diffy
 * Handles stdio transport and coordinates with internal file server
 */
class DiffyMCPServer {
	private server: Server;
	private diffyServer: DiffyServer;

	constructor() {
		this.server = new Server(
			{
				name: "diffy-mcp",
				version: "1.0.0",
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		this.diffyServer = new DiffyServer();
		this.setupTools();
		this.setupErrorHandling();
	}

	private setupTools() {
		// List available tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: [
					{
						name: "open",
						description: "Open a file in the specified panel with optional git diff",
						inputSchema: {
							type: "object",
							properties: {
								absolutePath: {
									type: "string",
									description: "Absolute path to file",
								},
								panel: {
									type: "number",
									enum: [0, 1],
									description: "Panel index (0=left, 1=right)",
								},
								branch: {
									type: "string",
									description: "Optional: branch/commit/tag to diff against",
								},
							},
							required: ["absolutePath", "panel"],
						},
					},
					{
						name: "close",
						description: "Close a file from all panels",
						inputSchema: {
							type: "object",
							properties: {
								absolutePath: {
									type: "string",
									description: "Absolute path to file",
								},
							},
							required: ["absolutePath"],
						},
					},
					{
						name: "highlight",
						description: "Highlight specific lines in a file (content mode only)",
						inputSchema: {
							type: "object",
							properties: {
								absolutePath: {
									type: "string",
									description: "Absolute path to file",
								},
								startLine: {
									type: "number",
									description: "Start line number (1-indexed)",
								},
								endLine: {
									type: "number",
									description: "End line number (1-indexed, optional)",
								},
							},
							required: ["absolutePath", "startLine"],
						},
					},
					{
						name: "refresh",
						description: "Refresh all watched files and recalculate diffs",
						inputSchema: {
							type: "object",
							properties: {},
							additionalProperties: false,
						},
					},
				],
			};
		});

		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;

			try {
				switch (name) {
					case "open":
						return await openTool(args, this.diffyServer);
					case "close":
						return await closeTool(args, this.diffyServer);
					case "highlight":
						return await highlightTool(args, this.diffyServer);
					case "refresh":
						return await refreshTool(args, this.diffyServer);
					default:
						throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
				}
			} catch (error) {
				console.error(`Error in tool ${name}:`, error);
				throw error instanceof McpError
					? error
					: new McpError(
							ErrorCode.InternalError,
							`Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
						);
			}
		});
	}

	private setupErrorHandling() {
		this.server.onerror = (error) => {
			console.error("[MCP Server Error]", error);
		};

		process.on("SIGINT", async () => {
			console.log("Shutting down Diffy MCP server...");
			await this.cleanup();
			process.exit(0);
		});

		process.on("SIGTERM", async () => {
			console.log("Shutting down Diffy MCP server...");
			await this.cleanup();
			process.exit(0);
		});
	}

	private async cleanup() {
		try {
			await this.diffyServer.stop();
			console.log("Diffy server stopped");
		} catch (error) {
			console.error("Error during cleanup:", error);
		}
	}

	async start() {
		// Start the internal diffy server
		await this.diffyServer.start();

		// Start MCP server with stdio transport
		const transport = new StdioServerTransport();
		await this.server.connect(transport);

		console.error("Diffy MCP server started and listening on stdio");
	}
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const server = new DiffyMCPServer();
	server.start().catch((error) => {
		console.error("Failed to start Diffy MCP server:", error);
		process.exit(1);
	});
}

export { DiffyMCPServer };
