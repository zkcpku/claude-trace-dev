# Lemmy-Tools Examples

This directory contains executable TypeScript examples demonstrating various features and usage patterns of the lemmy-tools package.

## Running Examples

All examples can be run directly with `npx tsx`:

```bash
# Basic setup with all built-in tools
npx tsx examples/01-basic-setup.ts

# Selective tool loading
npx tsx examples/02-selective-tools.ts

# MCP integration (requires MCP servers)
npx tsx examples/03-mcp-integration.ts

# Tool cancellation
npx tsx examples/04-tool-cancellation.ts

# Custom tool development
npx tsx examples/05-custom-tool.ts

# Interactive chat application
npx tsx examples/06-chat-app.ts
```

## Example Descriptions

### 01-basic-setup.ts

**Basic Setup Example**

- Shows how to set up lemmy-tools with all built-in tools
- Demonstrates basic tool usage and result handling
- Good starting point for understanding the package

### 02-selective-tools.ts

**Selective Tool Loading**

- Shows how to add only specific tools instead of all built-ins
- Focuses on filesystem and shell tools
- Demonstrates how to exclude web tools for security

### 03-mcp-integration.ts

**MCP Integration**

- Shows how to integrate MCP (Model Context Protocol) servers
- Requires MCP server packages to be installed
- Demonstrates filesystem and puppeteer MCP servers

**Prerequisites:**

```bash
npm install @modelcontextprotocol/server-filesystem
npm install @modelcontextprotocol/server-puppeteer
```

### 04-tool-cancellation.ts

**Tool Cancellation**

- Demonstrates how to cancel long-running tool operations
- Shows both automatic timeouts and manual cancellation
- Important for responsive user interfaces

### 05-custom-tool.ts

**Custom Tool Development**

- Shows how to create custom tools with Zod schemas
- Demonstrates error handling and validation
- Includes examples of Git and SystemInfo tools
- Shows platform-aware functionality

### 06-chat-app.ts

**Interactive Chat Application**

- Complete chat application with lemmy-tools integration
- Includes command handling (/tools, /clear, /quit, etc.)
- Demonstrates graceful shutdown and error handling
- Shows how to build a real application with the package

## Environment Requirements

### Required

- Node.js 18+
- TypeScript/tsx for running examples
- Valid Anthropic API key (set in environment)

### Optional (for MCP examples)

- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-puppeteer`
- Other MCP servers as needed

## Environment Variables

```bash
# Required for Anthropic examples
ANTHROPIC_API_KEY=your_api_key_here

# Optional: Override default model
LEMMY_MODEL=claude-3-5-sonnet-20241022

# Optional: MCP server configuration
LEMMY_TOOLS_MCP_SERVERS=filesystem,puppeteer
LEMMY_TOOLS_TIMEOUT=30000
```

## Common Patterns

### Error Handling

```typescript
try {
	const result = await client.ask(message, { context });
	if (result.type === "success") {
		// Handle success
	} else {
		// Handle error
		console.log("Error:", result.error.message);
	}
} catch (error) {
	// Handle unexpected errors
}
```

### Tool Registration

```typescript
// All tools
const tools = getBuiltinTools();
tools.forEach((tool) => context.addTool(tool));

// Selective tools
const selectedTools = [bashTool, readTool, writeTool];
selectedTools.forEach((tool) => context.addTool(tool));

// Custom tools
const customTool = defineTool({
	/* ... */
});
context.addTool(customTool);
```

### MCP Integration

```typescript
const mcpRegistry = new MCPRegistry();
await mcpRegistry.registerServer("name", {
	command: "npx",
	args: ["@modelcontextprotocol/server-name"],
	timeout: 30000,
});

const mcpTools = await mcpRegistry.getAvailableTools();
mcpTools.forEach((tool) => context.addTool(tool));
```

## Troubleshooting

### "API key not found"

- Set your `ANTHROPIC_API_KEY` environment variable
- Or pass it directly to `createAnthropicClient({ apiKey: 'your-key' })`

### "MCP server not found"

- Install the required MCP server package
- Check that `npx @modelcontextprotocol/server-name` works

### "Tool execution timeout"

- Increase timeout in MCP server configuration
- Use cancellation to handle long-running operations

### "Permission denied"

- Some tools require specific permissions (file access, network, etc.)
- Run with appropriate permissions or modify tool configurations

## Next Steps

1. **Start with `01-basic-setup.ts`** to understand the basics
2. **Try `06-chat-app.ts`** for a complete application example
3. **Explore `05-custom-tool.ts`** to create your own tools
4. **Set up MCP with `03-mcp-integration.ts`** for extended capabilities

For more information, see the main lemmy-tools documentation.
