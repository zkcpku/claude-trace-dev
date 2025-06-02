import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeBridgeInterceptor, initializeInterceptor } from "../src/interceptor.js";
import fs from "fs";
import path from "path";

describe("Claude Bridge Smoke Test", () => {
	const testLogDir = ".test-claude-bridge-smoke";

	beforeEach(() => {
		// Clean up test directory
		if (fs.existsSync(testLogDir)) {
			fs.rmSync(testLogDir, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test directory
		if (fs.existsSync(testLogDir)) {
			fs.rmSync(testLogDir, { recursive: true });
		}
	});

	it("should create log directory and file when initializing interceptor", () => {
		// Mock console.log to suppress output during test
		const originalLog = console.log;
		console.log = () => {};

		try {
			// Initialize interceptor with test config
			const interceptor = new ClaudeBridgeInterceptor({
				provider: "openai",
				model: "gpt-4o",
				apiKey: "test-key",
				logDirectory: testLogDir,
			});

			// Verify log directory was created
			expect(fs.existsSync(testLogDir)).toBe(true);

			// Verify requests file was created
			const requestFiles = fs
				.readdirSync(testLogDir)
				.filter((f) => f.startsWith("requests-") && f.endsWith(".jsonl"));
			expect(requestFiles.length).toBe(1);

			// Verify log.txt file was created
			const logFile = path.join(testLogDir, "log.txt");
			expect(fs.existsSync(logFile)).toBe(true);
			expect(fs.statSync(logFile).isFile()).toBe(true);

			// Verify the requests file exists and is a valid file
			const requestsFile = path.join(testLogDir, requestFiles[0]!);
			expect(fs.existsSync(requestsFile)).toBe(true);
			expect(fs.statSync(requestsFile).isFile()).toBe(true);

			// Test that stats are accessible
			const stats = interceptor.getStats();
			expect(stats.totalPairs).toBe(0);
			expect(stats.pendingRequests).toBe(0);
			expect(stats.requestsFile).toContain(testLogDir);

			// Clean up
			interceptor.cleanup();
		} finally {
			console.log = originalLog;
		}
	});

	it("should intercept fetch calls when instrumented", async () => {
		const originalFetch = global.fetch;

		try {
			// Initialize interceptor
			const interceptor = new ClaudeBridgeInterceptor({
				provider: "openai",
				model: "gpt-4o",
				apiKey: "test-key",
				logDirectory: testLogDir,
			});

			// Mock fetch to return a test response
			const mockResponse = new Response(JSON.stringify({ test: "response" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
			global.fetch = async () => mockResponse.clone();

			// Instrument fetch
			interceptor.instrumentFetch();

			// Make a test request to Anthropic API
			await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: { Authorization: "Bearer test-key" },
				body: JSON.stringify({ model: "claude-3-sonnet", messages: [{ role: "user", content: "test" }] }),
			});

			// Wait a bit for async logging
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify interception happened
			const stats = interceptor.getStats();
			expect(stats.totalPairs).toBe(1);

			// Verify log files were created and contain expected content
			const logFile = path.join(testLogDir, "log.txt");
			expect(fs.existsSync(logFile)).toBe(true);

			const logContent = fs.readFileSync(logFile, "utf-8");
			expect(logContent).toContain("Intercepted Claude request");
			expect(logContent).toContain("Logged request-response pair");

			// Verify requests file has content
			const requestFiles = fs
				.readdirSync(testLogDir)
				.filter((f) => f.startsWith("requests-") && f.endsWith(".jsonl"));
			expect(requestFiles.length).toBe(1);

			const requestsFile = path.join(testLogDir, requestFiles[0]!);
			const requestsContent = fs.readFileSync(requestsFile, "utf-8");
			expect(requestsContent.trim()).not.toBe("");

			interceptor.cleanup();
		} finally {
			global.fetch = originalFetch;
		}
	});

	it("should not intercept non-Anthropic calls", async () => {
		const originalFetch = global.fetch;

		try {
			const interceptor = new ClaudeBridgeInterceptor({
				provider: "openai",
				model: "gpt-4o",
				apiKey: "test-key",
				logDirectory: testLogDir,
			});

			// Mock fetch
			const mockResponse = new Response(JSON.stringify({ test: "response" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
			global.fetch = async () => mockResponse.clone();

			// Instrument fetch
			interceptor.instrumentFetch();

			// Make a test request to non-Anthropic API
			await fetch("https://api.openai.com/v1/chat/completions");

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify NO interception happened
			const stats = interceptor.getStats();
			expect(stats.totalPairs).toBe(0);

			// Verify log only contains initialization, not interception
			const logFile = path.join(testLogDir, "log.txt");
			const logContent = fs.readFileSync(logFile, "utf-8");
			expect(logContent).not.toContain("Intercepted Claude request");

			interceptor.cleanup();
		} finally {
			global.fetch = originalFetch;
		}
	});

	it("should use environment variables for default config", () => {
		const originalEnv = { ...process.env };
		const originalLog = console.log;
		console.log = () => {};

		try {
			// Set test environment variables
			process.env["CLAUDE_BRIDGE_PROVIDER"] = "google";
			process.env["CLAUDE_BRIDGE_MODEL"] = "gemini-1.5-pro";
			process.env["CLAUDE_BRIDGE_API_KEY"] = "test-google-key";
			process.env["CLAUDE_BRIDGE_LOG_DIR"] = testLogDir;

			// Initialize interceptor with env vars
			const interceptor = initializeInterceptor();

			// Verify log directory was created using env var
			expect(fs.existsSync(testLogDir)).toBe(true);

			interceptor.cleanup();
		} finally {
			// Restore environment
			Object.assign(process.env, originalEnv);
			console.log = originalLog;
		}
	});
});
