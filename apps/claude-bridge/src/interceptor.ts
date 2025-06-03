import fs from "fs";
import path from "path";
import { RawPair, BridgeConfig, TransformationEntry, Provider, ProviderClientInfo } from "./types.js";
import { transformAnthropicToLemmy } from "./transforms/anthropic-to-lemmy.js";
import { createAnthropicSSE } from "./transforms/lemmy-to-anthropic.js";
import { jsonSchemaToZod } from "./transforms/tool-schemas.js";
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
import { FileLogger, type Logger } from "./utils/logger.js";
import { parseSSE, extractAssistantFromSSE } from "./utils/sse.js";
import {
	parseAnthropicMessageCreateRequest,
	parseResponse,
	isAnthropicAPI,
	generateRequestId,
	type ParsedRequestData,
} from "./utils/request-parser.js";
import { createProviderClient, validateCapabilities, convertThinkingParameters } from "./utils/provider.js";

export class ClaudeBridgeInterceptor {
	private config: BridgeConfig;
	private logger: Logger;
	private requestsFile: string;
	private transformedFile: string;
	private clientInfo: ProviderClientInfo;
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

		// Setup provider-agnostic client
		this.clientInfo = createProviderClient(this.config);

		this.logger.log(`Requests logged to ${this.requestsFile}`);
		this.logger.log(`Transformed requests logged to ${this.transformedFile}`);
		this.logger.log(`Initialized ${this.clientInfo.provider} client for model: ${this.clientInfo.model}`);
	}

	public instrumentFetch(): void {
		if (!global.fetch || (global.fetch as any).__claudeBridgeInstrumented) return;

		const originalFetch = global.fetch;
		global.fetch = async (input: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (!isAnthropicAPI(url)) return originalFetch(input, init);
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

		const requestId = generateRequestId();
		const requestData = await parseAnthropicMessageCreateRequest(url, init, this.logger);
		const transformResult = await this.tryTransform(requestData);
		this.pendingRequests.set(requestId, requestData);

		try {
			// Get response from provider or fallback to Anthropic
			const response = transformResult
				? await this.callProvider(transformResult, requestData.body)
				: await originalFetch(input, init);

			// Log everything
			await this.logComplete(requestData, response, transformResult, requestId);

			this.pendingRequests.delete(requestId);
			return response;
		} catch (error) {
			this.pendingRequests.delete(requestId);
			throw error;
		}
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

	private async callProvider(transformResult: SerializedContext, originalRequest: any): Promise<Response> {
		try {
			// Validate capabilities
			const validation = validateCapabilities(this.clientInfo.modelData, originalRequest, this.logger);
			if (!validation.valid) {
				validation.warnings.forEach((warning: string) => this.logger.log(`⚠️  ${warning}`));
			}

			// Create dummy tools for deserialization
			const dummyTools: ToolDefinition[] = transformResult.tools.map((tool: SerializedToolDefinition) => ({
				name: tool.name,
				description: tool.description,
				schema: this.safeJsonSchemaToZod(tool.jsonSchema),
				execute: async () => {
					throw new Error("Tool execution not supported in bridge mode");
				},
			}));

			// Deserialize context and call provider
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

			// Convert thinking parameters for provider
			const askOptions = convertThinkingParameters(this.clientInfo.provider, originalRequest);

			// Apply capability adjustments
			if (validation.adjustments.maxOutputTokens) {
				askOptions.maxOutputTokens = validation.adjustments.maxOutputTokens;
			}

			this.logger.log(`Calling ${this.clientInfo.provider} with model: ${this.clientInfo.model}`);
			const askResult: AskResult = await this.clientInfo.client.ask(askInput, { context, ...askOptions });

			if (askResult.type !== "success") {
				this.logger.error(`${this.clientInfo.provider} error response: ${JSON.stringify(askResult.error)}`);
			}

			// Convert to Anthropic SSE format
			return new Response(createAnthropicSSE(askResult, this.clientInfo.model), {
				status: 200,
				statusText: "OK",
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"anthropic-request-id": generateRequestId(),
				},
			});
		} catch (error) {
			this.logProviderError(error);
			return new Response(
				JSON.stringify({
					type: "error",
					error: {
						type: "internal_server_error",
						message: `${this.clientInfo.provider} bridge failure: ${error instanceof Error ? error.message : "Unknown error"}`,
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
		const responseData = await parseResponse(response.clone());

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
					? parseSSE(responseData.body_raw)
					: undefined;

			const contextWithResponse = { ...transformResult };
			const assistantResponse = decodedSSE ? extractAssistantFromSSE(decodedSSE, this.logger) : null;
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

	private safeJsonSchemaToZod(jsonSchema: any): z.ZodSchema {
		try {
			return jsonSchemaToZod(jsonSchema);
		} catch {
			return z.any();
		}
	}

	private logProviderError(error: any) {
		this.logger.error(`CRITICAL: ${this.clientInfo.provider} request failed with detailed error information:`);
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
		provider: (process.env["CLAUDE_BRIDGE_PROVIDER"] as Provider) || "openai",
		model: process.env["CLAUDE_BRIDGE_MODEL"] || "gpt-4o",
		apiKey: process.env["CLAUDE_BRIDGE_API_KEY"],
		baseURL: process.env["CLAUDE_BRIDGE_BASE_URL"],
		maxRetries: process.env["CLAUDE_BRIDGE_MAX_RETRIES"]
			? parseInt(process.env["CLAUDE_BRIDGE_MAX_RETRIES"])
			: undefined,
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
