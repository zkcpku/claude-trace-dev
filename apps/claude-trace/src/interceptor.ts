import fs from "fs";
import path from "path";
import { RawPair } from "./types";
import { HTMLGenerator } from "./html-generator";

export interface InterceptorConfig {
	logDirectory?: string;
	enableRealTimeHTML?: boolean;
	logLevel?: "debug" | "info" | "warn" | "error";
}

export class ClaudeTrafficLogger {
	private logDir: string;
	private logFile: string;
	private htmlFile: string;
	private pendingRequests: Map<string, any> = new Map();
	private pairs: RawPair[] = [];
	private config: InterceptorConfig;
	private htmlGenerator: HTMLGenerator;

	constructor(config: InterceptorConfig = {}) {
		this.config = {
			logDirectory: ".claude-trace",
			enableRealTimeHTML: true,
			logLevel: "info",
			...config,
		};

		// Create log directory if it doesn't exist
		this.logDir = this.config.logDirectory!;
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true });
		}

		// Generate timestamped filenames
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, -5); // Remove milliseconds and Z

		this.logFile = path.join(this.logDir, `log-${timestamp}.jsonl`);
		this.htmlFile = path.join(this.logDir, `log-${timestamp}.html`);

		// Initialize HTML generator
		this.htmlGenerator = new HTMLGenerator();

		// Clear log file
		fs.writeFileSync(this.logFile, "");
	}

	private isAnthropicAPI(url: string | URL): boolean {
		const urlString = typeof url === "string" ? url : url.toString();
		return (
			urlString.includes("api.anthropic.com") &&
			(urlString.includes("/v1/messages") || urlString.includes("/chat/completions"))
		);
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
				// Keep first 10 chars and last 4 chars, redact middle
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

	private async cloneResponse(response: Response): Promise<Response> {
		// Clone the response to avoid consuming the body
		return response.clone();
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
				// For other types, try to read as text
				const body_raw = await response.text();
				return { body_raw };
			}
		} catch (error) {
			// Silent error handling during runtime
			return {};
		}
	}

	public instrumentFetch(): void {
		if (!global.fetch) {
			// Silent - fetch not available
			return;
		}

		// Check if already instrumented by checking for our marker
		if ((global.fetch as any).__claudeTraceInstrumented) {
			return;
		}

		const originalFetch = global.fetch;
		const logger = this;

		global.fetch = async function (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
			// Convert input to URL for consistency
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

			// Only intercept Anthropic API calls
			if (!logger.isAnthropicAPI(url)) {
				return originalFetch(input, init);
			}

			const requestId = logger.generateRequestId();
			const requestTimestamp = Date.now();

			// Capture request details
			const requestData = {
				timestamp: requestTimestamp / 1000, // Convert to seconds (like Python version)
				method: init.method || "GET",
				url: url,
				headers: logger.redactSensitiveHeaders(Object.fromEntries(new Headers(init.headers || {}).entries())),
				body: await logger.parseRequestBody(init.body),
			};

			// Store pending request
			logger.pendingRequests.set(requestId, requestData);

			try {
				// Make the actual request
				const response = await originalFetch(input, init);
				const responseTimestamp = Date.now();

				// Clone response to avoid consuming the body
				const clonedResponse = await logger.cloneResponse(response);

				// Parse response body
				const responseBodyData = await logger.parseResponseBody(clonedResponse);

				// Create response data
				const responseData = {
					timestamp: responseTimestamp / 1000,
					status_code: response.status,
					headers: logger.redactSensitiveHeaders(Object.fromEntries(response.headers.entries())),
					...responseBodyData,
				};

				// Create paired request-response object
				const pair: RawPair = {
					request: requestData,
					response: responseData,
					logged_at: new Date().toISOString(),
				};

				// Remove from pending and add to pairs
				logger.pendingRequests.delete(requestId);
				logger.pairs.push(pair);

				// Write to log file
				await logger.writePairToLog(pair);

				// Generate HTML if enabled
				if (logger.config.enableRealTimeHTML) {
					await logger.generateHTML();
				}

				return response;
			} catch (error) {
				// Remove from pending requests on error
				logger.pendingRequests.delete(requestId);
				throw error;
			}
		};

		// Mark fetch as instrumented
		(global.fetch as any).__claudeTraceInstrumented = true;

		// Silent initialization
	}

	private async writePairToLog(pair: RawPair): Promise<void> {
		try {
			const jsonLine = JSON.stringify(pair) + "\n";
			fs.appendFileSync(this.logFile, jsonLine);
		} catch (error) {
			// Silent error handling during runtime
		}
	}

	private async generateHTML(): Promise<void> {
		try {
			const includeCosmetics = process.env.CLAUDE_TRACE_INCLUDE_COSMETICS === "true";
			await this.htmlGenerator.generateHTML(this.pairs, this.htmlFile, {
				title: `${this.pairs.length} API Calls`,
				timestamp: new Date().toISOString().replace("T", " ").slice(0, -5),
				includeCosmetics,
			});
			// Silent HTML generation
		} catch (error) {
			// Silent error handling during runtime
		}
	}

	public cleanup(): void {
		console.log("Cleaning up orphaned requests...");

		for (const [, requestData] of this.pendingRequests.entries()) {
			const orphanedPair = {
				request: requestData,
				response: null,
				note: "ORPHANED_REQUEST - No matching response received",
				logged_at: new Date().toISOString(),
			};

			try {
				const jsonLine = JSON.stringify(orphanedPair) + "\n";
				fs.appendFileSync(this.logFile, jsonLine);
			} catch (error) {
				console.log(`Error writing orphaned request: ${error}`);
			}
		}

		this.pendingRequests.clear();
		console.log(`Cleanup complete. Logged ${this.pairs.length} pairs`);
	}

	public getStats() {
		return {
			totalPairs: this.pairs.length,
			pendingRequests: this.pendingRequests.size,
			logFile: this.logFile,
			htmlFile: this.htmlFile,
		};
	}
}

// Global logger instance
let globalLogger: ClaudeTrafficLogger | null = null;

// Track if event listeners have been set up
let eventListenersSetup = false;

export function initializeInterceptor(config?: InterceptorConfig): ClaudeTrafficLogger {
	if (globalLogger) {
		console.warn("Interceptor already initialized");
		return globalLogger;
	}

	globalLogger = new ClaudeTrafficLogger(config);
	globalLogger.instrumentFetch();

	// Setup cleanup on process exit only once
	if (!eventListenersSetup) {
		const cleanup = () => {
			if (globalLogger) {
				globalLogger.cleanup();
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

	return globalLogger;
}

export function getLogger(): ClaudeTrafficLogger | null {
	return globalLogger;
}
