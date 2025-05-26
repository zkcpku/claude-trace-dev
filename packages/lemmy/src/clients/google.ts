import {
	GoogleGenAI,
	type Content,
	type Part,
	type FunctionCall,
	type FunctionResponse,
	GenerateContentResponse,
	GenerateContentParameters,
} from "@google/genai";
import type {
	ChatClient,
	AskResult,
	GoogleConfig,
	GoogleAskOptions,
	Message,
	UserMessage,
	AssistantMessage,
	UserInput,
	TokenUsage,
	ModelError,
	ToolCall,
	StopReason,
} from "../types.js";
import { zodToGoogle } from "../tools/zod-converter.js";
import { calculateTokenCost, findModelData } from "../index.js";

export class GoogleClient implements ChatClient<GoogleAskOptions> {
	private google: GoogleGenAI;
	private config: GoogleConfig;

	constructor(config: GoogleConfig) {
		this.config = config;
		this.google = new GoogleGenAI({
			apiKey: config.apiKey,
			...(config.projectId && { project: config.projectId }),
			...(config.baseURL && { apiUrl: config.baseURL }),
		});
	}

	getModel(): string {
		return this.config.model;
	}

	getProvider(): string {
		return "google";
	}

	async ask(input: string | UserInput, options?: GoogleAskOptions): Promise<AskResult> {
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

			// Convert context messages to Google format
			const contents = this.convertMessagesToGoogle(options?.context?.getMessages() || [userMessage]);
			const tools = options?.context?.listTools() || [];

			// Convert tools to Google format
			const googleTools = tools.map((tool: any) => zodToGoogle(tool));

			// Calculate appropriate token limits
			const modelData = findModelData(this.config.model);
			const maxOutputTokens =
				options?.maxOutputTokens || this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096;

			// Build request parameters
			const systemMessage = options?.context?.getSystemMessage();
			const requestParams: GenerateContentParameters = {
				model: this.config.model,
				contents,
				config: {
					maxOutputTokens,
					...(systemMessage && {
						systemInstruction: systemMessage,
					}),
					...(googleTools.length > 0 && {
						tools: [
							{
								functionDeclarations: googleTools,
							},
						],
					}),
					...((options?.includeThoughts ?? this.config.includeThoughts ?? false) && {
						thinkingConfig: {
							includeThoughts: options?.includeThoughts ?? this.config.includeThoughts ?? false,
						},
					}),
				},
			};

			// Execute streaming request
			const stream = await this.google.models.generateContentStream(requestParams);

			return await this.processStream(stream, options, startTime);
		} catch (error) {
			return this.handleError(error);
		}
	}

	private convertMessagesToGoogle(contextMessages: readonly Message[]): Content[] {
		const contents: Content[] = [];

		for (const msg of contextMessages) {
			if (msg.role === "user") {
				const parts: Part[] = [];

				// Add text content if present
				if (msg.content?.trim()) {
					parts.push({ text: msg.content });
				}

				// Add tool results if present
				if (msg.toolResults && msg.toolResults.length > 0) {
					for (const toolResult of msg.toolResults) {
						const functionResponse: FunctionResponse = {
							name: toolResult.toolCallId, // Google uses function name for tool call ID
							response: {
								result: toolResult.content,
							},
						};
						parts.push({ functionResponse });
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
								parts.push({
									fileData: {
										mimeType: attachment.mimeType,
										fileUri: dataStr,
									},
								});
							} else {
								// Base64-encoded image
								parts.push({
									inlineData: {
										mimeType: attachment.mimeType,
										data: dataStr,
									},
								});
							}
						} else {
							throw new Error(
								`Unsupported attachment type: ${attachment.type}. Google AI only supports image attachments.`,
							);
						}
					}
				}

				if (parts.length > 0) {
					contents.push({
						role: "user",
						parts,
					});
				}
			} else if (msg.role === "assistant") {
				// Handle assistant messages with potential tool calls and thinking
				const parts: Part[] = [];

				// Add thinking content first if present (for models that support it)
				if (msg.thinking?.trim()) {
					// Google AI represents thinking as a special part with thought: true
					parts.push({
						text: msg.thinking,
						thought: true,
					});
				}

				// Add text content if present
				if (msg.content?.trim()) {
					parts.push({ text: msg.content });
				}

				// Add function calls if present
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					for (const toolCall of msg.toolCalls) {
						const functionCall: FunctionCall = {
							name: toolCall.name,
							args: toolCall.arguments,
						};
						parts.push({ functionCall });
					}
				}

				// Only add assistant message if there's content
				if (parts.length > 0) {
					contents.push({
						role: "model",
						parts,
					});
				}
			}
		}

		return contents;
	}

	private async processStream(
		stream: AsyncGenerator<GenerateContentResponse, any, any>,
		options?: GoogleAskOptions,
		startTime?: number,
	): Promise<AskResult> {
		let content = "";
		let thinkingContent = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let stopReason: string | undefined;
		let toolCalls: ToolCall[] = [];

		try {
			for await (const chunk of stream) {
				if (chunk.candidates && chunk.candidates.length > 0) {
					const candidate = chunk.candidates[0];
					if (!candidate) {
						continue;
					}

					// Handle usage metadata
					if (chunk.usageMetadata) {
						inputTokens = chunk.usageMetadata.promptTokenCount || 0;
						outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
					}

					// Handle finish reason
					if (candidate.finishReason) {
						stopReason = candidate.finishReason;
					}

					// Handle content parts
					if (candidate.content && candidate.content.parts) {
						for (const part of candidate.content.parts) {
							if (part.text) {
								if (part.thought) {
									// This is thinking content
									thinkingContent += part.text;
									options?.onThinkingChunk?.(part.text);
								} else {
									// Regular text content
									content += part.text;
									options?.onChunk?.(part.text);
								}
							} else if (part.functionCall) {
								// Handle function call
								const toolCall: ToolCall = {
									id: part.functionCall.name + "_" + performance.now(), // Generate unique ID
									name: part.functionCall.name || "unknown",
									arguments: part.functionCall.args || {},
								};
								toolCalls.push(toolCall);
							}
						}
					}
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

			// Determine the correct stop reason - Google AI doesn't have a specific tool_call finish reason
			// so we need to check if there are tool calls and override the stop reason
			let finalStopReason = this.mapStopReason(stopReason) || "complete";
			if (toolCalls.length > 0) {
				finalStopReason = "tool_call";
			}

			// Return successful response with the message
			const response: AskResult = {
				type: "success",
				stopReason: finalStopReason,
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
			case "STOP":
				return "complete";
			case "MAX_TOKENS":
				return "max_tokens";
			case "SAFETY":
				return "stop_sequence";
			case "RECITATION":
				return "stop_sequence";
			case "OTHER":
				return "complete";
			default:
				return undefined;
		}
	}

	private handleError(error: unknown): AskResult {
		// Convert various error types to ModelError
		if (error && typeof error === "object") {
			const apiError = error as any;

			// Check for Google API specific error structure
			let status = apiError.status;
			let message = apiError.message || "Unknown API error";

			// Handle Google API error format with nested error structure
			if (typeof message === "string" && message.includes("API key not valid")) {
				status = 401;
				message = "Invalid API key";
			} else if (typeof message === "string" && message.includes("quota")) {
				status = 429;
			}

			const modelError: ModelError = {
				type: this.getErrorType(status),
				message,
				retryable: this.isRetryable(status),
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
