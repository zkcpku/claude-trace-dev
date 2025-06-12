/**
 * @mariozechner/lemmy-tools
 *
 * Comprehensive tool collection for lemmy LLM client library
 * with built-in tools and MCP server integration.
 */

// Re-export lemmy core functionality
export { defineTool } from "@mariozechner/lemmy";
export type { Context, ToolDefinition } from "@mariozechner/lemmy";

// Export types
export type {
	LemmyTool,
	ToolCategory,
	MCPServerConfig,
	MCPToolDefinition,
	ToolExecutionConfig,
	ToolRegistryConfig,
} from "./types.js";

// Export built-in tools
export {
	// Individual tools
	bashTool,
	readTool,
	writeTool,
	editTool,
	multiEditTool,
	lsTool,
	globTool,
	grepTool,
	todoReadTool,
	todoWriteTool,
	taskTool,

	// Utility functions
	getBuiltinTools,
	getBuiltinToolsByCategory,
	getBuiltinTool,
} from "./builtin/index.js";

// Export MCP integration
export { MCPClient, MCPRegistry } from "./mcp/index.js";

// Export utilities
export { jsonSchemaToZodSchema, zodSchemaToJsonSchema, createSchemaConverter } from "./utils/schema-converter.js";

import type { Context } from "@mariozechner/lemmy";
import type { LemmyTool, ToolRegistryConfig } from "./types.js";
import { getBuiltinTools } from "./builtin/index.js";
import { MCPRegistry } from "./mcp/index.js";

/**
 * Tool registry for managing and organizing tools
 */
export class ToolRegistry {
	private tools = new Map<string, LemmyTool>();

	/**
	 * Add a tool to the registry
	 */
	addTool(tool: LemmyTool): void {
		if (this.tools.has(tool.name)) {
			throw new Error(`Tool '${tool.name}' is already registered`);
		}
		this.tools.set(tool.name, tool);
	}

	/**
	 * Get a tool by name
	 */
	getTool(name: string): LemmyTool | undefined {
		return this.tools.get(name);
	}

	/**
	 * Get tools by category
	 */
	getToolsByCategory(category: string): LemmyTool[] {
		return Array.from(this.tools.values()).filter((tool) => tool.category === category);
	}

	/**
	 * List all tools
	 */
	listAllTools(): LemmyTool[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Remove a tool
	 */
	removeTool(name: string): boolean {
		return this.tools.delete(name);
	}

	/**
	 * Clear all tools
	 */
	clear(): void {
		this.tools.clear();
	}

	/**
	 * Get tool count
	 */
	size(): number {
		return this.tools.size;
	}

	/**
	 * Add all tools to a lemmy context
	 */
	addToContext(context: Context): void {
		for (const tool of this.tools.values()) {
			context.addTool(tool);
		}
	}
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
	return new ToolRegistry();
}

/**
 * Tool execution manager for handling cancellation and advanced execution
 */
export class ToolExecutionManager {
	private abortController?: AbortController;

	constructor(private context: Context) {}

	/**
	 * Execute with cancellation support
	 */
	async executeWithCancellation(client: any, message: string, options: { timeout?: number } = {}): Promise<any> {
		this.abortController = new AbortController();

		// Set up timeout
		let timeoutId: NodeJS.Timeout | undefined;
		if (options.timeout) {
			timeoutId = setTimeout(() => {
				this.abortController?.abort();
			}, options.timeout);
		}

		try {
			const result = await client.ask(message, {
				context: this.context,
				signal: this.abortController.signal,
			});

			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			return result;
		} catch (error) {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			if (error.name === "AbortError") {
				return {
					type: "cancelled",
					message: "Operation cancelled by user",
				};
			}
			throw error;
		}
	}

	/**
	 * Cancel current operation
	 */
	cancelCurrentOperation(): void {
		this.abortController?.abort();
	}
}

/**
 * Create configuration from options
 */
export async function createFromConfig(config: ToolRegistryConfig): Promise<{
	registry: ToolRegistry;
	mcpRegistry: MCPRegistry;
	initialize: () => Promise<void>;
	addToContext: (context: Context) => Promise<void>;
}> {
	const registry = createToolRegistry();
	const mcpRegistry = new MCPRegistry();

	const initialize = async () => {
		// Add built-in tools
		if (config.builtinTools) {
			const allBuiltins = getBuiltinTools();
			const selectedTools =
				config.builtinTools.length > 0
					? allBuiltins.filter((tool) => config.builtinTools!.includes(tool.name))
					: allBuiltins;

			selectedTools.forEach((tool) => registry.addTool(tool));
		}

		// Register MCP servers (placeholder - would need actual server configs)
		if (config.mcpServers) {
			for (const serverName of config.mcpServers) {
				try {
					// This would need actual server configuration
					console.log(`Would register MCP server: ${serverName}`);
				} catch (error) {
					console.warn(`Failed to register MCP server ${serverName}:`, error);
				}
			}
		}
	};

	const addToContext = async (context: Context) => {
		registry.addToContext(context);

		// Add MCP tools
		try {
			const mcpTools = await mcpRegistry.getAvailableTools();
			mcpTools.forEach((tool) => context.addTool(tool));
		} catch (error) {
			console.warn("Failed to add MCP tools to context:", error);
		}
	};

	return {
		registry,
		mcpRegistry,
		initialize,
		addToContext,
	};
}
