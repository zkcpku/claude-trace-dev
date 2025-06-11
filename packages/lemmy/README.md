# Lemmy

TypeScript library for building AI applications with multiple LLM providers. Unified interface, manual tool handling, and conversation management across Anthropic Claude, OpenAI, and Google Gemini.

## Quick Start

```bash
npm install @mariozechner/lemmy
```

```typescript
import { lemmy, Context } from "@mariozechner/lemmy";

// Create a client
const claude = lemmy.anthropic({
	apiKey: "sk-...",
	model: "claude-3-5-sonnet-20241022",
});

// Simple conversation
const result = await claude.ask("Hello!");
console.log(result.message.content);
```

## Conversation Management

```typescript
// Maintain context across multiple messages
const context = new Context();
context.setSystemMessage("You are a helpful coding assistant.");

await claude.ask("My name is Alice", { context });
const result = await claude.ask("What's my name?", { context });
// "Your name is Alice"

// Track costs automatically
console.log(`Total cost: $${context.getTotalCost()}`);
```

## Tools & Function Calling

```typescript
import { lemmy, Context, toAskInput } from "@mariozechner/lemmy";
import { z } from "zod";

// Define a tool
const calculator = {
	name: "calculator",
	description: "Perform basic math",
	schema: z.object({
		operation: z.enum(["add", "subtract", "multiply", "divide"]),
		a: z.number(),
		b: z.number(),
	}),
	execute: async ({ operation, a, b }) => {
		switch (operation) {
			case "add":
				return a + b;
			case "multiply":
				return a * b;
			// ...
		}
	},
});

// Add tool to context
context.addTool(calculator);

// Request tool usage
const result = await claude.ask("Calculate 15 + 27", { context });

// Handle tool calls manually (allows intercepting/modifying results)
if (result.type === "success" && result.stopReason === "tool_call") {
	// Execute tools and get results
	const toolResults = await context.executeTools(result.message.toolCalls);

	// Optionally intercept/modify results here
	if (toolResults[0].success) {
		console.log("Tool executed:", toolResults[0].result);
	} else {
		console.log("Tool failed:", toolResults[0].error.message);
	}

	// Send results back using helper function
	const finalResult = await claude.ask(toAskInput(toolResults), { context });

	console.log(finalResult.message.content); // "The result is 42"
}
```

## Multiple Providers

```typescript
// Switch providers mid-conversation
const openai = lemmy.openai({
	apiKey: "sk-...",
	model: "gpt-4o",
});

const google = lemmy.google({
	apiKey: "...",
	model: "gemini-1.5-pro",
});

// Same context works across all providers
await claude.ask("Start a story", { context });
await openai.ask("Continue the story", { context });
await google.ask("End the story", { context });
```

## Image Input

```typescript
const result = await claude.ask(
	{
		content: "Describe this image",
		attachments: [
			{
				type: "image",
				data: base64ImageData, // or Buffer
				mimeType: "image/jpeg",
			},
		],
	},
	{ context },
);
```

## Streaming & Thinking

```typescript
// Create client for thinking-enabled model
const claude = lemmy.anthropic({
	apiKey: "sk-...",
	model: "claude-3-5-sonnet-20241022",
});

// Stream responses with thinking enabled
await claude.ask("Solve this complex problem", {
	context,
	thinkingEnabled: true,
	onChunk: (content) => process.stdout.write(content),
	onThinkingChunk: (thinking) => console.log("Thinking:", thinking),
});

// OpenAI reasoning models
const o1 = lemmy.openai({
	apiKey: "sk-...",
	model: "o1-mini",
});

// Use reasoningEffort in ask options
await o1.ask("Complex problem", {
	context,
	reasoningEffort: "high", // low, medium, high
});
```

## Multi-step Tool Workflows

```typescript
// Handle complex tool workflows with loops
let currentResult = await claude.ask("Calculate compound interest then format result", { context });

while (currentResult.type === "success" && currentResult.stopReason === "tool_call") {
	const toolResults = await context.executeTools(currentResult.message.toolCalls);

	// Intercept and log each tool execution
	toolResults.forEach((result) => {
		if (result.success) {
			console.log(`Tool ${result.toolCallId}: Success`);
		} else {
			console.log(`Tool ${result.toolCallId}: Failed - ${result.error.message}`);
		}
	});

	currentResult = await claude.ask(toAskInput(toolResults), { context });
}

console.log(currentResult.message.content); // Final response
```

## Context Serialization

Contexts can be serialized to JSON for persistence and restored later:

```typescript
// Serialize context with tools and messages
const context = new Context();
context.setSystemMessage("You are a helpful assistant");
context.addTool(calculatorTool);

// Add some conversation history
await claude.ask("Calculate 15 + 27", { context });

// Serialize to JSON-compatible format
const serialized = context.serialize();
localStorage.setItem("conversation", JSON.stringify(serialized));

// Later: restore from serialized data
const restored = JSON.parse(localStorage.getItem("conversation"));
const newContext = Context.deserialize(restored, [calculatorTool]);

// Continue conversation with restored context
await claude.ask("What was that result again?", { context: newContext });
```

**Note**: Tool implementations with `execute` functions cannot be serialized. You must provide the original tool definitions when deserializing.

## What Doesn't Work Yet

- **MCP (Model Context Protocol)**: Not implemented yet
- **File attachments**: Only images supported currently
- **Tool call streaming**: Tool calls complete before being returned
- **Advanced retry logic**: Limited error recovery and backoff strategies
- **Prompt caching**: Not supported yet, so cost calculations don't account for cached prompt tokens (written/read cache hits)
- **Thinking capability detection**: Model registry doesn't indicate which models support thinking/reasoning modes

## Development

```bash
npm run dev          # Start TypeScript compilation in watch mode
npm run test:run     # Run tests
npm run typecheck    # Type checking
```

**Debugging**: Install the Vitest extension in VS Code for the best debugging experience. You can set breakpoints and debug individual tests by clicking the debug icons next to test functions.

### Generated Sources

This project includes automatically generated TypeScript files that should not be edited manually:

- `src/generated/models.ts` - Model definitions and pricing data from [ruby_llm](https://github.com/crmne/ruby_llm)

**Regenerating Sources:**

```bash
# Update model definitions from latest ruby_llm data
node scripts/update-models.js
```

### Key Modules

- `src/clients/` - Provider implementations (Anthropic, OpenAI, Google)
- `src/context.ts` - Conversation management with serialization
- `src/tools/` - Tool definition and execution system
- `src/model-registry.ts` - Model lookup and capabilities
- `src/types.ts` - Core TypeScript interfaces
- `src/configs.ts` - Zod configuration schemas
