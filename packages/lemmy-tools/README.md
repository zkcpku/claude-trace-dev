# @mariozechner/lemmy-tools

A comprehensive tool collection for the lemmy LLM client library, providing built-in tools and MCP (Model Context Protocol) server integration.

## Features

- 🔧 **Built-in Tools**: File operations, shell commands, search, and productivity tools
- 🌐 **MCP Integration**: First-class support for MCP servers and tools
- ⚡ **Tool Cancellation**: Cancel long-running operations with AbortSignal
- 🎯 **Type Safe**: Full TypeScript support with Zod validation
- 📦 **Modular**: Import only the tools you need
- 🛡️ **Secure**: Input validation and safe execution patterns

## Installation

```bash
npm install @mariozechner/lemmy-tools
```

## Quick Start

```typescript
import { createAnthropicClient, createContext } from "@mariozechner/lemmy";
import { getBuiltinTools } from "@mariozechner/lemmy-tools";

// Create client and context
const client = createAnthropicClient({ model: "claude-3-5-sonnet-20241022" });
const context = createContext();

// Add all built-in tools
const tools = getBuiltinTools();
tools.forEach((tool) => context.addTool(tool));

// Now your LLM has access to tools!
const result = await client.ask("List files in the current directory", { context });
```

## Built-in Tools

### File System Tools

- **Read**: Read files with line ranges and limits
- **Write**: Write content to files with safety checks
- **Edit**: Perform exact string replacements
- **MultiEdit**: Make multiple edits to a file atomically
- **LS**: List directory contents with filtering
- **Glob**: Fast file pattern matching
- **Grep**: Content search with regex support

### Shell & System Tools

- **Bash**: Execute shell commands with timeout and cancellation
- **Task**: Launch sub-agents for complex operations

### Productivity Tools

- **TodoRead**: Read todo lists for session management
- **TodoWrite**: Manage structured task lists

### Notebook Tools

- **NotebookRead**: Read Jupyter notebooks
- **NotebookEdit**: Edit Jupyter notebook cells

### Browser Automation (via MCP)

- **mcp**puppeteer**\***: Browser navigation, screenshots, interaction

## Usage Patterns

### All Built-in Tools

```typescript
import { getBuiltinTools, createToolRegistry } from "@mariozechner/lemmy-tools";

const registry = createToolRegistry();
const tools = getBuiltinTools();
tools.forEach((tool) => {
	registry.addTool(tool);
	context.addTool(tool);
});
```

### Selective Tools

```typescript
import { bashTool, readTool, writeTool, globTool } from "@mariozechner/lemmy-tools/builtin";

// Add only specific tools
context.addTool(bashTool);
context.addTool(readTool);
context.addTool(writeTool);
context.addTool(globTool);
```

### MCP Integration

```typescript
import { MCPRegistry } from "@mariozechner/lemmy-tools/mcp";

const mcpRegistry = new MCPRegistry();

// Register MCP servers
await mcpRegistry.registerServer("puppeteer", {
	command: "npx",
	args: ["@modelcontextprotocol/server-puppeteer"],
	timeout: 30000,
});

// Add MCP tools to context
const mcpTools = await mcpRegistry.getAvailableTools();
mcpTools.forEach((tool) => context.addTool(tool));
```

### Tool Cancellation

```typescript
import { ToolExecutionManager } from "@mariozechner/lemmy-tools";

const manager = new ToolExecutionManager(context);
const abortController = new AbortController();

// Cancel after 10 seconds
setTimeout(() => abortController.abort(), 10000);

try {
	const result = await client.ask("Run a long analysis", {
		context,
		signal: abortController.signal,
	});
} catch (error) {
	if (error.name === "AbortError") {
		console.log("Operation cancelled");
	}
}
```

### Custom Tools

```typescript
import { defineTool } from "@mariozechner/lemmy-tools";
import { z } from "zod";

const customTool = defineTool({
	name: "CustomTool",
	description: "My custom tool",
	category: "utility",
	schema: z.object({
		input: z.string(),
		options: z
			.object({
				verbose: z.boolean().default(false),
			})
			.optional(),
	}),
	execute: async (args, signal) => {
		// Custom implementation
		if (signal?.aborted) {
			throw new Error("Operation cancelled");
		}
		return { result: `Processed: ${args.input}` };
	},
});

context.addTool(customTool);
```

## MCP Server Support

lemmy-tools provides first-class support for MCP (Model Context Protocol) servers:

### Supported MCP Servers

- **@modelcontextprotocol/server-filesystem**: File system operations
- **@modelcontextprotocol/server-puppeteer**: Browser automation
- **@modelcontextprotocol/server-sqlite**: Database operations
- **@modelcontextprotocol/server-git**: Git operations
- Any custom MCP server

### MCP Configuration

```typescript
const mcpConfig = {
	servers: {
		filesystem: {
			command: "npx",
			args: ["@modelcontextprotocol/server-filesystem", "/path/to/root"],
			timeout: 10000,
		},
		puppeteer: {
			command: "npx",
			args: ["@modelcontextprotocol/server-puppeteer"],
			timeout: 30000,
		},
	},
};
```

### MCP Error Handling

```typescript
try {
	await mcpRegistry.registerServer("myserver", config);
} catch (error) {
	console.log("MCP server registration failed:", error.message);
	// Graceful degradation - continue with built-in tools
}
```

## Tool Categories

Tools are organized by category for easier management:

