# Lemmy API Specification

## Overview

Lemmy is a TypeScript API wrapper for common LLM SDKs (Anthropic, OpenAI, Google, Ollama) designed to make creating agentic workflows extremely simple. Inspired by ruby_llm, lemmy provides a unified interface while maintaining provider-specific capabilities and full type safety.

## Core Architecture

### Provider-Specific Clients with Common Interface

```typescript
interface ChatClient {
  ask(input: string | UserInput, options: AskOptions): Promise<AskResult>;
  getModel(): string; // Returns the model name/identifier
  getProvider(): string; // Returns the provider name (e.g., 'anthropic', 'openai')
}

// Provider-specific clients instantiated with model-specific config
const claude = lemmy.anthropic({
  apiKey: '...',
  model: 'claude-3-5-sonnet-20241022',
  maxOutputTokens: 8192 // Optional: override model default
});
const openai = lemmy.openai({
  apiKey: '...',
  model: 'o1-mini',
  maxOutputTokens: 4096, // Optional: override model default
  reasoningEffort: 'medium' // Optional: for reasoning models (o1-mini, o1-preview)
});
const google = lemmy.google({
  apiKey: '...',
  model: 'gemini-1.5-pro'
});
const ollama = lemmy.ollama({
  baseUrl: '...',
  model: 'llama2'
});
```

### Context Management

The `Context` class manages provider-agnostic state:
- Conversation history (message array with token tracking)
- Available tools (in MCP format)
- MCP server connections
- Total cost tracking

```typescript
const context = new Context();
context.addTool(weatherTool);
context.addMCPServer("filesystem", { transport: "stdio", command: "mcp-fs" });

// Provider-agnostic conversations
claude.ask("Hello", { context });
openai.ask("Follow up", { context }); // Same context, different provider

// Cost tracking (context tracks model/provider for each message)
console.log(context.getTotalCost()); // Total cost across all providers/models
console.log(context.getTokenUsage()); // Aggregated token counts
```

## API Design

### Ask Method

```typescript
interface UserInput {
  content?: string; // Optional text content
  toolResults?: ToolResult[]; // Optional tool results from previous tool calls
  attachments?: Attachment[]; // Optional attachments for multimodal models
}

interface Attachment {
  type: 'image' | 'file';
  data: string | Buffer; // base64 string or buffer
  mimeType: string;
  name?: string;
}

interface AskOptions {
  context?: Context;
  onChunk?: (content: string) => void; // Streaming callback for user-facing content
  onThinkingChunk?: (thinking: string) => void; // Streaming callback for internal reasoning (if supported)
}

type AskResult =
  | { type: 'success'; response: ChatResponse }
  | { type: 'tool_call'; toolCalls: ToolCall[] }
  | { type: 'model_error'; error: ModelError }
  | { type: 'tool_error'; error: ToolError; toolCall: ToolCall };

interface ChatResponse {
  content: string;
  thinking?: string; // Internal reasoning content (if available from provider)
  tokens: TokenUsage;
  cost: number;
  stopReason?: 'max_tokens' | 'stop_sequence' | 'tool_call' | 'complete';
  truncated?: boolean; // For providers that can't continue
}

interface TokenUsage {
  input: number;
  output: number;
}
```

### Automatic Continuation

For providers that support continuation (when `stopReason` is `max_tokens`):

```typescript
// Client automatically continues and merges responses
const response = await claude.ask("Write a long essay", { context });
// If truncated due to max tokens, client automatically:
// 1. Adds partial response to context
// 2. Sends continuation request
// 3. Merges responses into single context message
// 4. Returns combined response with aggregated token counts
```

For providers without continuation support, responses are marked as `truncated: true` for future handling.

### Tool Execution Flow

