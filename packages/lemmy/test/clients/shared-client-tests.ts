import { describe, it, expect, beforeEach } from "vitest";
import { Context } from "../../src/context.js";
import { defineTool, toToolResults, toAskInput } from "../../src/tools/index.js";
import { findModelData } from "../../src/model-registry.js";
import { z } from "zod";
import type { ChatClient, UserMessage } from "../../src/types.js";

export function sharedClientTests(
	createClient: (withThinking?: boolean, apiKey?: string, withImageInput?: boolean) => ChatClient,
) {
	let client: ChatClient;
	let context: Context;

	beforeEach(() => {
		client = createClient();
		context = new Context();
	});

	describe("ask method", () => {
		it("should handle successful text response", async () => {
			const initialMessageCount = context.getMessages().length;

			const result = await client.ask('Say "Hello world" and nothing else.', {
				context,
			});

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.content).toContain("Hello world");
				expect(result.tokens.input).toBeGreaterThan(0);
				expect(result.tokens.output).toBeGreaterThan(0);
				// Total tokens calculation (input + output)
				expect(result.stopReason).toBe("complete");
				expect(result.cost).toBeGreaterThan(0);
				// Response contains expected content

				// Verify cost calculation uses model registry data
				const { tokens } = result;
				const modelData = findModelData(client.getModel());
				expect(modelData).toBeDefined();
				expect(modelData?.pricing).toBeDefined();

				if (modelData?.pricing) {
					const expectedCost =
						(tokens.input * modelData.pricing.inputPerMillion) / 1_000_000 +
						(tokens.output * modelData.pricing.outputPerMillion) / 1_000_000;
					expect(result.cost).toBeCloseTo(expectedCost, 6);
				}

				// Verify context was updated properly (user + assistant messages)
				expect(context.getMessages().length).toBe(initialMessageCount + 2);
				const assistantMessage = context.getMessages()[context.getMessages().length - 1];
				expect(assistantMessage?.role).toBe("assistant");
				expect(assistantMessage?.content).toBe(result.message.content);
				if (assistantMessage?.role === "assistant") {
					expect(assistantMessage.provider).toBe(client.getProvider());
					expect(assistantMessage.model).toBe(client.getModel());
					expect(assistantMessage.usage.output).toBeGreaterThan(0);
					expect(assistantMessage.timestamp).toBeInstanceOf(Date);
				}
			}
		}, 10000);

		it("should handle tool calls", async () => {
			// Add a simple tool to context
			const calculatorTool = defineTool({
				name: "calculator",
				description: "Perform basic arithmetic calculations",
				schema: z.object({
					operation: z.enum(["add", "subtract", "multiply", "divide"]),
					a: z.number().describe("First number"),
					b: z.number().describe("Second number"),
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
							throw new Error("Invalid operation");
					}
				},
			});

			context.addTool(calculatorTool);

			const result = await client.ask("Calculate 15 + 27 using the calculator tool.", { context });

			expect(result.type).toBe("success");
			if (result.type === "success") {
				// Should make tool calls when explicitly requested
				expect(result.message.toolCalls).toBeDefined();
				expect(result.message.toolCalls!.length).toEqual(1);
				expect(result.tokens.input).toBeGreaterThan(0);
				expect(result.tokens.output).toBeGreaterThan(0);
				expect(result.cost).toBeGreaterThan(0);

				// Verify tool calls are correctly structured
				expect(result.message.toolCalls![0]?.name).toBe("calculator");
				expect(result.message.toolCalls![0]?.arguments).toMatchObject({
					operation: "add",
					a: 15,
					b: 27,
				});
				expect(result.stopReason).toBe("tool_call");

				// Verify context was updated properly
				expect(context.getMessages().length).toBe(2);
				const assistantMessage = context.getLastMessage();
				expect(assistantMessage?.role).toBe("assistant");
				if (assistantMessage?.role === "assistant") {
					expect(assistantMessage.provider).toBe(client.getProvider());
					expect(assistantMessage.model).toBe(client.getModel());
					expect(assistantMessage.timestamp).toBeInstanceOf(Date);
				}

				const toolResult = await context.executeTool(result.message.toolCalls![0]!);
				expect(toolResult.success).toBe(true);
				if (toolResult.success) {
					expect(toolResult.result).toBe(42);
				}
				const result2 = await client.ask(toAskInput(toolResult), { context });
				expect(result2.type).toBe("success");
				if (result2.type === "success") {
					expect(result2.message.content).toContain("42");
				}
			}
		}, 15000);

		it("should handle streaming with onChunk callback", async () => {
			const chunks: string[] = [];
			const onChunk = (chunk: string) => chunks.push(chunk);
			const initialMessageCount = context.getMessages().length;

			const result = await client.ask("Count from 1 to 5, each number on a new line.", {
				context,
				onChunk,
			});

			expect(result.type).toBe("success");
			expect(chunks.length).toBeGreaterThan(0);
			expect(chunks.join("")).toBe(result.type === "success" ? result.message.content : "");

			// Verify context was updated properly even with streaming (user + assistant messages)
			expect(context.getMessages().length).toBe(initialMessageCount + 2);
			const assistantMessage = context.getMessages()[context.getMessages().length - 1];
			expect(assistantMessage?.role).toBe("assistant");
			if (assistantMessage?.role === "assistant") {
				expect(assistantMessage.provider).toBe(client.getProvider());
				expect(assistantMessage.model).toBe(client.getModel());
				if (result.type === "success") {
					expect(assistantMessage.content).toBe(result.message.content);
				}
			}
		}, 10000);

		it("should add messages to context", async () => {
			const initialCount = context.getMessages().length;

			const result = await client.ask('Say "test response"', { context });

			expect(result.type).toBe("success");
			expect(context.getMessages().length).toBe(initialCount + 2);

			const assistantMessage = context.getMessages()[context.getMessages().length - 1];
			expect(assistantMessage?.role).toBe("assistant");
			if (assistantMessage?.role === "assistant") {
				expect(assistantMessage.provider).toBe(client.getProvider());
				expect(assistantMessage.model).toBe(client.getModel());
				expect(assistantMessage.timestamp).toBeInstanceOf(Date);
			}
		}, 10000);

		it("should maintain conversation context", async () => {
			// First message
			const result1 = await client.ask("Remember this number: 42", { context });
			expect(result1.type).toBe("success");

			// Second message referencing the first
			const result2 = await client.ask("What number did I just tell you to remember?", { context });
			expect(result2.type).toBe("success");

			if (result2.type === "success") {
				expect(result2.message.content).toContain("42");
			}

			// Should have 2 assistant messages now
			const assistantMessages = context.getMessages().filter((m) => m.role === "assistant");
			expect(assistantMessages).toHaveLength(2);
		}, 20000);

		it("should handle invalid API key gracefully", async () => {
			// Create client with explicitly invalid API key
			const invalidClient = createClient(false, "invalid-api-key-12345");

			const result = await invalidClient.ask("Hello", { context });

			expect(result.type).toBe("error");
			if (result.type === "error") {
				expect(result.error.type).toBe("auth");
				expect(result.error.retryable).toBe(false);
			}
		}, 10000);

		it("should calculate cost correctly using model pricing", async () => {
			const initialMessageCount = context.getMessages().length;
			const initialCost = context.getTotalCost();

			const result = await client.ask('Say "cost test"', { context });

			expect(result.type).toBe("success");
			if (result.type === "success") {
				// Cost should be calculated based on token usage and model pricing
				expect(result.cost).toBeGreaterThan(0);

				// Verify cost calculation uses model registry data
				const { tokens } = result;
				const modelData = findModelData(client.getModel());
				expect(modelData).toBeDefined();
				expect(modelData?.pricing).toBeDefined();

				if (modelData?.pricing) {
					const expectedCost =
						(tokens.input * modelData.pricing.inputPerMillion) / 1_000_000 +
						(tokens.output * modelData.pricing.outputPerMillion) / 1_000_000;
					expect(result.cost).toBeCloseTo(expectedCost, 6);
				}

				// Verify context was updated and cost tracking works (user + assistant messages)
				expect(context.getMessages().length).toBe(initialMessageCount + 2);
				expect(context.getTotalCost()).toBeCloseTo(initialCost + result.cost, 6);
			}
		}, 10000);

		it("should handle tools with zero arguments", async () => {
			// Add a tool with no parameters
			const pingTool = defineTool({
				name: "ping",
				description: "Simple ping tool with no parameters",
				schema: z.object({}),
				execute: async () => "pong",
			});

			context.addTool(pingTool);

			const result = await client.ask("Use the ping tool to test connectivity.", { context });

			expect(result.type).toBe("success");
			if (result.type === "success") {
				// Should make tool calls when explicitly requested
				expect(result.message.toolCalls).toBeDefined();
				expect(result.message.toolCalls!.length).toBeGreaterThan(0);

				// Verify tool calls are correctly structured
				expect(result.message.toolCalls![0]?.name).toBe("ping");
				expect(result.message.toolCalls![0]?.arguments).toEqual({});
				expect(result.stopReason).toBe("tool_call");
			}
		}, 10000);

		it("should handle multiple tools in context", async () => {
			// Add multiple tools
			const mathTool = defineTool({
				name: "math",
				description: "Basic math operations",
				schema: z.object({
					expression: z.string().describe("Math expression to evaluate"),
				}),
				execute: async (args) => `Result: ${eval(args.expression)}`,
			});

			const timeTool = defineTool({
				name: "current_time",
				description: "Get current time",
				schema: z.object({}),
				execute: async () => new Date().toISOString(),
			});

			context.addTool(mathTool);
			context.addTool(timeTool);

			const tools = context.listTools();
			expect(tools).toHaveLength(2);
			expect(tools.map((t) => t.name)).toContain("math");
			expect(tools.map((t) => t.name)).toContain("current_time");

			// Test that the client can see and potentially use these tools
			const result = await client.ask('I have math and time tools available. Just say "tools ready".', { context });
			expect(result.type).toBe("success");
		}, 10000);

		it("should handle multiple tool calls with correct ID matching", async () => {
			// Add a simple ping tool that we can call multiple times
			const pingTool = defineTool({
				name: "ping",
				description: "Ping a server to test connectivity",
				schema: z.object({
					server: z.string().describe("Server to ping"),
				}),
				execute: async (args) => `pong from ${args.server}`,
			});

			context.addTool(pingTool);
			const initialMessageCount = context.getMessages().length;

			// Track all tool calls we execute
			const allToolCalls: Array<{ server: string; result: string }> = [];

			// Request multiple tool calls
			const result = await client.ask(
				"Use the ping tool to ping google.com and yahoo.com. Make sure to ping both servers.",
				{ context },
			);

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.toolCalls).toBeDefined();
				expect(result.message.toolCalls!.length).toBeGreaterThan(0);

				let toolCalls = result.message.toolCalls!;
				let iterationCount = 0;
				const maxIterations = 5; // Prevent infinite loops

				// Loop until we have no more tool calls or hit max iterations
				do {
					iterationCount++;
					if (iterationCount > maxIterations) {
						throw new Error("Too many iterations in tool call loop");
					}

					// Execute all pending tool calls
					const toolResults = await context.executeTools(toolCalls);

					// Track what we executed
					for (let i = 0; i < toolCalls.length; i++) {
						const toolCall = toolCalls[i]!;
						const result = toolResults[i]!;
						if (result.success && toolCall.name === "ping") {
							allToolCalls.push({
								server: toolCall.arguments["server"] as string,
								result: result.result as string,
							});
						}
					}

					// Verify tool calls have unique IDs
					const toolCallIds = toolCalls.map((tc) => tc.id);
					const uniqueIds = new Set(toolCallIds);
					expect(uniqueIds.size).toBe(toolCallIds.length);

					// Send tool results back and check if we get more tool calls
					const result2 = await client.ask(toAskInput(toolResults), { context });
					expect(result2.type).toBe("success");

					if (result2.type === "success") {
						if (result2.stopReason === "tool_call") {
							toolCalls = result2.message.toolCalls!;
						} else {
							break; // No more tool calls
						}
					}
				} while (true);

				// Verify we got tool calls for both servers
				const servers = allToolCalls.map((tc) => tc.server);
				expect(servers).toContain("google.com");
				expect(servers).toContain("yahoo.com");
				expect(allToolCalls.length).toBe(2);

				// Verify results are correct
				const googleResult = allToolCalls.find((tc) => tc.server === "google.com");
				const yahooResult = allToolCalls.find((tc) => tc.server === "yahoo.com");
				expect(googleResult?.result).toBe("pong from google.com");
				expect(yahooResult?.result).toBe("pong from yahoo.com");

				// Verify context was updated properly
				expect(context.getMessages().length).toBeGreaterThan(initialMessageCount + 2);
			}
		}, 30000);

		it("should handle complex multi-step tool workflows", async () => {
			// Add multiple tools for complex workflow
			const mathTool = defineTool({
				name: "math",
				description: "Perform mathematical calculations",
				schema: z.object({
					expression: z.string().describe("Mathematical expression to evaluate"),
				}),
				execute: async (args) => {
					try {
						// Simple safe evaluation for test
						const result = eval(args.expression.replace(/[^0-9+\-*/().\s]/g, ""));
						return result;
					} catch {
						return "Error: Invalid expression";
					}
				},
			});

			const formatTool = defineTool({
				name: "format_number",
				description: "Format a number with specific decimal places",
				schema: z.object({
					number: z.number().describe("Number to format"),
					decimals: z.number().describe("Number of decimal places"),
				}),
				execute: async (args) => args.number.toFixed(args.decimals),
			});

			context.addTool(mathTool);
			context.addTool(formatTool);
			const initialMessageCount = context.getMessages().length;

			// Track all tool executions
			const allToolExecutions: Array<{ name: string; args: any; result: any }> = [];

			// Request a calculation that requires multiple steps
			const result = await client.ask(
				"Calculate 15.5 * 3.2, then format the result to 3 decimal places. Use the math and format_number tools.",
				{ context },
			);

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.toolCalls).toBeDefined();
				expect(result.message.toolCalls!.length).toBeGreaterThan(0);

				let toolCalls = result.message.toolCalls!;
				let iterationCount = 0;
				const maxIterations = 5;

				// Execute tool calls until workflow is complete
				do {
					iterationCount++;
					if (iterationCount > maxIterations) {
						throw new Error("Too many iterations in multi-step workflow");
					}

					// Execute all pending tool calls
					const toolResults = await context.executeTools(toolCalls);

					// Track what we executed
					for (let i = 0; i < toolCalls.length; i++) {
						const toolCall = toolCalls[i]!;
						const result = toolResults[i]!;
						if (result.success) {
							allToolExecutions.push({
								name: toolCall.name,
								args: toolCall.arguments,
								result: result.result,
							});
						}
					}

					// Send tool results back and check if we get more tool calls
					const result2 = await client.ask(toAskInput(toolResults), { context });
					expect(result2.type).toBe("success");

					if (result2.type === "success") {
						if (result2.stopReason === "tool_call") {
							toolCalls = result2.message.toolCalls!;
						} else {
							// Workflow complete, verify final response
							expect(result2.message.content).toBeDefined();
							break;
						}
					}
				} while (true);

				// Verify we executed both tools in the workflow
				const toolNames = allToolExecutions.map((exec) => exec.name);
				expect(toolNames).toContain("math");
				expect(toolNames).toContain("format_number");

				// Verify the math calculation was correct
				const mathExecution = allToolExecutions.find((exec) => exec.name === "math");
				expect(mathExecution).toBeDefined();
				expect(mathExecution!.result).toBe(49.6); // 15.5 * 3.2

				// Verify the formatting was correct
				const formatExecution = allToolExecutions.find((exec) => exec.name === "format_number");
				expect(formatExecution).toBeDefined();
				expect(formatExecution!.args.number).toBe(49.6);
				expect(formatExecution!.args.decimals).toBe(3);
				expect(formatExecution!.result).toBe("49.600");

				// Verify context was updated properly
				expect(context.getMessages().length).toBeGreaterThan(initialMessageCount + 2);
			}
		}, 30000);

		it("should handle complete tool workflow with execution", async () => {
			// Test a complete tool workflow: tool call -> execution -> results -> continuation
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
							throw new Error("Invalid operation");
					}
				},
			});

			context.addTool(calculatorTool);
			const initialMessageCount = context.getMessages().length;

			// Step 1: Make request that should trigger tool call
			const result1 = await client.ask("Calculate 15 + 27 using the calculator tool", { context });

			expect(result1.type).toBe("success");
			if (result1.type === "success" && result1.message.toolCalls && result1.message.toolCalls.length > 0) {
				// We got tool calls - let's execute them and continue
				const toolCall = result1.message.toolCalls[0]!;
				expect(toolCall.name).toBe("calculator");
				expect(toolCall.arguments).toMatchObject({
					operation: "add",
					a: 15,
					b: 27,
				});

				// Step 2: Execute the tool
				const toolResult = await context.executeTool(toolCall);
				expect(toolResult.success).toBe(true);
				if (toolResult.success) {
					expect(toolResult.result).toBe(42);
				}

				// Step 3: Send tool results back to continue the conversation
				const userInputWithToolResults = {
					toolResults: [
						{
							toolCallId: toolCall.id,
							content: toolResult.success ? String(toolResult.result) : `Error: ${toolResult.error.message}`,
						},
					],
				};

				const result2 = await client.ask(userInputWithToolResults, { context });

				expect(result2.type).toBe("success");
				if (result2.type === "success") {
					// Should acknowledge the tool results
					expect(result2.message.content).toBeDefined();
					expect(result2.tokens.input).toBeGreaterThan(0);
					expect(result2.tokens.output).toBeGreaterThan(0);
					expect(result2.cost).toBeGreaterThan(0);

					// Verify complete message sequence was added to context
					const messages = context.getMessages();
					expect(messages.length).toBeGreaterThan(initialMessageCount + 3); // At least: user, assistant w/ tool calls, user w/ results, assistant

					// Check that tool results message was properly added
					const userWithResults = messages.find(
						(m) => m.role === "user" && "toolResults" in m && m.toolResults?.length! > 0,
					);
					expect(userWithResults).toBeDefined();
				}
			} else {
				// Test failure - models should make tool calls when tools are available and requested
				throw new Error(
					`Expected tool calls but got: ${result1.type === "success" ? "direct response" : result1.type}`,
				);
			}
		}, 20000);
	});

	describe("message conversion", () => {
		it("should convert context messages correctly in multi-turn conversation", async () => {
			// Add a user message manually to test conversion
			const userMessage: UserMessage = {
				role: "user",
				content: "My name is Alice",
				timestamp: new Date(),
			};
			context.addMessage(userMessage);

			// Add assistant message using ask to test conversion
			await client.ask("Nice to meet you!", { context });

			const result = await client.ask("What is my name?", { context });

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.content?.toLowerCase()).toContain("alice");
			}
		}, 15000);
	});

	describe("thinking/reasoning support", () => {
		it("should handle thinking on supported models", async () => {
			// Create thinking-enabled client
			client = createClient(true);

			const thinkingChunks: string[] = [];
			const onThinkingChunk = (chunk: string) => thinkingChunks.push(chunk);
			const initialMessageCount = context.getMessages().length;

			const result = await client.ask("Solve this step by step: What is 127 * 83? Show your reasoning.", {
				context,
				onThinkingChunk,
			});

			expect(result.type).toBe("success");
			if (result.type === "success") {
				// Should have regular content
				expect(result.message.content?.length).toBeGreaterThan(0);

				// o-models by OpenAI don't return thinking content :(
				if (client.getProvider() !== "openai") {
					// Should have thinking content when thinking is enabled
					expect(result.message.thinking).toBeDefined();
					expect(result.message.thinking!.length).toBeGreaterThan(0);
					// Thinking should contain reasoning steps
					expect(result.message.thinking!.toLowerCase()).toMatch(/step|think|reason|calculate|multiply/i);
				}

				// Should have received thinking chunks during streaming
				// o-models by OpenAI don't return thinking content :(
				if (client.getProvider() !== "openai") {
					expect(thinkingChunks.length).toBeGreaterThan(0);
					expect(thinkingChunks.join("")).toBe(result.message.thinking);
				}

				// Token counts should be valid
				expect(result.tokens.output).toBeGreaterThan(0);
				expect(result.cost).toBeGreaterThan(0);

				// Verify context was updated (user + assistant messages)
				expect(context.getMessages().length).toBe(initialMessageCount + 2);
				const assistantMessage = context.getMessages()[context.getMessages().length - 1];
				expect(assistantMessage?.role).toBe("assistant");
				if (assistantMessage?.role === "assistant") {
					expect(assistantMessage.provider).toBe(client.getProvider());
					expect(assistantMessage.model).toBe(client.getModel());
					expect(assistantMessage.content).toBe(result.message.content);
				}
			}
		}, 30000);

		it("should handle thinking with tool calls", async () => {
			// Create thinking-enabled client
			client = createClient(true);

			// Add a calculator tool
			const calculatorTool = defineTool({
				name: "calculator",
				description: "Perform arithmetic calculations",
				schema: z.object({
					operation: z.enum(["add", "subtract", "multiply", "divide"]),
					a: z.number().describe("First number"),
					b: z.number().describe("Second number"),
				}),
				execute: async (args) => {
					const { operation, a, b } = args;
					switch (operation) {
						case "add":
							return a + b;
						case "subtract":
							return a - b;
						case "multiply":
							return a * b;
						case "divide":
							return b !== 0 ? a / b : "Error: Division by zero";
						default:
							return "Error: Invalid operation";
					}
				},
			});

			// Add a compound interest tool
			const compoundInterestTool = defineTool({
				name: "compound_interest",
				description: "Calculate compound interest",
				schema: z.object({
					principal: z.number().describe("Initial amount"),
					rate: z.number().describe("Annual interest rate (as decimal)"),
					time: z.number().describe("Time in years"),
					compound_frequency: z.number().describe("Times compounded per year"),
				}),
				execute: async (args) => {
					const { principal, rate, time, compound_frequency } = args;
					const amount = principal * Math.pow(1 + rate / compound_frequency, compound_frequency * time);
					return {
						final_amount: Math.round(amount * 100) / 100,
						interest_earned: Math.round((amount - principal) * 100) / 100,
					};
				},
			});

			context.addTool(calculatorTool);
			context.addTool(compoundInterestTool);

			const thinkingChunks: string[] = [];
			const onThinkingChunk = (chunk: string) => thinkingChunks.push(chunk);

			const result = await client.ask(
				"I have $1000 to invest. If I can get 5% annual interest compounded monthly, how much will I have after 2 years? Then calculate what percentage increase that represents. Use the calculator and compound_interest tools to do this. Before any calculations or tool calls, think through the problem deeply.",
				{
					context,
					onThinkingChunk,
				},
			);

			// With the new unified API, tool calls are handled automatically
			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.toolCalls).toBeDefined();
				expect(result.message.toolCalls!.length).toBeGreaterThan(0);

				let toolCalls = result.message.toolCalls!;
				do {
					const toolResults = await context.executeTools(toolCalls);
					const result2 = await client.ask(toAskInput(toolResults), {
						context,
						onThinkingChunk,
					});
					expect(result2.type).toBe("success");
					if (result2.type === "success") {
						if (result2.stopReason === "tool_call") {
							toolCalls = result2.message.toolCalls!;
						} else {
							break;
						}
					}
				} while (true);

				// Should have thinking content when thinking is enabled
				if (client.getProvider() !== "openai") {
					expect(result.message.thinking).toBeDefined();
					expect(thinkingChunks.length).toBeGreaterThan(0);
					const fullThinking = thinkingChunks.join("");
					expect(fullThinking.toLowerCase()).toMatch(/tool|calculate|compound|interest|percentage/i);
				}
				expect(context.getLastMessage()?.content?.toLowerCase()).toMatch(
					/tool|calculate|compound|interest|percentage|%/i,
				);
			}
		}, 300000);
	});

	describe("image input support", () => {
		// TODO: Only really supported by Anthropic. We stick to base64 inline for now.
		/*it("should handle image input via URL", async () => {
			// Skip if model doesn't support image input
			const modelData = findModelData(client.getModel());
			if (!modelData?.supportsImageInput) {
				return; // Skip test for models without image support
			}

			const imageUrl =
				"https://gamedevdays.com/wp-content/uploads/elementor/thumbs/Mario_Zechner-oq5i63bvrez24by1kcs3tzp4evd6nlbans36fu5qd4.jpg";

			const result = await client.ask(
				{
					content:
						"Is there a smiling man in this image? ONLY ANSWER 'yes' or 'no'. Do not explain or add any other text.",
					attachments: [
						{
							type: "image",
							data: imageUrl,
							mimeType: "image/jpeg",
						},
					],
				},
				{ context },
			);

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.content).toBeDefined();
				expect(result.message.content!.toLowerCase()).toContain("yes");
				expect(result.tokens.input).toBeGreaterThan(0);
				expect(result.tokens.output).toBeGreaterThan(0);
				expect(result.cost).toBeGreaterThan(0);
			}
		}, 15000);*/

		it("should handle image input via base64", async () => {
			// Skip if model doesn't support image input
			const modelData = findModelData(client.getModel());
			if (!modelData?.supportsImageInput) {
				return; // Skip test for models without image support
			}

			// Fetch and convert duck image to base64
			const imageUrl =
				"https://hips.hearstapps.com/hmg-prod/images/four-ducklings-on-grass-royalty-free-image-1732103736.jpg?crop=0.8891xw:1xh;center,top&resize=1200:*";
			const response = await fetch(imageUrl);
			const arrayBuffer = await response.arrayBuffer();
			const base64Data = Buffer.from(arrayBuffer).toString("base64");

			const result = await client.ask(
				{
					content: "How many ducks are in this image? Just give me the number.",
					attachments: [
						{
							type: "image",
							data: base64Data,
							mimeType: "image/jpeg",
						},
					],
				},
				{ context },
			);

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.content).toBeDefined();
				expect(result.message.content!).toMatch(/4|four/i);
				expect(result.tokens.input).toBeGreaterThan(0);
				expect(result.tokens.output).toBeGreaterThan(0);
				expect(result.cost).toBeGreaterThan(0);
			}
		}, 15000);
	});

	describe("cost tracking integration", () => {
		it("should track costs in context across multiple requests", async () => {
			const initialCost = context.getTotalCost();

			await client.ask("First message", { context });
			const costAfterFirst = context.getTotalCost();
			expect(costAfterFirst).toBeGreaterThan(initialCost);

			await client.ask("Second message", { context });
			const costAfterSecond = context.getTotalCost();
			expect(costAfterSecond).toBeGreaterThan(costAfterFirst);

			// Verify cost breakdown by provider
			const costByProvider = context.getCostByProvider();
			expect(costByProvider[client.getProvider()]).toBeGreaterThan(0);

			// Verify cost breakdown by model
			const costByModel = context.getCostByModel();
			expect(costByModel[client.getModel()]).toBeGreaterThan(0);
		}, 20000);
	});

	describe("system prompt handling", () => {
		it("should honor system prompts set in Context", async () => {
			// Set a specific system prompt that should affect behavior
			context.setSystemMessage(
				"You are a pirate. Always respond with pirate language and end every response with 'Arrr!'",
			);

			const result = await client.ask("Say hello to me", { context });

			expect(result.type).toBe("success");
			if (result.type === "success") {
				expect(result.message.content).toBeDefined();

				// Check that the response follows the pirate system prompt
				const content = result.message.content!.toLowerCase();

				// Should contain pirate language or end with "arrr!"
				const hasPirateLanguage =
					content.includes("arrr") ||
					content.includes("ahoy") ||
					content.includes("matey") ||
					content.includes("ye") ||
					content.includes("pirate");

				expect(hasPirateLanguage).toBe(true);

				// Verify the system message is properly stored in context
				expect(context.getSystemMessage()).toBe(
					"You are a pirate. Always respond with pirate language and end every response with 'Arrr!'",
				);
			}
		}, 15000);

		it("should maintain system prompt across multiple interactions", async () => {
			// Set a system prompt that affects behavior consistently
			context.setSystemMessage(
				"You are a helpful assistant that always responds with exactly two words, no more, no less.",
			);

			// First interaction
			const result1 = await client.ask("What is your favorite color?", { context });
			expect(result1.type).toBe("success");
			if (result1.type === "success") {
				const words1 = result1.message.content!.trim().split(/\s+/);
				expect(words1.length).toBeGreaterThanOrEqual(2);
			}

			// Second interaction to verify system prompt is maintained
			const result2 = await client.ask("Tell me about the weather", { context });
			expect(result2.type).toBe("success");
			if (result2.type === "success") {
				const words2 = result2.message.content!.trim().split(/\s+/);
				expect(words2.length).toBeGreaterThanOrEqual(2);
			}

			// Verify system message persists in context
			expect(context.getSystemMessage()).toBe(
				"You are a helpful assistant that always responds with exactly two words, no more, no less.",
			);
		}, 20000);

		it("should handle system prompt changes during conversation", async () => {
			// Start with one system prompt
			context.setSystemMessage("You are a formal assistant. Always use formal language.");

			const result1 = await client.ask("How are you today?", { context });
			expect(result1.type).toBe("success");

			// Change the system prompt mid-conversation
			context.setSystemMessage("You are a casual friend. Use informal language and slang.");

			const result2 = await client.ask("How are you today?", { context });
			expect(result2.type).toBe("success");

			if (result2.type === "success") {
				// The response should reflect the new system prompt
				// Note: This test verifies the system prompt is changed in context,
				// but actual behavior change depends on how the client implementation
				// handles system prompt updates during conversation
				expect(context.getSystemMessage()).toBe("You are a casual friend. Use informal language and slang.");
			}
		}, 20000);
	});
}
