import fs from "fs";
import path from "path";
import { RawPair, BridgeConfig } from "./types.js";
import { transformAnthropicToLemmy, jsonSchemaToZod, type TransformResult } from "./transform.js";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/messages.js";
import {
	Context,
	type AskOptions,
	type OpenAIAskOptions,
	type AskResult,
	type ToolDefinition,
} from "@mariozechner/lemmy";
import { lemmy } from "@mariozechner/lemmy";
import { z } from "zod";

interface Logger {
	log(message: string): void;
	error(message: string): void;
}

class FileLogger implements Logger {
	private logFile: string;

	constructor(logDir: string) {
		this.logFile = path.join(logDir, "log.txt");
		// Initialize log file
		fs.writeFileSync(this.logFile, `[${new Date().toISOString()}] Claude Bridge Logger Started\n`);
	}

	log(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ${message}\n`);
		} catch {
			// Silently ignore logging errors (e.g., if directory was deleted)
		}
	}

	error(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ERROR: ${message}\n`);
		} catch {
			// Silently ignore logging errors (e.g., if directory was deleted)
		}
	}
}

export class ClaudeBridgeInterceptor {
	private logDir: string;
	private requestsFile: string;
	private transformedFile: string;
	private logger: Logger;
	private pendingRequests: Map<string, any> = new Map();
	private pairs: RawPair[] = [];
	private config: BridgeConfig;
	private openaiClient: ReturnType<typeof lemmy.openai>;

