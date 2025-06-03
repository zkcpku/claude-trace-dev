import fs from "fs";
import path from "path";
import { RawPair, BridgeConfig, TransformationEntry } from "./types.js";
import { transformAnthropicToLemmy, jsonSchemaToZod } from "./transform.js";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/messages.js";
import {
	Context,
	type AskResult,
	type ToolDefinition,
	type SerializedContext,
	type SerializedToolDefinition,
	type Message,
	type ToolResult,
	type Attachment,
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
		fs.writeFileSync(this.logFile, `[${new Date().toISOString()}] Claude Bridge Logger Started\n`);
	}

	log(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ${message}\n`);
		} catch {
			// Silently ignore logging errors
		}
	}

	error(message: string): void {
		try {
			const timestamp = new Date().toISOString();
			fs.appendFileSync(this.logFile, `[${timestamp}] ERROR: ${message}\n`);
		} catch {
			// Silently ignore logging errors
		}
	}
}

interface ParsedRequestData {
	url: string;
	method: string;
	timestamp: number;
	headers: Record<string, string>;
	body: MessageCreateParamsBase;
}

export class ClaudeBridgeInterceptor {
	private config: BridgeConfig;
	private logger: Logger;
	private requestsFile: string;
	private transformedFile: string;
	private openaiClient: ReturnType<typeof lemmy.openai>;
	private pendingRequests = new Map<string, any>();

	constructor(config: BridgeConfig) {
		this.config = { logDirectory: ".claude-bridge", logLevel: "info", ...config };

		// Setup logging
		const logDir = this.config.logDirectory!;
		if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
		this.logger = new FileLogger(logDir);

		// Setup files
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, -5);
		this.requestsFile = path.join(logDir, `requests-${timestamp}.jsonl`);
		this.transformedFile = path.join(logDir, `transformed-${timestamp}.jsonl`);
		fs.writeFileSync(this.requestsFile, "");
		fs.writeFileSync(this.transformedFile, "");

		// Setup OpenAI client
		const apiKey = process.env["CLAUDE_BRIDGE_API_KEY"];
		if (!apiKey) throw new Error("CLAUDE_BRIDGE_API_KEY environment variable is required");
		this.openaiClient = lemmy.openai({ apiKey, model: this.config.model || "gpt-4o" });

		this.logger.log(`Requests logged to ${this.requestsFile}`);
		this.logger.log(`Transformed requests logged to ${this.transformedFile}`);
	}

	public instrumentFetch(): void {
		if (!global.fetch || (global.fetch as any).__claudeBridgeInstrumented) return;

		const originalFetch = global.fetch;
		global.fetch = async (input: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (!this.isAnthropicAPI(url)) return originalFetch(input, init);
			return this.handleAnthropicRequest(originalFetch, input, init);
		};

		(global.fetch as any).__claudeBridgeInstrumented = true;
		this.logger.log("Claude Bridge interceptor initialized");
	}

	private async handleAnthropicRequest(
		originalFetch: typeof fetch,
		input: Parameters<typeof fetch>[0],
		init: RequestInit,
	): Promise<Response> {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		this.logger.log(`Intercepted Claude request: ${url}`);

		const requestId = this.generateRequestId();
		const requestData = await this.parseAnthropicMessageCreateRequest(url, init);
		const transformResult = await this.tryTransform(requestData);

		// Log conversation history to debug duplicate messages
		if (requestData.body?.messages) {
			this.logger.log(`📜 Request contains ${requestData.body.messages.length} messages:`);
			for (let i = 0; i < requestData.body.messages.length; i++) {
				const msg = requestData.body.messages[i];
				if (msg) {
					const preview =
						typeof msg.content === "string"
							? msg.content.substring(0, 100)
							: JSON.stringify(msg.content).substring(0, 100);
					this.logger.log(`  ${i + 1}. ${msg.role}: ${preview}${preview.length >= 100 ? "..." : ""}`);
				}
			}
		}

		this.pendingRequests.set(requestId, requestData);

		try {
			// Get response from OpenAI or fallback to Anthropic
			const response = transformResult ? await this.callOpenAI(transformResult) : await originalFetch(input, init);

			// Log everything
			await this.logComplete(requestData, response, transformResult, requestId);

			this.pendingRequests.delete(requestId);
			return response;
		} catch (error) {
			this.pendingRequests.delete(requestId);
			throw error;
		}
	}

	private async parseAnthropicMessageCreateRequest(url: string, init: RequestInit): Promise<ParsedRequestData> {
		let body: MessageCreateParamsBase | null = null;

		if (init.body) {
			try {
				if (typeof init.body !== "string") throw new Error("Anthropic request body must be a string");
				body = JSON.parse(init.body) as MessageCreateParamsBase;
			} catch (error) {
				this.logger.error(
					`Failed to parse Anthropic request body: ${error instanceof Error ? error.message : String(error)}`,
				);
				body = null;
			}
		}

		if (!body) throw Error("Anthropic request body must not be null");

		return {
			url,
			timestamp: Date.now() / 1000,
			method: init.method || "POST",
			headers: this.redactHeaders(Object.fromEntries(new Headers(init.headers || {}).entries())),
			body,
		};
	}

	private async tryTransform(requestData: any): Promise<SerializedContext | null> {
		try {
			if (requestData.method !== "POST" || !requestData.body) return null;

			const anthropicRequest = requestData.body as MessageCreateParamsBase;

			// Skip haiku models
			if (anthropicRequest.model?.toLowerCase().includes("haiku")) {
				this.logger.log(`Skipping transformation for haiku model: ${anthropicRequest.model}`);
				return null;
			}

			return transformAnthropicToLemmy(anthropicRequest);
		} catch (error) {
			if (error instanceof Error && error.message.includes("Multi-turn conversations")) {
				this.logger.log(`Skipping transformation for multi-turn conversation: ${error.message}`);
				return null;
			}
			this.logger.error(`Failed to transform request: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	private async callOpenAI(transformResult: SerializedContext): Promise<Response> {
		try {
			// Create dummy tools for deserialization
			const dummyTools: ToolDefinition[] = transformResult.tools.map((tool: SerializedToolDefinition) => ({
				name: tool.name,
				description: tool.description,
				schema: this.safeJsonSchemaToZod(tool.jsonSchema),
				execute: async () => {
					throw new Error("Tool execution not supported in bridge mode");
				},
			}));

			// Deserialize context and call OpenAI
			const context = Context.deserialize(transformResult, dummyTools);
			const lastMessage = context.getMessages().pop();

			// Construct proper AskInput from the last user message
			let askInput: string | { content?: string; toolResults?: ToolResult[]; attachments?: Attachment[] } = "";

			if (lastMessage?.role === "user") {
				const userMessage = lastMessage as any;
				askInput = {
					content: typeof userMessage.content === "string" ? userMessage.content : undefined,
					toolResults: userMessage.toolResults || undefined,
					attachments: userMessage.attachments || undefined,
				};
			}

			this.logger.log(`Calling OpenAI with configured model: ${this.config.model || "gpt-4o"}`);
			const askResult: AskResult = await this.openaiClient.ask(askInput, { context });

			if (askResult.type !== "success") {
				this.logger.error(`OpenAI error response: ${JSON.stringify(askResult.error)}`);
			}

			// Convert to Anthropic SSE format
			return new Response(this.createAnthropicSSE(askResult), {
				status: 200,
				statusText: "OK",
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"anthropic-request-id": this.generateRequestId(),
				},
			});
		} catch (error) {
			this.logOpenAIError(error);
			return new Response(
				JSON.stringify({
					type: "error",
					error: {
						type: "internal_server_error",
						message: `OpenAI bridge failure: ${error instanceof Error ? error.message : "Unknown error"}`,
					},
				}),
				{
					status: 500,
					statusText: "Internal Server Error",
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	private async logComplete(
		requestData: any,
		response: Response,
		transformResult: SerializedContext | null,
		requestId: string,
	) {
		const responseData = await this.parseResponse(response.clone());

		// Log raw request-response pair
		const pair: RawPair = {
			request: requestData,
			response: responseData,
			logged_at: new Date().toISOString(),
		};
		fs.appendFileSync(this.requestsFile, JSON.stringify(pair) + "\n");

		// Log transformation entry if we transformed
		if (transformResult) {
			const decodedSSE =
				responseData.body_raw && responseData.headers["content-type"]?.includes("text/event-stream")
					? this.parseSSE(responseData.body_raw)
					: undefined;

			const contextWithResponse = { ...transformResult };
			const assistantResponse = decodedSSE ? this.extractAssistantFromSSE(decodedSSE) : null;
			if (assistantResponse) {
				contextWithResponse.messages = [...contextWithResponse.messages, assistantResponse];
			}

			const transformEntry: TransformationEntry = {
				timestamp: Date.now() / 1000,
				request_id: requestId,
				raw_request: requestData.body as MessageCreateParamsBase,
				lemmy_context: contextWithResponse,
				bridge_config: { provider: this.config.provider || "unknown", model: this.config.model || "unknown" },
				raw_response: responseData,
				decoded_sse: decodedSSE,
				logged_at: new Date().toISOString(),
			};

			fs.appendFileSync(this.transformedFile, JSON.stringify(transformEntry) + "\n");
			this.logger.log(`Transformed and logged request with response to ${this.transformedFile}`);
		}

		this.logger.log(`Logged request-response pair to ${this.requestsFile}`);
	}

	// Utility methods
	private isAnthropicAPI(url: string): boolean {
		return url.includes("api.anthropic.com") && url.includes("/v1/messages");
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	private redactHeaders(headers: Record<string, string>): Record<string, string> {
		const result = { ...headers };
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

		for (const [key, value] of Object.entries(result)) {
			if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
				result[key] =
					value.length > 14
						? `${value.substring(0, 10)}...${value.slice(-4)}`
						: value.length > 4
							? `${value.substring(0, 2)}...${value.slice(-2)}`
							: "[REDACTED]";
			}
		}
		return result;
	}

	private async parseResponse(response: Response) {
		const contentType = response.headers.get("content-type") || "";
		let body, body_raw;

		try {
			if (contentType.includes("application/json")) {
				body = await response.json();
			} else {
				body_raw = await response.text();
			}
		} catch {
			// Ignore parse errors
		}

		const result: any = {
			timestamp: Date.now() / 1000,
			status_code: response.status,
			headers: this.redactHeaders(Object.fromEntries(response.headers.entries())),
		};

		if (body) result.body = body;
		if (body_raw) result.body_raw = body_raw;

		return result;
	}

	private safeJsonSchemaToZod(jsonSchema: any): z.ZodSchema {
		try {
			return jsonSchemaToZod(jsonSchema);
		} catch {
			return z.any();
		}
	}

	private parseSSE(sseData: string): any[] {
		const events: any[] = [];
		const lines = sseData.split("\n");
		let currentEvent: any = {};

		for (const line of lines) {
			if (line.startsWith("data:")) {
				try {
					currentEvent = JSON.parse(line.substring(5).trim());
				} catch {
					currentEvent.data = line.substring(5).trim();
				}
			} else if (line.trim() === "" && Object.keys(currentEvent).length > 0) {
				events.push({ ...currentEvent });
				currentEvent = {};
			}
		}

		if (Object.keys(currentEvent).length > 0) events.push(currentEvent);
		return events;
	}

	private extractAssistantFromSSE(events: any[]): Message | null {
		try {
			let content = "",
				thinking = "";
			const toolCalls: any[] = [];
			let errorMessage = "";

			for (const event of events) {
				if (event.type === "error") {
					// Handle error events - extract the error message
					errorMessage = event.error?.message || JSON.stringify(event.error) || "Unknown error";
				} else if (event.type === "content_block_delta") {
					if (event.delta?.type === "text_delta") content += event.delta.text || "";
					if (event.delta?.type === "thinking_delta") thinking += event.delta.thinking || "";
				} else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
					toolCalls.push({ id: event.content_block.id, name: event.content_block.name, arguments: {} });
				} else if (
					event.type === "content_block_delta" &&
					event.delta?.type === "input_json_delta" &&
					toolCalls.length > 0
				) {
					const lastTool = toolCalls[toolCalls.length - 1];
					lastTool.argumentsJson = (lastTool.argumentsJson || "") + (event.delta.partial_json || "");
				}
			}

			// Parse tool arguments
			for (const tool of toolCalls) {
				if (tool.argumentsJson) {
					try {
						tool.arguments = JSON.parse(tool.argumentsJson);
						delete tool.argumentsJson;
					} catch {
						tool.arguments = tool.argumentsJson;
						delete tool.argumentsJson;
					}
				}
			}

			const message: any = { role: "assistant" };
			if (thinking) message.thinking = thinking;
			if (content) message.content = content;
			if (toolCalls.length > 0) message.toolCalls = toolCalls;
			if (errorMessage) message.content = `Error: ${errorMessage}`;

			return Object.keys(message).length > 1 ? message : null;
		} catch (error) {
			this.logger.error(
				`Failed to extract assistant response: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	}

	private createAnthropicSSE(askResult: AskResult): ReadableStream<Uint8Array> {
		const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
		const model = this.config.model || "gpt-4o";

		return new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				const writeEvent = (eventType: string, data: any) => {
					controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
				};

				if (askResult.type !== "success") {
					const errorMessage =
						askResult.error?.message || JSON.stringify(askResult.error) || "OpenAI request failed";
					writeEvent("error", {
						type: "error",
						error: { type: "internal_server_error", message: errorMessage },
					});
					controller.close();
					return;
				}

				// Start message
				writeEvent("message_start", {
					type: "message_start",
					message: {
						id: messageId,
						type: "message",
						role: "assistant",
						model,
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage: { input_tokens: askResult.tokens?.input || 0, output_tokens: 0 },
					},
				});

				let blockIndex = 0;

				// Thinking
				if (askResult.message.thinking) {
					writeEvent("content_block_start", {
						type: "content_block_start",
						index: blockIndex,
						content_block: { type: "thinking" },
					});
					const thinking = askResult.message.thinking;
					for (let i = 0; i < thinking.length; i += 50) {
						writeEvent("content_block_delta", {
							type: "content_block_delta",
							index: blockIndex,
							delta: { type: "thinking_delta", thinking: thinking.slice(i, i + 50) },
						});
					}
					writeEvent("content_block_stop", { type: "content_block_stop", index: blockIndex });
					blockIndex++;
				}

				// Text content
				if (askResult.message.content) {
					writeEvent("content_block_start", {
						type: "content_block_start",
						index: blockIndex,
						content_block: { type: "text", text: "" },
					});
					const content = askResult.message.content;
					for (let i = 0; i < content.length; i += 50) {
						writeEvent("content_block_delta", {
							type: "content_block_delta",
							index: blockIndex,
							delta: { type: "text_delta", text: content.slice(i, i + 50) },
						});
					}
					writeEvent("content_block_stop", { type: "content_block_stop", index: blockIndex });
					blockIndex++;
				}

				// Tool calls
				if (askResult.message.toolCalls?.length) {
					for (const toolCall of askResult.message.toolCalls) {
						writeEvent("content_block_start", {
							type: "content_block_start",
							index: blockIndex,
							content_block: { type: "tool_use", id: toolCall.id, name: toolCall.name, input: {} },
						});
						const argsJson = JSON.stringify(toolCall.arguments);
						for (let i = 0; i < argsJson.length; i += 50) {
							writeEvent("content_block_delta", {
								type: "content_block_delta",
								index: blockIndex,
								delta: { type: "input_json_delta", partial_json: argsJson.slice(i, i + 50) },
							});
						}
						writeEvent("content_block_stop", { type: "content_block_stop", index: blockIndex });
						blockIndex++;
					}
				}

				// End message
				const stopReason = askResult.message.toolCalls?.length ? "tool_use" : "end_turn";
				writeEvent("message_delta", {
					type: "message_delta",
					delta: { stop_reason: stopReason, stop_sequence: null },
					usage: { output_tokens: askResult.tokens?.output || 0 },
				});
				writeEvent("message_stop", { type: "message_stop" });

				controller.close();
			},
		});
	}

	private logOpenAIError(error: any) {
		this.logger.error(`CRITICAL: OpenAI request failed with detailed error information:`);
		this.logger.error(`Error type: ${typeof error}`);
		this.logger.error(`Error constructor: ${error?.constructor?.name}`);

		if (error instanceof Error) {
			this.logger.error(`Error message: ${error.message}`);
			this.logger.error(`Error stack: ${error.stack}`);
			if ("cause" in error && error.cause) this.logger.error(`Error cause: ${JSON.stringify(error.cause)}`);
			if ("code" in error) this.logger.error(`Error code: ${(error as any).code}`);
			if ("status" in error) this.logger.error(`HTTP status: ${(error as any).status}`);
		} else {
			this.logger.error(`Non-Error object: ${JSON.stringify(error, null, 2)}`);
		}

		this.logger.error(
			`Config: ${JSON.stringify({
				provider: this.config.provider,
				model: this.config.model,
				apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 10)}...` : "NOT_SET",
			})}`,
		);
	}

	public cleanup(): void {
		this.logger.log("Cleaning up interceptor...");
		for (const [, requestData] of this.pendingRequests.entries()) {
			const orphaned = {
				request: requestData,
				response: null,
				note: "ORPHANED_REQUEST",
				logged_at: new Date().toISOString(),
			};
			fs.appendFileSync(this.requestsFile, JSON.stringify(orphaned) + "\n");
		}
		this.pendingRequests.clear();
		this.logger.log(`Cleanup complete.`);
	}
}

// Global interceptor management
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
		const cleanup = () => globalInterceptor?.cleanup();
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