- `filesystem`: File and directory operations
- `shell`: Command execution and system interaction
- `search`: File and content search
- `productivity`: Task management and organization
- `notebook`: Jupyter notebook operations
- `mcp`: Tools from MCP servers
- `custom`: User-defined tools

## API Reference

### Core Classes

#### `ToolRegistry`

```typescript
class ToolRegistry {
	addTool(tool: LemmyTool): void;
	getTool(name: string): LemmyTool | undefined;
	getToolsByCategory(category: string): LemmyTool[];
	listAllTools(): LemmyTool[];
}
```

#### `MCPRegistry`

```typescript
class MCPRegistry {
	registerServer(name: string, config: MCPServerConfig): Promise<void>;
	unregisterServer(name: string): Promise<void>;
	getAvailableTools(): Promise<LemmyTool[]>;
	shutdown(): Promise<void>;
}
```

#### `ToolExecutionManager`

```typescript
class ToolExecutionManager {
	constructor(context: Context);
	executeWithCancellation(client: ChatClient, message: string): Promise<AskResult>;
	cancelCurrentOperation(): void;
}
```

### Core Functions

#### `getBuiltinTools()`

Returns all built-in tools as an array.

#### `createToolRegistry()`

Creates a new tool registry instance.

#### `defineTool(params)`

Defines a new tool with Zod schema validation.

### Tool Interface

```typescript
interface LemmyTool<T = Record<string, unknown>, R = unknown> {
	name: string;
	description: string;
	category: "filesystem" | "shell" | "web" | "productivity" | "notebook" | "mcp" | "custom";
	tags?: string[];
	version?: string;
	experimental?: boolean;
	schema: ZodSchema<T>;
	execute: (args: T, signal?: AbortSignal) => Promise<R>;
}
```

## Configuration

### Environment Variables

```bash
# Tool timeouts (milliseconds)
LEMMY_TOOLS_TIMEOUT=30000

# MCP server configuration
LEMMY_TOOLS_MCP_SERVERS=filesystem,puppeteer
LEMMY_TOOLS_FILESYSTEM_ROOT=/path/to/root

# Security settings
LEMMY_TOOLS_ALLOW_SHELL=true
LEMMY_TOOLS_ALLOW_NETWORK=true
```

### Programmatic Configuration

```typescript
import { createFromConfig } from "@mariozechner/lemmy-tools";

const config = {
	builtinTools: ["bash", "read", "write", "glob"],
	mcpServers: ["filesystem", "puppeteer"],
	timeout: 30000,
	security: {
		allowShell: true,
		allowNetwork: true,
		allowFileWrite: true,
	},
};

const toolsConfig = createFromConfig(config);
await toolsConfig.initialize();
toolsConfig.addToContext(context);
```

## Examples

See the [examples/](./examples/) directory for complete, runnable examples:

- `01-basic-setup.ts` - Basic setup with all tools
- `02-selective-tools.ts` - Selective tool loading
- `03-mcp-integration.ts` - MCP server integration
- `04-tool-cancellation.ts` - Cancellation handling
- `05-custom-tool.ts` - Custom tool development
- `06-chat-app.ts` - Complete chat application

Run any example with:

```bash
npx tsx examples/01-basic-setup.ts
```

## Security Considerations

### File System Access

- Tools respect file system permissions
- Use `allowFileWrite: false` to disable write operations
- Consider running in containers for additional isolation

### Shell Execution

- Commands are executed in the current user context
- Use `allowShell: false` to disable shell tools
- Always validate and sanitize inputs

### MCP Servers

- MCP servers run as separate processes
- Validate MCP server sources and permissions
- Use timeouts to prevent resource exhaustion

## Error Handling

### Tool Execution Errors

```typescript
const result = await context.executeTool(toolCall);
if (!result.success) {
	console.log("Tool failed:", result.error.message);
	console.log("Error type:", result.error.type);
}
```

### MCP Server Errors

```typescript
try {
	const tools = await mcpRegistry.getAvailableTools();
} catch (error) {
	if (error.type === "mcp_error") {
		console.log("MCP server error:", error.message);
	}
}
```

### Validation Errors

```typescript
// Zod validation errors are automatically handled
// and converted to ToolError with type 'invalid_args'
```

## Performance

### Tool Loading

- Tools are loaded lazily when first used
- Use selective loading for better startup performance
- MCP servers are started on-demand

### Caching

- File operations use intelligent caching
- MCP connections are pooled and reused

### Cancellation

- All tools support cancellation via AbortSignal
- Client-side cancellation is immediate
- MCP server cancellation depends on server implementation

## Contributing

### Adding Built-in Tools

1. Create tool in `src/builtin/`
2. Add to exports in `src/builtin/index.ts`
3. Add tests in `test/builtin/`
4. Update documentation

### Adding MCP Support

1. Test with MCP server
2. Add configuration examples
3. Document any special requirements
4. Add integration tests

## Dependencies

- `@mariozechner/lemmy`: Core LLM client library
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `zod`: Schema validation
- `zod-to-json-schema`: Schema conversion
- `json-schema-to-zod`: Reverse schema conversion

## License

MIT License - see LICENSE file for details.

## Related Projects

- [@mariozechner/lemmy](../lemmy/) - Core LLM client library
- [@mariozechner/lemmy-tui](../lemmy-tui/) - Terminal UI components
- [@mariozechner/lemmy-cli-args](../lemmy-cli-args/) - CLI argument parsing
