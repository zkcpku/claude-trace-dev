# Lemmy

TypeScript API wrapper for LLM providers (Anthropic, OpenAI, Google, Ollama) designed for building agentic workflows.

## Features

- **Unified Interface**: Common API across all providers
- **Provider-Agnostic Context**: Switch models mid-conversation
- **Zod-Based Tools**: Type-safe tool definitions with automatic validation
- **MCP Integration**: Built-in Model Context Protocol support
- **Cost Tracking**: Automatic token/cost tracking across all providers
- **Streaming**: Real-time responses with thinking/reasoning support
- **Extended Thinking**: Support for Claude's thinking and OpenAI's reasoning models

## Installation

```bash
npm install lemmy
```

## Quick Start

```typescript
import { lemmy, Context, defineTool } from 'lemmy'
import { z } from 'zod'

// Create clients
const claude = lemmy.anthropic({ 
  apiKey: 'sk-...',
  model: 'claude-3-5-sonnet-20241022'
})

// Shared context across providers
const context = new Context()

// Define tools with Zod
const weatherTool = defineTool({
  name: "get_weather",
  description: "Get current weather",
  schema: z.object({
    location: z.string()
  }),
  execute: async ({ location }) => {
    return { temp: 72, condition: "sunny" }
  }
})

context.addTool(weatherTool)

// Use tools
const result = await claude.ask("What's the weather in NYC?", { context })

if (result.type === 'tool_call') {
  const toolResults = await context.executeTools(result.toolCalls)
  await claude.sendToolResults(toolResults.map(r => ({
    toolCallId: r.toolCallId,
    content: r.success ? JSON.stringify(r.result) : `Error: ${r.error?.message}`
  })), { context })
}

console.log(`Total cost: $${context.getTotalCost()}`)
```

## Tools & MCP

```typescript
// Add MCP servers
context.addMCPServer("filesystem", {
  transport: "stdio",
  command: "mcp-fs"
})

// Zero-argument tools
const pingTool = defineTool({
  name: "ping",
  description: "Ping server",
  schema: z.object({}),
  execute: async () => "pong"
})
```

## Extended Thinking

```typescript
// Enable Claude's thinking
const claude = lemmy.anthropic({
  apiKey: 'sk-...',
  model: 'claude-3-5-sonnet-20241022',
  thinking: { enabled: true }
})

// OpenAI reasoning models
const openai = lemmy.openai({
  apiKey: 'sk-...',
  model: 'o1-mini',
  reasoningEffort: 'medium'
})

// Stream thinking in real-time
await claude.ask("Solve this complex problem", {
  context,
  onChunk: (content) => console.log("Response:", content),
  onThinkingChunk: (thinking) => console.log("Thinking:", thinking)
})
```

## Development

```bash
npm install                # Install dependencies
npm run test:run          # Run tests
npm run typecheck         # Type checking

# Examples
cd examples/cli-chat
npm run dev
```

## Architecture

- **packages/lemmy/**: Main library with provider clients
- **examples/**: Usage examples and demos
- **scripts/**: Model data generation from ruby_llm

## Status

🚧 Under active development

## License

MIT