```typescript
const result = await claude.ask("Book flight and check weather", { context });

if (result.type === 'tool_call') {
  // Inspect all pending tool calls
  console.log(result.toolCalls);

  // Execute tools - results preserve original types and handle errors gracefully
  const weatherResult = await context.executeTool(result.toolCalls[0]);
  if (weatherResult.success) {
    // weatherResult.result can be any type (object, string, number, etc.)
    console.log('Weather data:', weatherResult.result);
  } else {
    // Handle tool execution error
    console.error('Tool failed:', weatherResult.error);
  }

  // Execute in parallel if needed - returns array of ToolExecutionResult
  const allResults = await context.executeTools(result.toolCalls);

  // Convert execution results to tool results for the LLM
  import { toToolResult } from 'lemmy';
  const toolResults = allResults.map(toToolResult);

  // Option 1: Send tool results with additional user message
  const finalResult = await claude.ask({
    content: "Based on these results, please continue.",
    toolResults
  }, { context });

  // Option 2: Send tool results only (no additional text)
  const finalResult = await claude.ask({ toolResults }, { context });

  // Option 3: Send tool results with multimodal content
  const finalResult = await claude.ask({
    content: "What's in this image and based on the tool results?",
    toolResults,
    attachments: [{
      type: 'image',
      data: base64ImageData,
      mimeType: 'image/jpeg'
    }]
  }, { context });
}
```

## Token and Cost Tracking

### Message-Level Tracking

```typescript
interface UserMessage {
  role: 'user';
  content?: string; // Optional text content
  toolResults?: ToolResult[]; // Optional tool results
  attachments?: Attachment[]; // Optional attachments
  tokenCount: number; // Total tokens for this message
  provider: string; // Which provider/model was used for this request
  model: string; // Which model was used (for cost calculation)
  timestamp: Date;
}

interface AssistantMessage {
  role: 'assistant';
  content?: string; // Optional text content
  toolCalls?: ToolCall[]; // Optional tool calls made by assistant
  tokenCount: number; // Total tokens for this message
  provider: string; // Which provider generated this message
  model: string; // Which model generated this message
  timestamp: Date;
}

interface SystemMessage {
  role: 'system';
  content: string; // System messages always have content
  tokenCount: number; // Total tokens for this message
  provider: string; // Which provider/model was used
  model: string; // Which model was used
  timestamp: Date;
}

type Message = UserMessage | AssistantMessage | SystemMessage;
```

### Context-Level Aggregation

```typescript
class Context {
  // Calculate cost on-the-fly from all messages using model registry lookup
  getTotalCost(): number; // Sums cost across all messages, 0 for unknown models
  getTokenUsage(): TokenUsage;
  getCostByProvider(): Record<string, number>;
  getCostByModel(): Record<string, number>;
  getTokensByProvider(): Record<string, TokenUsage>;
  getTokensByModel(): Record<string, TokenUsage>;

  private calculateMessageCost(message: Message): number {
    // Look up model in registry, return 0 if not found (custom/local models)
    const modelData = this.findModelData(message.model);
    if (!modelData?.pricing) return 0;

    // System and user messages are input tokens, assistant messages are output tokens
    if (message.role === 'system' || message.role === 'user') {
      return (message.tokenCount * modelData.pricing.inputPerMillion) / 1_000_000;
    } else if (message.role === 'assistant') {
      return (message.tokenCount * modelData.pricing.outputPerMillion) / 1_000_000;
    }

    return 0;
  }
}
```

### Client Message Creation

```typescript
// Clients attach model/provider info and token counts to messages
class AnthropicClient implements ChatClient {
  async ask(input: string | UserInput, options: AskOptions): Promise<AskResult> {
    // Convert input to UserInput format
    const userInput: UserInput = typeof input === 'string'
      ? { content: input }
      : input;

    // Add user message to context first
    if (options.context) {
      const userMessage: UserMessage = {
        role: 'user',
        ...(userInput.content !== undefined && { content: userInput.content }),
        ...(userInput.toolResults !== undefined && { toolResults: userInput.toolResults }),
        ...(userInput.attachments !== undefined && { attachments: userInput.attachments }),
        tokenCount: 0, // Will be updated with actual usage
        provider: this.getProvider(),
        model: this.getModel(),
        timestamp: new Date()
      };
      options.context.addMessage(userMessage);
    }

    // ... make API call ...

    // Create assistant message with model/provider info for cost tracking
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: response.content,
      ...(response.toolCalls && { toolCalls: response.toolCalls }),
      tokenCount: response.tokens.input + response.tokens.output, // Total tokens used
      provider: this.getProvider(),
      model: this.getModel(),
      timestamp: new Date()
    };

    // Add assistant message to context - Context calculates cost on-the-fly
    options.context?.addMessage(assistantMessage);
  }
}
```

## Tool System

### Tool Definition with Zod

