import OpenAI from "openai";
import type {
	ChatClient,
	AskOptions,
	AskResult,
	OpenAIConfig,
	Message,
	UserMessage,
	AssistantMessage,
	UserInput,
	TokenUsage,
	ModelError,
	ToolCall,
	StopReason,
} from "../types.js";
import { zodToOpenAI } from "../tools/zod-converter.js";
import { calculateTokenCost, findModelData } from "../index.js";

export interface OpenAIAskOptions extends AskOptions {
	reasoningEffort?: "low" | "medium" | "high";
}

export class OpenAIClient implements ChatClient {
	private openai: OpenAI;
	private config: OpenAIConfig;

	constructor(config: OpenAIConfig) {
		this.config = config;
		this.openai = new OpenAI({
			apiKey: config.apiKey,
			organization: config.organization,
			baseURL: config.baseURL,
			maxRetries: config.maxRetries ?? 3,
		});
	}

	getModel(): string {
		return this.config.model;
	}

	getProvider(): string {
		return "openai";
	}

	async ask(input: string | UserInput, options?: OpenAIAskOptions): Promise<AskResult> {
		const startTime = performance.now();
		try {
			// Convert input to UserInput format
			const userInput: UserInput = typeof input === "string" ? { content: input } : input;

			const userMessage: UserMessage = {
				role: "user",
				...(userInput.content !== undefined && {
					content: userInput.content,
				}),
				...(userInput.toolResults !== undefined && {
					toolResults: userInput.toolResults,
				}),
				...(userInput.attachments !== undefined && {
					attachments: userInput.attachments,
				}),
				timestamp: new Date(),
			};

			// Add user message to context
			if (options?.context) {
				options.context.addMessage(userMessage);
			}

			// Convert context messages to OpenAI format
			const messages = this.convertMessages(options?.context?.getMessages() || [userMessage]);
			const tools = options?.context?.listTools() || [];

			// Convert tools to OpenAI format
			const openaiTools = tools.map((tool: any) => zodToOpenAI(tool));

			// Calculate appropriate token limits
			const modelData = findModelData(this.config.model);
			const maxCompletionTokens =
				options?.maxOutputTokens || this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096;

			// Build request parameters
			const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
				model: this.config.model,
				max_completion_tokens: maxCompletionTokens,
				messages,
				stream: true,
				stream_options: { include_usage: true },
				...(openaiTools.length > 0 && {
					tools: openaiTools,
					tool_choice: "auto" as const,
				}),
				...((options?.reasoningEffort || this.config.reasoningEffort) && {
					reasoning_effort: options?.reasoningEffort || this.config.reasoningEffort,
				}),
			};

			// Execute streaming request
			const stream = await this.openai.chat.completions.create(requestParams);

			return await this.processStream(stream as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>, options, startTime);
		} catch (error) {
			return this.handleError(error);
		}
	}

	private convertMessages(contextMessages: readonly Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

		// Add context messages
		for (const msg of contextMessages) {
			if (msg.role === "user") {
				const contentBlocks: OpenAI.ChatCompletionContentPart[] = [];

				// Add text content if present
				if (msg.content?.trim()) {
					contentBlocks.push({ type: "text", text: msg.content });
				}

				// Add tool results if present
				if (msg.toolResults && msg.toolResults.length > 0) {
					for (const toolResult of msg.toolResults) {
						messages.push({
							role: "tool",
							tool_call_id: toolResult.toolCallId,
							content: toolResult.content,
						});
					}
				}

				// Add attachments if present
				if (msg.attachments && msg.attachments.length > 0) {
					for (const attachment of msg.attachments) {
						if (attachment.type === "image") {
							// Check if data is a URL
							const dataStr =
								typeof attachment.data === "string" &&
								(attachment.data.startsWith("http://") || attachment.data.startsWith("https://"))
									? attachment.data
									: `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`;

							contentBlocks.push({
								type: "image_url",
								image_url: {
									url: dataStr,
									// TODO: detail, needs to be piped through somehow, possibly per attachment..
								},
							});
						}
					}
				}

				if (msg.content?.trim() || (msg.attachments && msg.attachments.length > 0)) {
					messages.push({
						role: "user",
						content:
							contentBlocks.length === 1 && contentBlocks[0]?.type === "text"
								? contentBlocks[0].text
								: contentBlocks,
					});
				}
			} else if (msg.role === "assistant") {
				// Handle assistant messages with potential tool calls
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					// Create assistant message with tool calls
					const toolCalls = msg.toolCalls.map((toolCall: ToolCall) => ({
						id: toolCall.id,
						type: "function" as const,
						function: {
							name: toolCall.name,
							arguments: JSON.stringify(toolCall.arguments),
						},
					}));

					messages.push({
						role: "assistant",
						content: msg.content || null,
						tool_calls: toolCalls,
					});
				} else if (msg.content) {
					// Regular text-only assistant message
					messages.push({ role: "assistant", content: msg.content });
				}
			} else if (msg.role === "system") {
				// Add system messages at the beginning
				messages.unshift({ role: "system", content: msg.content });
			}
		}

		return messages;
	}

	private async processStream(
		stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
		options?: AskOptions,
		startTime?: number,
	): Promise<AskResult> {
		let content = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let stopReason: string | undefined;
		let toolCalls: ToolCall[] = [];
		const currentToolCalls = new Map<number, { id?: string; name?: string; arguments?: string }>();

		try {
			for await (const chunk of stream) {
				// Handle usage information (comes in final chunk with stream_options)
				if (chunk.usage) {
					inputTokens = chunk.usage.prompt_tokens || 0;
					outputTokens = chunk.usage.completion_tokens || 0;
				}

				const choice = chunk.choices?.[0];
				if (!choice) continue;

				// Handle content deltas
				if (choice.delta?.content) {
					const contentChunk = choice.delta.content;
					content += contentChunk;
					options?.onChunk?.(contentChunk);
				}

				// Handle tool call deltas
				if (choice.delta?.tool_calls) {
					for (const toolCallDelta of choice.delta.tool_calls) {
						const index = toolCallDelta.index!;

						if (!currentToolCalls.has(index)) {
							currentToolCalls.set(index, {});
						}

						const currentToolCall = currentToolCalls.get(index)!;

						if (toolCallDelta.id) {
							currentToolCall.id = toolCallDelta.id;
						}

						if (toolCallDelta.function) {
							if (toolCallDelta.function.name) {
								currentToolCall.name = toolCallDelta.function.name;
							}

							if (toolCallDelta.function.arguments) {
								currentToolCall.arguments =
									(currentToolCall.arguments || "") + toolCallDelta.function.arguments;
							}
						}
					}
				}

				// Handle finish reason
				if (choice.finish_reason) {
					stopReason = choice.finish_reason;
				}
			}

			// Process completed tool calls
			for (const [_, toolCallData] of currentToolCalls) {
				if (toolCallData.id && toolCallData.name) {
					try {
						let argsString = toolCallData.arguments || "{}";
						// Handle empty arguments (tools with no parameters)
						if (argsString.trim() === "") {
							argsString = "{}";
						}
						const parsedArgs = JSON.parse(argsString);
						toolCalls.push({
							id: toolCallData.id,
							name: toolCallData.name,
							arguments: parsedArgs,
						});
					} catch (error) {
						// Invalid JSON in tool arguments - we'll handle this as an error
						console.error("Failed to parse tool arguments:", error);
					}
				}
			}

			// If no usage info from streaming, estimate tokens
			if (inputTokens === 0 && outputTokens === 0 && content) {
				// Rough token estimation as fallback - very approximate
				inputTokens = Math.ceil(content.length / 6); // Conservative input estimate
				outputTokens = Math.ceil(content.length / 4); // Output tokens from response
			}

			// Calculate tokens and cost
			const tokens: TokenUsage = {
				input: inputTokens,
				output: outputTokens,
			};

			const cost = calculateTokenCost(this.config.model, tokens);

			// Calculate duration in seconds
			const endTime = performance.now();
			const took = startTime ? (endTime - startTime) / 1000 : 0;

			// Create assistant message with whatever was returned
			const assistantMessage: AssistantMessage = {
				role: "assistant",
				...(content && { content }),
				...(toolCalls.length > 0 && { toolCalls }),
				usage: tokens,
				provider: this.getProvider(),
				model: this.getModel(),
				timestamp: new Date(),
				took,
			};

			// Add assistant message to context
			if (options?.context) {
				options.context.addMessage(assistantMessage);
			}

			// Return successful response with the message
			const response: AskResult = {
				type: "success",
				stopReason: this.mapStopReason(stopReason) || "complete",
				message: assistantMessage,
				tokens,
				cost,
			};

			return response;
		} catch (error) {
			return this.handleError(error);
		}
	}

	private mapStopReason(reason: string | undefined): StopReason | undefined {
		switch (reason) {
			case "stop":
				return "complete";
			case "length":
				return "max_tokens";
			case "content_filter":
				return "stop_sequence";
			case "tool_calls":
				return "tool_call";
			default:
				return undefined;
		}
	}

	private handleError(error: unknown): AskResult {
		// Convert various error types to ModelError
		if (error instanceof Error && "status" in error) {
			const apiError = error as any; // Type assertion for OpenAI API error
			const modelError: ModelError = {
				type: this.getErrorType(apiError.status),
				message: apiError.message,
				retryable: this.isRetryable(apiError.status),
				...(this.getRetryAfter(apiError) !== undefined && {
					retryAfter: this.getRetryAfter(apiError)!,
				}),
			};
			return { type: "error", error: modelError };
		}

		// Handle other error types
		const modelError: ModelError = {
			type: "api_error",
			message: error instanceof Error ? error.message : "Unknown error",
			retryable: false,
		};
		return { type: "error", error: modelError };
	}

	private getErrorType(status?: number): ModelError["type"] {
		switch (status) {
			case 401:
				return "auth";
			case 429:
				return "rate_limit";
			case 400:
			case 404:
			case 422:
				return "invalid_request";
			default:
				return "api_error";
		}
	}

	private isRetryable(status?: number): boolean {
		return status === 429 || (status !== undefined && status >= 500);
	}

	private getRetryAfter(error: any): number | undefined {
		// Extract retry-after header if available
		const retryAfter = error.headers?.["retry-after"];
		if (retryAfter) {
			const seconds = parseInt(retryAfter, 10);
			return isNaN(seconds) ? undefined : seconds;
		}
		return undefined;
	}
}
