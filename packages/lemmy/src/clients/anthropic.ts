import Anthropic from "@anthropic-ai/sdk";
import type {
	ChatClient,
	AskResult,
	AnthropicConfig,
	AnthropicAskOptions,
	Message,
	UserMessage,
	AssistantMessage,
	AskInput,
	TokenUsage,
	ModelError,
	ToolCall,
	StopReason,
} from "../types.js";
import { zodToAnthropic } from "../tools/zod-converter.js";
import { calculateTokenCost, findModelData } from "../index.js";

export class AnthropicClient implements ChatClient<AnthropicAskOptions> {
	private anthropic: Anthropic;
	private config: AnthropicConfig;

	constructor(config: AnthropicConfig) {
		this.config = config;
		this.anthropic = new Anthropic({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
			maxRetries: config.maxRetries ?? 3,
		});
	}

	getModel(): string {
		return this.config.model;
	}

	getProvider(): string {
		return "anthropic";
	}

	async ask(input: string | AskInput, options?: AnthropicAskOptions): Promise<AskResult> {
		const startTime = performance.now();
		try {
			// Convert input to AskInput format
			const userInput: AskInput = typeof input === "string" ? { content: input } : input;

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

			// Convert context messages to Anthropic format
			const messages = this.convertMessagesToAnthropic(
				options?.context?.getMessages() || [userMessage],
				options?.context?.getSystemMessage(),
			);
			const tools = options?.context?.listTools() || [];

			// Convert tools to Anthropic format
			const anthropicTools = tools.map((tool: any) => zodToAnthropic(tool));

			// Calculate appropriate token limits
			const modelData = findModelData(this.config.model);
			const defaultMaxTokens =
				options?.maxOutputTokens || this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096;
			const maxThinkingTokens = options?.maxThinkingTokens || this.config.maxThinkingTokens || 3000;
			const thinkingEnabled = options?.thinkingEnabled ?? this.config.thinkingEnabled ?? false;
			const maxTokens = thinkingEnabled
				? Math.max(defaultMaxTokens, maxThinkingTokens + 1000) // Ensure max_tokens > budget_tokens
				: defaultMaxTokens;

			// Build request parameters
			const requestParams = {
				model: this.config.model,
				max_tokens: maxTokens,
				messages,
				...(anthropicTools.length > 0 && { tools: anthropicTools }),
				...(thinkingEnabled && {
					thinking: {
						type: "enabled" as const,
						budget_tokens: maxThinkingTokens,
					},
				}),
			};

			// Execute streaming request
			const stream = await this.anthropic.messages.create({
				...requestParams,
				stream: true,
			});

			return await this.processStream(stream, options, startTime);
		} catch (error) {
			return this.handleError(error);
		}
	}

	private convertMessagesToAnthropic(
		contextMessages: readonly Message[],
		systemMessage?: string,
	): Anthropic.MessageParam[] {
		const messages: Anthropic.MessageParam[] = [];

		if (systemMessage) {
			messages.push({ role: "user", content: systemMessage });
		}

		// Add context messages first
		for (const msg of contextMessages) {
			if (msg.role === "user") {
				const contentBlocks: Anthropic.ContentBlockParam[] = [];

				// Add text content if present
				if (msg.content?.trim()) {
					contentBlocks.push({ type: "text", text: msg.content });
				}

				// Add tool results if present
				if (msg.toolResults && msg.toolResults.length > 0) {
					for (const toolResult of msg.toolResults) {
						contentBlocks.push({
							type: "tool_result",
							tool_use_id: toolResult.toolCallId,
							content: toolResult.content,
						});
					}
				}

				// Add attachments if present
				if (msg.attachments && msg.attachments.length > 0) {
					for (const attachment of msg.attachments) {
						if (attachment.type === "image") {
							// Validate supported mime types
							const supportedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
							if (!supportedMimeTypes.includes(attachment.mimeType)) {
								throw new Error(
									`Unsupported image mime type: ${
										attachment.mimeType
									}. Supported types: ${supportedMimeTypes.join(", ")}`,
								);
							}

							// Check if data is a URL
							const dataStr =
								typeof attachment.data === "string" ? attachment.data : attachment.data.toString("base64");

							if (dataStr.startsWith("http://") || dataStr.startsWith("https://")) {
								// URL-based image
								contentBlocks.push({
									type: "image",
									source: {
										type: "url",
										url: dataStr,
									},
								});
							} else {
								// Base64-encoded image
								contentBlocks.push({
									type: "image",
									source: {
										type: "base64",
										media_type: attachment.mimeType as
											| "image/jpeg"
											| "image/png"
											| "image/gif"
											| "image/webp",
										data: dataStr,
									},
								});
							}
						} else {
							throw new Error(
								`Unsupported attachment type: ${attachment.type}. Anthropic only supports image attachments.`,
							);
						}
					}
				}

				if (contentBlocks.length > 0) {
					messages.push({
						role: "user",
						content:
							contentBlocks.length === 1 && contentBlocks[0]?.type === "text"
								? (contentBlocks[0] as Anthropic.TextBlockParam).text
								: contentBlocks,
					});
				}
			} else if (msg.role === "assistant") {
				// Handle assistant messages with potential tool calls and thinking
				const contentBlocks: Anthropic.ContentBlockParam[] = [];

				// Add thinking content first if present (required when thinking is enabled)
				if (msg.thinking?.trim()) {
					contentBlocks.push({
						type: "thinking",
						thinking: msg.thinking,
						signature: msg.thinkingSignature || "",
					});
				}

				// Add text content if present
				if (msg.content?.trim()) {
					contentBlocks.push({ type: "text", text: msg.content });
				}

				// Add tool_use blocks if present
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					for (const toolCall of msg.toolCalls) {
						contentBlocks.push({
							type: "tool_use",
							id: toolCall.id,
							name: toolCall.name,
							input: toolCall.arguments,
						});
					}
				}

				// Only add assistant message if there's content
				if (contentBlocks.length > 0) {
					messages.push({
						role: "assistant",
						content:
							contentBlocks.length === 1 && contentBlocks[0]?.type === "text"
								? (contentBlocks[0] as Anthropic.TextBlockParam).text
								: contentBlocks,
					});
				}
			}
		}