```typescript
const weatherTool = defineTool({
  name: "get_weather",
  description: "Get current weather for a location",
  schema: z.object({
    location: z.string().describe("City name or zip code"),
    units: z.enum(["celsius", "fahrenheit"]).optional()
  }),
  execute: async (args) => {
    // args is automatically typed, return type is preserved
    const weatherData = await fetchWeather(args.location, args.units);
    return weatherData; // Can return any type (object, string, number, etc.)
  }
});

// Zero-argument tools are fully supported
const pingTool = defineTool({
  name: "ping",
  description: "Ping the server",
  schema: z.object({}), // Empty schema for zero arguments
  execute: async () => "pong" // Returns string
});

context.addTool(weatherTool);
context.addTool(pingTool);
```

### Type-Safe Tool Return Values

Lemmy's tool system preserves the exact return type of tool execution functions, allowing for flexible data handling while maintaining type safety:

```typescript
// Tools can return different types
const calculatorTool = defineTool({
  name: "calculate",
  description: "Perform arithmetic",
  schema: z.object({
    operation: z.enum(["add", "multiply"]),
    a: z.number(),
    b: z.number()
  }),
  execute: async (args) => {
    // Return type is inferred as number
    return args.operation === "add" ? args.a + args.b : args.a * args.b;
  }
});

const userTool = defineTool({
  name: "get_user",
  description: "Get user information",
  schema: z.object({ id: z.string() }),
  execute: async (args) => {
    // Return type is inferred as object
    return {
      id: args.id,
      name: "John Doe",
      email: "john@example.com",
      created: new Date()
    };
  }
});

// Execute with preserved types
const calcResult = await validateAndExecute(calculatorTool, toolCall);
// calcResult.result is typed as number

const userResult = await validateAndExecute(userTool, toolCall);
// userResult.result is typed as { id: string, name: string, email: string, created: Date }

// Convert to string for LLM when needed
import { resultToString } from 'lemmy';
const llmString = resultToString(userResult.result);
// Converts objects to formatted JSON, numbers to strings, etc.
```

### MCP Server Integration

Uses the official MCP TypeScript SDK for client connections:

```typescript
// Explicit registration at context level using MCP TypeScript SDK
context.addMCPServer("filesystem", {
  transport: "stdio",
  command: "mcp-fs"
});

// Or SSE transport
context.addMCPServer("web-service", {
  transport: "sse",
  url: "http://localhost:3000/sse"
});

// MCP tools automatically available alongside native tools
// Uses @modelcontextprotocol/sdk for client implementation
```

### Tool Format Conversion

Lemmy automatically converts Zod schemas to provider-specific formats:

```typescript
// Zod schema → OpenAI format
{
  "name": "get_weather",
  "description": "Get weather",
  "parameters": zodSchema.toJsonSchema()
}

// Zod schema → Anthropic format
{
  "name": "get_weather",
  "description": "Get weather",
  "input_schema": zodSchema.toJsonSchema()
}

// Zod schema → MCP format
{
  "name": "get_weather",
  "description": "Get weather",
  "inputSchema": zodSchema.toJsonSchema()
}
```

## Model Management

### Code Generation from ruby_llm

A script `scripts/update-models.js` generates TypeScript types and runtime data:

```typescript
// Generated in src/model-registry.ts

// Types
export type AnthropicModels = 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022';
export type OpenAIModels = 'gpt-4o' | 'gpt-4o-mini';
export type GoogleModels = 'gemini-1.5-pro' | 'gemini-1.5-flash';
export type OllamaModels = string; // Dynamic/user-defined

// Runtime data
export const AnthropicModelData = {
  'claude-3-5-sonnet-20241022': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsContinuation: true,
    pricing: { inputPerMillion: 3, outputPerMillion: 15 }
  }
} as const;

// Model-to-provider mapping
export const ModelToProvider = {
  'claude-3-5-sonnet-20241022': 'anthropic',
  'gpt-4o': 'openai',
} as const;

// Union types
export type AllModels = AnthropicModels | OpenAIModels | GoogleModels | OllamaModels;
```

### Type-Safe Model Factory for CLI Usage

Implemented in `src/index.ts` alongside the main lemmy API:

```typescript
// CLI usage
const client = createClientForModel('claude-3-5-sonnet-20241022', {
  apiKey: '...' // TypeScript knows this needs AnthropicConfig
});
```