	constructor(config: BridgeConfig) {
		this.config = {
			logDirectory: ".claude-bridge",
			logLevel: "info",
			...config,
		};

		this.logDir = this.config.logDirectory!;
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true });
		}

		// Initialize logger
		this.logger = new FileLogger(this.logDir);

		// Generate timestamped filename for requests
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, -5);
		this.requestsFile = path.join(this.logDir, `requests-${timestamp}.jsonl`);
		this.transformedFile = path.join(this.logDir, `transformed-${timestamp}.jsonl`);

		// Clear files
		fs.writeFileSync(this.requestsFile, "");
		fs.writeFileSync(this.transformedFile, "");
		this.logger.log(`Initialized Claude Bridge Interceptor - requests logged to ${this.requestsFile}`);
		this.logger.log(`Transformed requests logged to ${this.transformedFile}`);

		// Initialize OpenAI client with API key from environment
		const apiKey = process.env["CLAUDE_BRIDGE_API_KEY"];
		if (!apiKey) {
			throw new Error("CLAUDE_BRIDGE_API_KEY environment variable is required");
		}
		const model = this.config.model || "gpt-4o";
		this.openaiClient = lemmy.openai({ apiKey, model });
	}

	private isAnthropicAPI(url: string | URL): boolean {
		const urlString = typeof url === "string" ? url : url.toString();
		return urlString.includes("api.anthropic.com") && urlString.includes("/v1/messages");
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	private redactSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
		const redactedHeaders = { ...headers };
		const sensitiveKeys = [
			"authorization",
			"x-api-key",
			"x-auth-token",
			"cookie",
			"set-cookie",
			"x-session-token",
			"x-access-token",
			"bearer",
			"proxy-authorization",
		];

		for (const key of Object.keys(redactedHeaders)) {
			const lowerKey = key.toLowerCase();
			if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
				const value = redactedHeaders[key];
				if (value && value.length > 14) {
					redactedHeaders[key] = `${value.substring(0, 10)}...${value.slice(-4)}`;
				} else if (value && value.length > 4) {
					redactedHeaders[key] = `${value.substring(0, 2)}...${value.slice(-2)}`;
				} else {
					redactedHeaders[key] = "[REDACTED]";
				}
			}
		}

		return redactedHeaders;
	}

	private async parseRequestBody(body: any): Promise<any> {
		if (!body) return null;

		if (typeof body === "string") {
			try {
				return JSON.parse(body);
			} catch {
				return body;
			}
		}

		if (body instanceof FormData) {
			const formObject: Record<string, any> = {};
			for (const [key, value] of body.entries()) {
				formObject[key] = value;
			}
			return formObject;
		}

		return body;
	}

	private async parseResponseBody(response: Response): Promise<{ body?: any; body_raw?: string }> {
		const contentType = response.headers.get("content-type") || "";

		try {
			if (contentType.includes("application/json")) {
				const body = await response.json();
				return { body };
			} else if (contentType.includes("text/event-stream")) {
				const body_raw = await response.text();
				return { body_raw };
			} else if (contentType.includes("text/")) {
				const body_raw = await response.text();
				return { body_raw };
			} else {
				const body_raw = await response.text();
				return { body_raw };
			}
		} catch (error) {
			return {};
		}
	}

	public instrumentFetch(): void {
		if (!global.fetch) {
			return;
		}

		if ((global.fetch as any).__claudeBridgeInstrumented) {
			return;
		}

		const originalFetch = global.fetch;
		const interceptor = this;

		global.fetch = async function (input: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

			if (!interceptor.isAnthropicAPI(url)) {
				return originalFetch(input, init);
			}

			interceptor.logger.log(`Intercepted Claude request: ${url}`);

			const requestId = interceptor.generateRequestId();
			const requestTimestamp = Date.now();

			const requestData = {
				timestamp: requestTimestamp / 1000,
				method: init.method || "GET",
				url: url,
				headers: interceptor.redactSensitiveHeaders(Object.fromEntries(new Headers(init.headers || {}).entries())),
				body: await interceptor.parseRequestBody(init.body),
			};

			// Transform Anthropic request to lemmy format and get transformation result
			const transformResult = await interceptor.transformAndLogRequest(requestData);

			interceptor.pendingRequests.set(requestId, requestData);

			try {
				// Call OpenAI instead of Anthropic if transformation succeeded
				let response: Response;
				if (transformResult) {
					response = await interceptor.callOpenAIAndFormatResponse(transformResult, requestData);
				} else {
					// Fallback to original fetch if transformation failed
					response = await originalFetch(input, init);
				}

				const responseTimestamp = Date.now();

				const clonedResponse = response.clone();

				const responseBodyData = await interceptor.parseResponseBody(clonedResponse);

				const responseData = {
					timestamp: responseTimestamp / 1000,
					status_code: response.status,
					headers: interceptor.redactSensitiveHeaders(Object.fromEntries(response.headers.entries())),
					...responseBodyData,
				};

				const pair: RawPair = {
					request: requestData,
					response: responseData,
					logged_at: new Date().toISOString(),
				};

				interceptor.pendingRequests.delete(requestId);
				interceptor.pairs.push(pair);

				await interceptor.writePairToLog(pair);

				interceptor.logger.log(`Logged request-response pair to ${interceptor.requestsFile}`);

				return response;
			} catch (error) {
				interceptor.pendingRequests.delete(requestId);
				throw error;
			}
		};

		(global.fetch as any).__claudeBridgeInstrumented = true;

		this.logger.log("Claude Bridge interceptor initialized");
	}

	private async writePairToLog(pair: RawPair): Promise<void> {
		try {
			const jsonLine = JSON.stringify(pair) + "\n";
			fs.appendFileSync(this.requestsFile, jsonLine);
		} catch (error) {
			this.logger.error(`Failed to write request pair: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async transformAndLogRequest(requestData: any): Promise<TransformResult | null> {
		try {
			// Only transform POST requests to /v1/messages
			if (requestData.method !== "POST" || !requestData.body) {
				return null;
			}

			const anthropicRequest = requestData.body as MessageCreateParamsBase;

			// Skip requests with haiku models
			if (anthropicRequest.model && anthropicRequest.model.toLowerCase().includes("haiku")) {
				this.logger.log(`Skipping transformation for haiku model: ${anthropicRequest.model}`);
				return null;
			}

			// Transform to lemmy format
			const transformResult: TransformResult = transformAnthropicToLemmy(anthropicRequest);

			// Create transformation log entry
			const transformationEntry = {
				timestamp: Date.now() / 1000,
				request_id: this.generateRequestId(),
				original_anthropic: anthropicRequest,
				lemmy_context: transformResult.context,
				anthropic_params: transformResult.anthropicParams,
				bridge_config: {
					provider: this.config.provider || "unknown",
					model: this.config.model || "unknown",
				},
				logged_at: new Date().toISOString(),
			};

			// Write to transformed.jsonl
			const jsonLine = JSON.stringify(transformationEntry) + "\n";
			fs.appendFileSync(this.transformedFile, jsonLine);

			this.logger.log(`Transformed and logged request to ${this.transformedFile}`);

			return transformResult;
		} catch (error) {
			this.logger.error(`Failed to transform request: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	private async callOpenAIAndFormatResponse(transformResult: TransformResult, requestData: any): Promise<Response> {
		try {
			// Create dummy tool definitions for deserialization
			const dummyTools: ToolDefinition[] = transformResult.context.tools.map((serializedTool) => {
				try {
					const zodSchema = jsonSchemaToZod(serializedTool.jsonSchema);
					return {
						name: serializedTool.name,
						description: serializedTool.description,
						schema: zodSchema,
						execute: async () => {
							throw new Error("Tool execution not supported in bridge mode");
						},
					};
				} catch (toolError) {
					this.logger.error(
						`Failed to convert tool ${serializedTool.name} to Zod: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
					);
					// Return a basic Zod schema as fallback
					return {
						name: serializedTool.name,
						description: serializedTool.description,
						schema: z.any(),
						execute: async () => {
							throw new Error("Tool execution not supported in bridge mode");
						},
					};
				}
			});

			// Deserialize the context with dummy tool definitions
			const context = Context.deserialize(transformResult.context, dummyTools);

			// Convert Anthropic parameters to OpenAI AskOptions
			const askOptions: AskOptions<OpenAIAskOptions> = this.convertAnthropicParamsToOpenAI(
				transformResult.anthropicParams,
			);

			this.logger.log(`Calling OpenAI with configured model: ${this.config.model || "gpt-4o"}`);

			// Call OpenAI via lemmy - use the last user message content or empty string
			const lastMessage = context.getMessages().slice(-1)[0];
			const inputText =
				lastMessage?.role === "user" && typeof lastMessage.content === "string" ? lastMessage.content : "";

			const askResult: AskResult = await this.openaiClient.ask(inputText, {
				context,
				...askOptions,
			});

			// Only log errors, not success details
			if (askResult.type !== "success") {
				this.logger.error(`OpenAI error response: ${JSON.stringify(askResult.error)}`);
			}

			// Convert OpenAI result to Anthropic SSE format
			const sseStream = this.convertOpenAIResultToAnthropicSSE(askResult, transformResult.anthropicParams);

			// Create a streaming Response object that looks like it came from Anthropic
			const response = new Response(sseStream, {
				status: 200,
				statusText: "OK",
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"anthropic-request-id": this.generateRequestId(),
				},
			});

			this.logger.log(`Successfully forwarded request to OpenAI and converted response`);
			return response;
		} catch (error) {
			// Log comprehensive error information
			this.logger.error(`CRITICAL: OpenAI request failed with detailed error information:`);
			this.logger.error(`Error type: ${typeof error}`);
			this.logger.error(`Error constructor: ${error?.constructor?.name}`);

			if (error instanceof Error) {
				this.logger.error(`Error message: ${error.message}`);
				this.logger.error(`Error stack: ${error.stack}`);
				this.logger.error(`Error name: ${error.name}`);

				// Check for specific error properties
				if ("cause" in error && error.cause) {
					this.logger.error(`Error cause: ${JSON.stringify(error.cause)}`);
				}
				if ("code" in error) {
					this.logger.error(`Error code: ${(error as any).code}`);
				}
				if ("status" in error) {
					this.logger.error(`HTTP status: ${(error as any).status}`);
				}
				if ("response" in error) {
					this.logger.error(`HTTP response: ${JSON.stringify((error as any).response)}`);
				}
				if ("request" in error) {
					this.logger.error(`HTTP request details: ${JSON.stringify((error as any).request)}`);
				}
			} else {
				this.logger.error(`Non-Error object: ${JSON.stringify(error, null, 2)}`);
			}

			// Log current configuration state
			this.logger.error(
				`Current config: ${JSON.stringify(
					{
						provider: this.config.provider,
						model: this.config.model,
						apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 10)}...` : "NOT_SET",
						logDirectory: this.config.logDirectory,
					},
					null,
					2,
				)}`,
			);

			// Log environment variables (safely)
			this.logger.error(
				`Environment API key: ${process.env["CLAUDE_BRIDGE_API_KEY"] ? `${process.env["CLAUDE_BRIDGE_API_KEY"]!.substring(0, 10)}...` : "NOT_SET"}`,
			);
			this.logger.error(
				`OpenAI API key env: ${process.env["OPENAI_API_KEY"] ? `${process.env["OPENAI_API_KEY"]!.substring(0, 10)}...` : "NOT_SET"}`,
			);

			// Return error response in Anthropic format
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			const errorResponse = {
				type: "error",
				error: {
					type: "internal_server_error",
					message: `OpenAI bridge failure: ${errorMessage}`,
				},
			};

			return new Response(JSON.stringify(errorResponse), {
				status: 500,
				statusText: "Internal Server Error",
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	private convertAnthropicParamsToOpenAI(
		anthropicParams: TransformResult["anthropicParams"],
	): AskOptions<OpenAIAskOptions> {
		const askOptions: AskOptions<OpenAIAskOptions> = {};

		// Convert optional parameters
		if (anthropicParams.temperature !== undefined) {
			askOptions.temperature = anthropicParams.temperature;
		}
		if (anthropicParams.top_p !== undefined) {
			askOptions.topP = anthropicParams.top_p;
		}
		if (anthropicParams.stop_sequences && anthropicParams.stop_sequences.length > 0) {
			askOptions.stop = anthropicParams.stop_sequences[0]; // OpenAI only supports single stop string
		}
		if (anthropicParams.tool_choice) {
			if (typeof anthropicParams.tool_choice === "string") {
				if (anthropicParams.tool_choice === "any") {
					askOptions.toolChoice = "required";
				} else if (anthropicParams.tool_choice === "auto") {
					askOptions.toolChoice = "auto";
				}
			} else if (typeof anthropicParams.tool_choice === "object" && anthropicParams.tool_choice.type === "tool") {
				askOptions.toolChoice = "required"; // Approximate mapping
			}
		}

		return askOptions;
	}

	private convertOpenAIResultToAnthropicSSE(
		askResult: AskResult,
		originalParams: TransformResult["anthropicParams"],
	): ReadableStream<Uint8Array> {
		const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

		return new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();

				const writeSSEEvent = (eventType: string, data: any) => {
					const jsonData = JSON.stringify(data);
					const sseData = `event: ${eventType}\ndata: ${jsonData}\n\n`;
					controller.enqueue(encoder.encode(sseData));
				};

				if (askResult.type !== "success") {
					// Handle error case
					writeSSEEvent("error", {
						type: "error",
						error: {
							type: "internal_server_error",
							message: "OpenAI request failed",
						},
					});
					controller.close();
					return;
				}

				// 1. message_start event
				writeSSEEvent("message_start", {
					type: "message_start",
					message: {
						id: messageId,
						type: "message",
						role: "assistant",
						model: originalParams.model,
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage: {
							input_tokens: askResult.tokens?.input || 0,
							output_tokens: 0, // Will be updated in message_delta
						},
					},
				});

				let contentBlockIndex = 0;

				// 2. Handle thinking content if present
				if (askResult.message.thinking) {
					writeSSEEvent("content_block_start", {
						type: "content_block_start",
						index: contentBlockIndex,
						content_block: {
							type: "thinking",
						},
					});

					// Stream thinking in chunks
					const thinkingText = askResult.message.thinking;
					for (let i = 0; i < thinkingText.length; i += 50) {
						const chunk = thinkingText.slice(i, i + 50);
						writeSSEEvent("content_block_delta", {
							type: "content_block_delta",
							index: contentBlockIndex,
							delta: {
								type: "thinking_delta",
								thinking: chunk,
							},
						});
					}

					writeSSEEvent("content_block_stop", {
						type: "content_block_stop",
						index: contentBlockIndex,
					});

					contentBlockIndex++;
				}

				// 3. Handle text content if present
				if (askResult.message.content) {
					writeSSEEvent("content_block_start", {
						type: "content_block_start",
						index: contentBlockIndex,
						content_block: {
							type: "text",
							text: "",
						},
					});

					// Stream text in chunks
					const textContent = askResult.message.content;
					for (let i = 0; i < textContent.length; i += 50) {
						const chunk = textContent.slice(i, i + 50);
						writeSSEEvent("content_block_delta", {
							type: "content_block_delta",
							index: contentBlockIndex,
							delta: {
								type: "text_delta",
								text: chunk,
							},
						});
					}

					writeSSEEvent("content_block_stop", {
						type: "content_block_stop",
						index: contentBlockIndex,
					});

					contentBlockIndex++;
				}

				// 4. Handle tool calls if present
				if (askResult.message.toolCalls && askResult.message.toolCalls.length > 0) {
					for (const toolCall of askResult.message.toolCalls) {
						writeSSEEvent("content_block_start", {
							type: "content_block_start",
							index: contentBlockIndex,
							content_block: {
								type: "tool_use",
								id: toolCall.id,
								name: toolCall.name,
								input: {},
							},
						});

						// Stream tool arguments as JSON
						const argsJson = JSON.stringify(toolCall.arguments);
						for (let i = 0; i < argsJson.length; i += 50) {
							const chunk = argsJson.slice(i, i + 50);
							writeSSEEvent("content_block_delta", {
								type: "content_block_delta",
								index: contentBlockIndex,
								delta: {
									type: "input_json_delta",
									partial_json: chunk,
								},
							});
						}

						writeSSEEvent("content_block_stop", {
							type: "content_block_stop",
							index: contentBlockIndex,
						});

						contentBlockIndex++;
					}
				}

				// 5. message_delta event with final usage and stop reason
				const stopReason =
					askResult.message.toolCalls && askResult.message.toolCalls.length > 0 ? "tool_use" : "end_turn";
				writeSSEEvent("message_delta", {
					type: "message_delta",
					delta: {
						stop_reason: stopReason,
						stop_sequence: null,
					},
					usage: {
						output_tokens: askResult.tokens?.output || 0,
					},
				});

				// 6. message_stop event
				writeSSEEvent("message_stop", {
					type: "message_stop",
				});

				// Close the stream
				controller.close();
			},
		});
	}

	public cleanup(): void {
		this.logger.log("Cleaning up interceptor...");

		for (const [, requestData] of this.pendingRequests.entries()) {
			const orphanedPair = {
				request: requestData,
				response: null,
				note: "ORPHANED_REQUEST - No matching response received",
				logged_at: new Date().toISOString(),
			};

			try {
				const jsonLine = JSON.stringify(orphanedPair) + "\n";
				fs.appendFileSync(this.requestsFile, jsonLine);
			} catch (error) {
				this.logger.error(
					`Error writing orphaned request: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		this.pendingRequests.clear();
		this.logger.log(`Cleanup complete. Logged ${this.pairs.length} pairs to ${this.requestsFile}`);
	}

	public getStats() {
		return {
			totalPairs: this.pairs.length,
			pendingRequests: this.pendingRequests.size,
			requestsFile: this.requestsFile,
		};
	}
}

let globalInterceptor: ClaudeBridgeInterceptor | null = null;
let eventListenersSetup = false;

export function initializeInterceptor(config?: BridgeConfig): ClaudeBridgeInterceptor {
	if (globalInterceptor) {
		console.warn("⚠️  Interceptor already initialized");
		return globalInterceptor;
	}

	const defaultConfig: BridgeConfig = {
		provider: process.env["CLAUDE_BRIDGE_PROVIDER"] || "openai",
		model: process.env["CLAUDE_BRIDGE_MODEL"] || "gpt-4o",
		apiKey: process.env["CLAUDE_BRIDGE_API_KEY"],
		logDirectory: process.env["CLAUDE_BRIDGE_LOG_DIR"] || ".claude-bridge",
	};

	globalInterceptor = new ClaudeBridgeInterceptor({ ...defaultConfig, ...config });
	globalInterceptor.instrumentFetch();

	if (!eventListenersSetup) {
		const cleanup = () => {
			if (globalInterceptor) {
				globalInterceptor.cleanup();
			}
		};

		process.on("exit", cleanup);
		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
		process.on("uncaughtException", (error) => {
			console.error("Uncaught exception:", error);
			cleanup();
			process.exit(1);
		});

		eventListenersSetup = true;
	}

	return globalInterceptor;
}

export function getInterceptor(): ClaudeBridgeInterceptor | null {
	return globalInterceptor;
}