		return messages;
	}

	private async processStream(
		stream: AsyncIterable<Anthropic.MessageStreamEvent>,
		options?: AnthropicAskOptions,
		startTime?: number,
	): Promise<AskResult> {
		let content = "";
		let thinkingContent = "";
		let thinkingSignature = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let stopReason: string | undefined;
		let toolCalls: ToolCall[] = [];
		let currentToolCall: {
			id?: string;
			name?: string;
			arguments?: string | Record<string, unknown>;
		} | null = null;
		let currentBlockType: "text" | "thinking" | "tool_use" | null = null;

		try {
			for await (const event of stream) {
				switch (event.type) {
					case "message_start":
						inputTokens = event.message.usage.input_tokens;
						// message_start may contain initial output tokens (usually 0 or low)
						outputTokens = event.message.usage.output_tokens;
						break;

					case "content_block_delta":
						if (event.delta.type === "text_delta") {
							const chunk = event.delta.text;
							if (currentBlockType === "thinking") {
								// This shouldn't happen, but handle gracefully
								thinkingContent += chunk;
								options?.onThinkingChunk?.(chunk);
							} else {
								// Regular text content
								content += chunk;
								options?.onChunk?.(chunk);
							}
						} else if (event.delta.type === "thinking_delta") {
							// Handle thinking deltas - these are internal reasoning steps
							const thinkingChunk = event.delta.thinking || "";
							thinkingContent += thinkingChunk;
							options?.onThinkingChunk?.(thinkingChunk);
							// Note: thinking tokens are included in the total output_tokens count
							// but represent internal reasoning, not user-facing content
						} else if (event.delta.type === "signature_delta") {
							// Handle signature deltas - cryptographic verification for thinking blocks
							thinkingSignature += event.delta.signature || "";
						} else if (event.delta.type === "input_json_delta") {
							// Tool call argument streaming - accumulate JSON
							if (currentToolCall) {
								const currentArgs =
									typeof currentToolCall.arguments === "string" ? currentToolCall.arguments : "";
								currentToolCall.arguments = currentArgs + event.delta.partial_json;
							}
						}
						break;

					case "content_block_start":
						if (event.content_block.type === "tool_use") {
							// Start of a new tool call
							currentBlockType = "tool_use";
							currentToolCall = {
								id: event.content_block.id,
								name: event.content_block.name,
								arguments: "" as string | Record<string, unknown>,
							};
						} else if (event.content_block.type === "text") {
							currentBlockType = "text";
						} else if (event.content_block.type === "thinking") {
							currentBlockType = "thinking";
						}
						break;

					case "content_block_stop":
						// Complete the current tool call
						if (
							currentBlockType === "tool_use" &&
							currentToolCall &&
							currentToolCall.id &&
							currentToolCall.name
						) {
							try {
								let argsString =
									typeof currentToolCall.arguments === "string" ? currentToolCall.arguments : "{}";
								// Handle empty arguments (tools with no parameters)
								if (argsString.trim() === "") {
									argsString = "{}";
								}
								const parsedArgs = JSON.parse(argsString);
								toolCalls.push({
									id: currentToolCall.id!,
									name: currentToolCall.name!,
									arguments: parsedArgs,
								});
							} catch (error) {
								// Invalid JSON in tool arguments - we'll handle this as an error
								console.error("Failed to parse tool arguments:", error);
							}
							currentToolCall = null;
						}
						// Reset current block type
						currentBlockType = null;
						break;

					case "message_delta":
						if (event.delta.stop_reason) {
							stopReason = event.delta.stop_reason;
						}
						// message_delta contains cumulative output token counts
						if ((event as any).usage?.output_tokens !== undefined) {
							outputTokens = (event as any).usage.output_tokens;
						}
						break;

					case "message_stop":
						// message_stop typically doesn't contain additional usage data
						// Final token counts should already be captured from message_delta
						break;
				}
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
				...(thinkingContent && { thinking: thinkingContent }),
				...(thinkingSignature && { thinkingSignature }),
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
			case "end_turn":
				return "complete";
			case "max_tokens":
				return "max_tokens";
			case "stop_sequence":
				return "stop_sequence";
			case "tool_use":
				return "tool_call";
			default:
				return undefined;
		}
	}

	private handleError(error: unknown): AskResult {
		// Convert various error types to ModelError
		if (error instanceof Error && "status" in error) {
			const apiError = error as any; // Type assertion for Anthropic API error
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