## Configuration

### Provider-Specific Configuration

```typescript
// Each provider has its own config interface
interface AnthropicConfig {
  apiKey: string;
  model: AnthropicModels;
  baseURL?: string;
  maxRetries?: number;
  // Anthropic-specific thinking configuration
  thinking?: {
    enabled: boolean;
    budgetTokens?: number; // Optional budget for thinking tokens (auto-managed if not specified)
  };
}

interface OpenAIConfig {
  apiKey: string;
  model: OpenAIModels;
  organization?: string;
  baseURL?: string;
  maxRetries?: number;
  // OpenAI-specific options
}

interface GoogleConfig {
  apiKey: string;
  model: GoogleModels;
  projectId?: string;
  // Google-specific options
}

interface OllamaConfig {
  model: string; // User-defined local models
  baseURL?: string;
  // Ollama-specific options
}
```

### Client Creation

```typescript
// Model specified at client creation
const claude = lemmy.anthropic({
  apiKey: 'sk-...',
  model: 'claude-3-5-sonnet-20241022',
  baseURL: 'custom-endpoint',
  thinking: {
    enabled: true,
    budgetTokens: 3000 // Optional - auto-calculated if not specified
  }
});
```

## Extended Thinking and Reasoning

Lemmy supports internal reasoning/thinking capabilities where available (e.g., Anthropic's extended thinking, OpenAI's reasoning models).

### Provider-Specific Thinking Configuration

```typescript
// Anthropic Claude with extended thinking
const claude = lemmy.anthropic({
  apiKey: 'sk-...',
  model: 'claude-3-5-sonnet-20241022', // Note: thinking only supported on specific models
  thinking: {
    enabled: true,
    budgetTokens: 3000 // Optional - lemmy auto-manages token allocation
  }
});

// OpenAI with reasoning models (future)
const openai = lemmy.openai({
  apiKey: 'sk-...',
  model: 'o1-preview', // Reasoning models
  reasoning: { enabled: true } // Provider-specific configuration
});
```

### Thinking API Usage

```typescript
const result = await claude.ask("Solve this complex problem step by step", {
  context,
  onChunk: (content) => console.log("Response:", content),
  onThinkingChunk: (thinking) => console.log("Thinking:", thinking)
});

if (result.type === 'success') {
  console.log("Final response:", result.response.content);
  if (result.response.thinking) {
    console.log("Internal reasoning:", result.response.thinking);
  }
  // Token costs include thinking tokens automatically
  console.log("Total cost:", result.response.cost);
}
```

### Key Features

- **Provider Agnostic**: Same API works across different reasoning-capable providers
- **Streaming Support**: Real-time thinking chunks via `onThinkingChunk`
- **Automatic Token Management**: Lemmy handles token budget allocation intelligently
- **Cost Tracking**: Thinking tokens included in accurate cost calculation
- **Graceful Degradation**: Handles models/providers that don't support thinking
- **Optional Usage**: Thinking is opt-in and doesn't affect standard usage

## Streaming

All clients use streaming internally for performance. Optional callbacks for real-time UI updates:

```typescript
const response = await claude.ask("Solve this step by step: What is 15 * 23?", {
  context,
  onChunk: (content: string) => updateUI(content), // Optional streaming for user-facing content
  onThinkingChunk: (thinking: string) => showThinking(thinking) // Optional streaming for internal reasoning
});
// ask() still returns complete final response with aggregated tokens/cost
// response.thinking contains full internal reasoning (if supported by provider and enabled)
```

## Error Handling

### Structured Return Types

No callbacks - all error handling through explicit return types:

```typescript
const result = await claude.ask("Hello", { context });

switch (result.type) {
  case 'success':
    console.log(result.response);
    console.log(`Cost: $${result.response.cost}`);
    break;
  case 'model_error':
    // Handle API failures, rate limits, etc.
    // Can retry, abort, or escalate
    if (result.error.retryable) {
      // Retry logic
    }
    break;
  case 'tool_error':
    // Tool execution failed
    // Can feed error to model or abort
    break;
  case 'tool_call':
    // Model wants to execute tools
    // User decides which tools to execute
    break;
}
```

### Error Categories

