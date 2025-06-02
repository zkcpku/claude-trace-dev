import fs from "fs";
import path from "path";
import { RawPair, BridgeConfig } from "./types.js";
import { transformAnthropicToLemmy, type TransformResult } from "./transform.js";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/messages.js";

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

			// Transform Anthropic request to lemmy format
			await interceptor.transformAndLogRequest(requestData);

			interceptor.pendingRequests.set(requestId, requestData);

			try {
				const response = await originalFetch(input, init);
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

	private async transformAndLogRequest(requestData: any): Promise<void> {
		try {
			// Only transform POST requests to /v1/messages
			if (requestData.method !== "POST" || !requestData.body) {
				return;
			}

			const anthropicRequest = requestData.body as MessageCreateParamsBase;

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
		} catch (error) {
			this.logger.error(`Failed to transform request: ${error instanceof Error ? error.message : String(error)}`);
		}
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
