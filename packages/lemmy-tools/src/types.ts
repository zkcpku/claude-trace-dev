import type { ToolDefinition } from "@mariozechner/lemmy";

/**
 * Tool categories for organization and filtering
 */
export type ToolCategory = "filesystem" | "shell" | "search" | "productivity" | "notebook" | "mcp" | "custom";

/**
 * Extended tool definition for lemmy-tools
 */
export type LemmyTool<T = Record<string, unknown>, R = unknown> = ToolDefinition<T, R> & {
	/** Tool category for organization */
	category: ToolCategory;
	/** Optional tags for filtering */
	tags?: string[];
	/** Tool version */
	version?: string;
	/** Whether this tool is experimental */
	experimental?: boolean;
};

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
	/** Command to start the MCP server */
	command: string;
	/** Arguments for the command */
	args: string[];
	/** Environment variables */
	env?: Record<string, string>;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Working directory */
	cwd?: string;
}

/**
 * MCP tool definition from server
 */
export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * Tool execution manager configuration
 */
export interface ToolExecutionConfig {
	/** Default timeout for tool execution */
	timeout?: number;
	/** Whether to allow shell tools */
	allowShell?: boolean;
	/** Whether to allow network tools */
	allowNetwork?: boolean;
	/** Whether to allow file write operations */
	allowFileWrite?: boolean;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
	/** Built-in tools to include */
	builtinTools?: string[];
	/** MCP servers to register */
	mcpServers?: string[];
	/** Execution configuration */
	execution?: ToolExecutionConfig;
}

/**
 * Schema conversion utilities
 */
export interface SchemaConverter {
	/** Convert JSON Schema to Zod schema */
	jsonSchemaToZod(schema: Record<string, unknown>): import("zod").ZodSchema;
	/** Convert Zod schema to JSON Schema */
	zodToJsonSchema(schema: import("zod").ZodSchema): Record<string, unknown>;
}

/**
 * Task/Agent tool context
 */
export interface AgentContext {
	/** Available tools for the agent */
	availableTools: string[];
	/** Agent execution timeout */
	timeout?: number;
	/** Maximum number of tool calls */
	maxToolCalls?: number;
}