```typescript
interface ModelError {
  type: 'rate_limit' | 'auth' | 'network' | 'api_error' | 'invalid_request';
  message: string;
  retryable: boolean;
  retryAfter?: number; // For rate limits
}

interface ToolError {
  type: 'execution_failed' | 'invalid_args' | 'mcp_error';
  message: string;
  toolName: string;
}
```

## Project Structure

### Monorepo with Workspaces

```
lemmy/
├── package.json (workspace root)
├── docs/
│   ├── spec.md
│   ├── plan.md
│   └── chats/
├── packages/
│   └── lemmy/
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── models.ts (generated)
│       │   ├── types.ts
│       │   ├── context.ts
│       │   ├── clients/
│       │   │   ├── anthropic.ts
│       │   │   ├── openai.ts
│       │   │   ├── google.ts
│       │   │   └── ollama.ts
│       │   └── tools/
│       │       ├── index.ts
│       │       └── zod-converter.ts
│       ├── test/
│       │   ├── clients/
│       │   │   ├── shared-client-tests.ts
│       │   │   ├── anthropic.test.ts
│       │   │   └── openai.test.ts
│       │   ├── context.test.ts
│       │   ├── context-tools.test.ts
│       │   ├── models.test.ts
│       │   ├── types.test.ts
│       │   └── tools/
│       │       ├── index.test.ts
│       │       └── converters.test.ts
│       ├── dist/
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       └── vitest.config.ts
├── examples/
│   └── cli-chat/
│       ├── package.json (private: true)
│       ├── src/
│       │   └── index.ts
│       └── tsconfig.json
└── scripts/
    └── update-models.js
```

### Workspace Configuration

```json
{
  "name": "lemmy-monorepo",
  "workspaces": [
    "packages/lemmy",
    "examples/*"
  ]
}
```

Examples use workspace dependencies:

```json
{
  "name": "lemmy-cli-example",
  "private": true,
  "dependencies": {
    "lemmy": "workspace:*"
  }
}
```

## Build and Testing

### Dual Package (ESM + CommonJS)

```typescript
// tsup.config.ts
export default {
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['zod']
}
```

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

### Testing with Vitest

```typescript
// test/tools/weather.test.ts
import { describe, it, expect } from 'vitest';

describe('weather tool', () => {
  it('should fetch weather data', async () => {
    const result = await weatherTool.execute({ location: 'NYC' });
    expect(result).toBeDefined();
  });

  it('should calculate cost correctly', async () => {
    const context = new Context();
    const claude = lemmy.anthropic({ apiKey: 'test', model: 'claude-3-5-sonnet-20241022' });

    // Mock response with known token counts
    const result = await claude.ask("Hello", { context });
    expect(result.response.cost).toBeGreaterThan(0);
  });
});
```

**Test Execution:**
- **VS Code**: Vitest extension automatically discovers and runs tests with inline results
- **CLI/CI**: npm scripts for test execution

