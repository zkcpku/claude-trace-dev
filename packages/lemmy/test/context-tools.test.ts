import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Context } from "../src/context.js";
import { defineTool } from "../src/tools/index.js";
import type { ToolCall, UserMessage } from "../src/types.js";

describe("Context Tool Execution", () => {
	it("should execute a simple tool successfully", async () => {
		const context = new Context();

		// Define a simple calculator tool
		const calculatorTool = defineTool({
			name: "calculator",
			description: "Perform basic arithmetic",
			schema: z.object({
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			}),
			execute: async (args) => {
				switch (args.operation) {
					case "add":
						return args.a + args.b;
					case "subtract":
						return args.a - args.b;
					case "multiply":
						return args.a * args.b;
					case "divide":
						return args.a / args.b;
					default:
						throw new Error("Unknown operation");
				}
			},
		});

		context.addTool(calculatorTool);

		const toolCall: ToolCall = {
			id: "calc_1",
			name: "calculator",
			arguments: { operation: "add", a: 5, b: 3 },
		};

		const result = await context.executeTool(toolCall);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result).toBe(8);
		}
	});

	it("should handle tool validation errors gracefully", async () => {
		const context = new Context();

		const weatherTool = defineTool({
			name: "weather",
			description: "Get weather information",
			schema: z.object({
				location: z.string(),
				units: z.enum(["celsius", "fahrenheit"]).optional(),
			}),
			execute: async (args) => {
				return { temperature: 22, location: args.location, units: args.units || "celsius" };
			},
		});

		context.addTool(weatherTool);

		const toolCall: ToolCall = {
			id: "weather_1",
			name: "weather",
			arguments: { location: 123, units: "kelvin" }, // Invalid: location should be string, units invalid enum
		};

		const result = await context.executeTool(toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error.type).toBe("invalid_args");
			expect(result.error.toolName).toBe("weather");
			expect(result.error.message).toContain("Invalid arguments");
		}
	});

	it("should handle tool not found error", async () => {
		const context = new Context();

		const toolCall: ToolCall = {
			id: "missing_1",
			name: "non_existent_tool",
			arguments: {},
		};

		const result = await context.executeTool(toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error!.type).toBe("execution_failed");
			expect(result.error!.toolName).toBe("non_existent_tool");
			expect(result.error!.message).toContain("Tool not found");
		}
	});

	it("should handle tool execution errors gracefully", async () => {
		const context = new Context();

		const faultyTool = defineTool({
			name: "faulty",
			description: "A tool that always fails",
			schema: z.object({
				input: z.string(),
			}),
			execute: async (_args) => {
				throw new Error("Tool execution failed for some reason");
			},
		});

		context.addTool(faultyTool);

		const toolCall: ToolCall = {
			id: "faulty_1",
			name: "faulty",
			arguments: { input: "test" },
		};

		const result = await context.executeTool(toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error!.type).toBe("execution_failed");
			expect(result.error!.toolName).toBe("faulty");
			expect(result.error!.message).toContain("Tool execution failed for some reason");
		}
	});

	it("should execute multiple tools in parallel", async () => {
		const context = new Context();

		// Add multiple tools
		const mathTool = defineTool({
			name: "math",
			description: "Math operations",
			schema: z.object({
				operation: z.enum(["square", "double"]),
				value: z.number(),
			}),
			execute: async (args) => {
				await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
				return args.operation === "square" ? args.value * args.value : args.value * 2;
			},
		});

		const stringTool = defineTool({
			name: "string",
			description: "String operations",
			schema: z.object({
				operation: z.enum(["uppercase", "reverse"]),
				text: z.string(),
			}),
			execute: async (args) => {
				await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
				return args.operation === "uppercase" ? args.text.toUpperCase() : args.text.split("").reverse().join("");
			},
		});

		context.addTool(mathTool);
		context.addTool(stringTool);

		const toolCalls: ToolCall[] = [
			{ id: "math_1", name: "math", arguments: { operation: "square", value: 4 } },
			{ id: "string_1", name: "string", arguments: { operation: "uppercase", text: "hello" } },
			{ id: "math_2", name: "math", arguments: { operation: "double", value: 7 } },
		];

		const startTime = Date.now();
		const results = await context.executeTools(toolCalls);
		const endTime = Date.now();

		// Should complete in parallel (much faster than serial execution)
		expect(endTime - startTime).toBeLessThan(50); // Should be ~10ms, not 30ms

		expect(results).toHaveLength(3);

		// Check first result
		expect(results[0]?.success).toBe(true);
		if (results[0]?.success) {
			expect(results[0]?.result).toBe(16); // 4 squared
		}

		// Check second result
		expect(results[1]?.success).toBe(true);
		if (results[1]?.success) {
			expect(results[1]?.result).toBe("HELLO");
		}

		// Check third result
		expect(results[2]?.success).toBe(true);
		if (results[2]?.success) {
			expect(results[2]?.result).toBe(14); // 7 doubled
		}
	});

	it("should handle mixed success and failure in parallel execution", async () => {
		const context = new Context();

		const reliableTool = defineTool({
			name: "reliable",
			description: "Always works",
			schema: z.object({ value: z.number() }),
			execute: async (args) => args.value * 10,
		});

		const unreliableTool = defineTool({
			name: "unreliable",
			description: "Sometimes fails",
			schema: z.object({ shouldFail: z.boolean() }),
			execute: async (args) => {
				if (args.shouldFail) {
					throw new Error("Intentional failure");
				}
				return "success";
			},
		});

		context.addTool(reliableTool);
		context.addTool(unreliableTool);

		const toolCalls: ToolCall[] = [
			{ id: "reliable_1", name: "reliable", arguments: { value: 5 } },
			{ id: "unreliable_1", name: "unreliable", arguments: { shouldFail: true } },
			{ id: "reliable_2", name: "reliable", arguments: { value: 3 } },
			{ id: "unreliable_2", name: "unreliable", arguments: { shouldFail: false } },
		];

		const results = await context.executeTools(toolCalls);

		expect(results).toHaveLength(4);

		// First tool: success
		expect(results[0]?.success).toBe(true);
		if (results[0]?.success) {
			expect(results[0]?.result).toBe(50);
		}

		// Second tool: failure
		expect(results[1]?.success).toBe(false);
		if (!results[1]?.success) {
			expect(results[1]?.error?.type).toBe("execution_failed");
			expect(results[1]?.error?.message).toContain("Intentional failure");
		}

		// Third tool: success
		expect(results[2]?.success).toBe(true);
		if (results[2]?.success) {
			expect(results[2]?.result).toBe(30);
		}

		// Fourth tool: success
		expect(results[3]?.success).toBe(true);
		if (results[3]?.success) {
			expect(results[3]?.result).toBe("success");
		}
	});

	it("should add tool results to conversation history via UserInput", async () => {
		const context = new Context();

		const testTool = defineTool({
			name: "test",
			description: "Test tool",
			schema: z.object({ value: z.string() }),
			execute: async (args) => ({ processed: args.value.toUpperCase() }),
		});

		context.addTool(testTool);

		// Execute tool and convert result to ToolResult format
		const toolCall: ToolCall = {
			id: "test_1",
			name: "test",
			arguments: { value: "hello" },
		};

		const result = await context.executeTool(toolCall);
		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Tool execution failed");
		}
		// Convert execution result to ToolResult and add via UserMessage
		const toolResults = [
			{
				toolCallId: "test_1",
				content: JSON.stringify(result.result),
			},
		];

		// Add user message with tool results
		const userMessage: UserMessage = {
			role: "user",
			toolResults,
			timestamp: new Date(),
		};

		context.addMessage(userMessage);

		const messages = context.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0]?.role).toBe("user");
		const userMsg = messages[0] as UserMessage;
		expect(userMsg.toolResults).toHaveLength(1);
		expect(userMsg.toolResults?.[0]?.toolCallId).toBe("test_1");
		expect(JSON.parse(userMsg.toolResults?.[0]?.content || "")).toEqual({ processed: "HELLO" });
	});

	it("should add multiple tool results at once via UserInput", async () => {
		const context = new Context();

		const numberTool = defineTool({
			name: "number",
			description: "Process numbers",
			schema: z.object({ value: z.number() }),
			execute: async (args) => args.value * 2,
		});

		context.addTool(numberTool);

		const toolCalls: ToolCall[] = [
			{ id: "num_1", name: "number", arguments: { value: 5 } },
			{ id: "num_2", name: "number", arguments: { value: 10 } },
		];

		const results = await context.executeTools(toolCalls);

		// Convert all results to ToolResult format
		const toolResults = results.map((result, index) => ({
			toolCallId: toolCalls[index]!.id,
			content: result.success ? String(result.result) : `Error: ${result.error?.message || "Unknown error"}`,
		}));

		// Add user message with all tool results
		const userMessage: UserMessage = {
			role: "user",
			toolResults,
			timestamp: new Date(),
		};

		context.addMessage(userMessage);

		const messages = context.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0]?.role).toBe("user");
		const userMsg = messages[0] as UserMessage;
		expect(userMsg.toolResults).toHaveLength(2);

		expect(userMsg.toolResults?.[0]?.toolCallId).toBe("num_1");
		expect(userMsg.toolResults?.[0]?.content).toBe("10");

		expect(userMsg.toolResults?.[1]?.toolCallId).toBe("num_2");
		expect(userMsg.toolResults?.[1]?.content).toBe("20");
	});

	it("should handle zero-argument tools", async () => {
		const context = new Context();

		const pingTool = defineTool({
			name: "ping",
			description: "Ping the server",
			schema: z.object({}), // Empty schema for zero arguments
			execute: async () => "pong",
		});

		context.addTool(pingTool);

		const toolCall: ToolCall = {
			id: "ping_1",
			name: "ping",
			arguments: {},
		};

		const result = await context.executeTool(toolCall);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result).toBe("pong");
		}
	});

	it("should serialize and deserialize context with tools and execute them", async () => {
		const context = new Context();
		context.setSystemMessage("Test serialization");

		const calculatorTool = defineTool({
			name: "calculator",
			description: "Perform basic arithmetic",
			schema: z.object({
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			}),
			execute: async (args) => {
				switch (args.operation) {
					case "add":
						return args.a + args.b;
					case "subtract":
						return args.a - args.b;
					case "multiply":
						return args.a * args.b;
					case "divide":
						return args.a / args.b;
					default:
						throw new Error("Unknown operation");
				}
			},
		});

		context.addTool(calculatorTool);

		// Add a message
		const userMessage: UserMessage = {
			role: "user",
			content: "Calculate 5 + 3",
			timestamp: new Date(),
		};
		context.addMessage(userMessage);

		// Serialize the context
		const serialized = context.serialize();
		expect(serialized.tools).toHaveLength(1);
		expect(serialized.tools[0]!.name).toBe("calculator");
		expect(serialized.messages).toHaveLength(1);

		// Deserialize with tools
		const restored = Context.deserialize(serialized, [calculatorTool]);
		expect(restored.listTools()).toHaveLength(1);
		expect(restored.getMessages()).toHaveLength(1);
		expect(restored.getSystemMessage()).toBe("Test serialization");

		// Execute tool on restored context
		const toolCall: ToolCall = {
			id: "calc_1",
			name: "calculator",
			arguments: { operation: "add", a: 5, b: 3 },
		};

		const result = await restored.executeTool(toolCall);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result).toBe(8);
		}
	});
});
