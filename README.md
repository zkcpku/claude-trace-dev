# Lemmy

A TypeScript API wrapper for multiple LLM providers (Anthropic, OpenAI, Google, Ollama) designed to make creating agentic workflows extremely simple.

## Features

- **Unified Interface**: Common API across all LLM providers
- **Provider-Agnostic Context**: Maintain conversations across different models
- **Tool System**: Zod-based tool definitions with automatic type inference
- **MCP Integration**: Support for Model Context Protocol servers
- **Cost Tracking**: Automatic token and cost tracking across providers
- **Type Safety**: Full TypeScript support with strict mode
- **Streaming**: Built-in streaming support with optional callbacks
- **Error Handling**: Structured error types with retry logic

## Installation

```bash
npm install lemmy
```

## Quick Start

```typescript
import { lemmy, Context } from 'lemmy'

// Create provider clients
const claude = lemmy.anthropic({ 
  apiKey: 'your-api-key',
  model: 'claude-3-5-sonnet-20241022'
})

const gpt4 = lemmy.openai({
  apiKey: 'your-api-key', 
  model: 'gpt-4o'
})

// Use shared context across providers
const context = new Context()

await claude.ask("Hello!", { context })
await gpt4.ask("Continue the conversation", { context }) // Same context

console.log(context.getTotalCost()) // Total cost across all providers
```

## Development

This is a monorepo using npm workspaces:

```bash
# Install dependencies
npm install

# Build the package
cd packages/lemmy
npm run build

# Run tests
npm test

# Run example
cd examples/cli-chat
npm run dev
```

## Project Structure

```
lemmy/
├── packages/lemmy/          # Main package
│   ├── src/                 # Source code
│   ├── test/               # Tests
│   └── dist/               # Built output
├── examples/               # Example applications
│   └── cli-chat/          # CLI chat example
└── scripts/               # Build and maintenance scripts
```

## Status

🚧 **Under Development** - This project is currently being built. The initial project structure and build tooling are complete.

## License

MIT