```json
// packages/lemmy/package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Implementation Requirements

### Code Generation

1. **Script**: `scripts/update-models.js`
   - Fetch fresh data from ruby_llm models.json
   - Filter for text input/output models (ignore image-only)
   - Extract tool support and continuation capabilities
   - Generate TypeScript types and runtime data
   - Generate model-to-provider mappings

2. **Generated File**: `src/models.ts`
   - Provider-specific model type unions
   - Runtime model metadata objects with pricing
   - Model-to-provider mapping

### Provider Implementation

1. **Common Interface**: All providers implement `ChatClient`
2. **Message Translation**: Convert between provider-specific formats and unified message format
3. **Tool Format Conversion**: Convert Zod schemas to provider-specific tool definitions
4. **Streaming**: Always use streaming internally, expose via callbacks (content + thinking)
5. **Error Handling**: Map provider errors to unified error types
6. **Token Tracking**: Extract and normalize token usage from provider responses (including thinking tokens)
7. **Cost Calculation**: Use model pricing data to calculate costs (thinking tokens included)
8. **Automatic Continuation**: Handle max token responses by continuing automatically
9. **Truncation Handling**: Mark responses as truncated for providers without continuation
10. **Thinking Support**: Handle internal reasoning/thinking capabilities where available
11. **Zero-Argument Tools**: Robust handling of tools with no parameters

### Tool System

1. **Zod Integration**: Use Zod for schema definition and validation
2. **Type-Safe Return Values**: Full TypeScript inference of both input arguments and return types
3. **Flexible Return Types**: Tools can return any type (string, number, object, array, etc.)
4. **Zero-Argument Tools**: Full support for tools with empty parameter schemas using `z.object({})`
5. **MCP Compliance**: Generate MCP-compatible tool definitions
6. **Provider Mapping**: Convert to OpenAI, Anthropic, Google formats using libraries like `zod-to-json-schema`
7. **Execution Tracking**: Context tracks executed tools and results with preserved types
8. **String Conversion**: Helper functions to convert any result type to string for LLM consumption
9. **Error Handling**: Unified error handling for tool execution failures

### Context Management

1. **Message History**: Maintain conversation across providers with token tracking (including thinking tokens)
2. **Tool Registry**: Store available tools and their implementations with generic type support
3. **MCP Server Connections**: Manage external MCP server processes
4. **Provider Translation**: Convert messages between provider formats
5. **Cost Aggregation**: Calculate total costs on-the-fly from messages using model registry
6. **Tool Execution**: Execute tools with proper validation and error handling, preserving return types
7. **Type-Preserving Tool Storage**: Store and retrieve tools with full type information
8. **Zero-Argument Tool Support**: Handle tools with empty parameter schemas gracefully

## API Entry Points

```typescript
// src/index.ts
import { ModelToProvider, type AllModels } from './models';
import type { AnthropicConfig, OpenAIConfig, GoogleConfig, OllamaConfig } from './types';

// Main lemmy object
export const lemmy = {
  anthropic: (config: AnthropicConfig) => new AnthropicClient(config),
  openai: (config: OpenAIConfig) => new OpenAIClient(config),
  google: (config: GoogleConfig) => new GoogleClient(config),
  ollama: (config: OllamaConfig) => new OllamaClient(config),
};

// Type mapping from provider to config
type ProviderConfigs = {
  anthropic: AnthropicConfig;
  openai: OpenAIConfig;
  google: GoogleConfig;
  ollama: OllamaConfig;
};

// Derive config type from model name
type ConfigForModel<T extends AllModels> = ProviderConfigs[ModelToProvider[T]];

// Type-safe factory function for CLI usage
export function createClientForModel<T extends AllModels>(
  model: T,
  config: ConfigForModel<T>
): ChatClient {
  const provider = ModelToProvider[model];

  switch (provider) {
    case 'anthropic':
      return lemmy.anthropic({ ...config, model } as AnthropicConfig);
    case 'openai':
      return lemmy.openai({ ...config, model } as OpenAIConfig);
    case 'google':
      return lemmy.google({ ...config, model } as GoogleConfig);
    case 'ollama':
      return lemmy.ollama({ ...config, model } as OllamaConfig);
    default:
      throw new Error(`Unknown provider for model: ${model}`);
  }
}

// Core classes and utilities
export { Context, defineTool, toToolResult };

// Types
export type { ChatClient, AskResult, AskOptions, TokenUsage, ChatResponse };
export type { UserInput, Attachment, Message, UserMessage, AssistantMessage, SystemMessage };
export type { AllModels, AnthropicModels, OpenAIModels, GoogleModels };
export type { AnthropicConfig, OpenAIConfig, GoogleConfig, OllamaConfig };
```

## Development Workflow

1. **Setup**: `npm install` at root automatically links all workspaces
2. **Development**: VS Code sees entire monorepo, TypeScript resolves correctly
3. **Code Generation**: Run `node scripts/update-models.js` to refresh model data
4. **Testing**: `npm test` in packages/lemmy or root
5. **Building**: `npm run build` generates dual ESM/CJS packages
6. **Examples**: Always use local lemmy source via workspace dependencies

## Dependencies

### Core Dependencies
- `zod` - Schema validation and type generation
- `zod-to-json-schema` - Convert Zod schemas to JSON Schema for providers
- `@modelcontextprotocol/sdk` - Official MCP TypeScript SDK for client connections
- `@anthropic-ai/sdk` - Official Anthropic SDK for Claude integration

### Development Dependencies
- `vitest` - Testing framework
- `tsup` - Build tool for dual packaging
- `typescript` - TypeScript compiler

### Optional Dependencies
- MCP server implementations for specific use cases
