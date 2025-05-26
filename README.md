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
import { defineTool, toUserInput } from "@mariozechner/lemmy";
import { z } from "zod";

// Define a tool
const calculator = defineTool({
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
	console.log("Tool executed:", toolResults[0].result);

	// Send results back using helper function
	const finalResult = await claude.ask(toUserInput(toolResults), { context });

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
// Enable thinking for supported models
const claude = lemmy.anthropic({
	apiKey: "sk-...",
	model: "claude-opus-4-20250514", // thinking-enabled model
	thinking: { enabled: true },
});

// Stream responses with thinking
await claude.ask("Solve this complex problem", {
	context,
	onChunk: (content) => process.stdout.write(content),
	onThinkingChunk: (thinking) => console.log("Thinking:", thinking),
});

// OpenAI reasoning models
const o1 = lemmy.openai({
	apiKey: "sk-...",
	model: "o1-mini",
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
		console.log(`Tool ${result.toolCallId}: ${result.success ? "Success" : "Failed"}`);
	});

	currentResult = await claude.ask(toUserInput(toolResults), { context });
}

console.log(currentResult.message.content); // Final response
```

## What Doesn't Work Yet

- **MCP (Model Context Protocol)**: Not implemented yet
- **File attachments**: Only images supported currently
- **Local models**: Ollama support removed temporarily
- **Tool call streaming**: Tool calls complete before being returned
- **Advanced retry logic**: Limited error recovery and backoff strategies

## Development

```bash
npm run test:run     # Run tests
npm run typecheck    # Type checking
```

See `examples/cli-chat` for a complete working example.
