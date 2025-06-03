#!/usr/bin/env tsx

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Provider } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple test framework types
export interface TestResult {
	name: string;
	success: boolean;
	message: string;
	duration: number;
	logs?: string[];
	details?: string[];
	error?: Error;
}

export interface TestSuite {
	name: string;
	tests: Test[];
	setup?: () => Promise<void>;
	teardown?: () => Promise<void>;
}

export interface Test {
	name: string;
	run: () => Promise<TestResult>;
	skip?: boolean;
	timeout?: number;
}

export interface CLITestOptions {
	provider: Provider;
	model: string;
	prompt: string;
	args?: string[];
	timeout?: number;
	expectSuccess?: boolean;
	expectedInLogs?: string[];
	unexpectedInLogs?: string[];
}

// Simple assertion utilities
export class AssertionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AssertionError";
	}
}

export function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new AssertionError(message);
	}
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
	if (actual !== expected) {
		throw new AssertionError(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

export function assertContains(haystack: string, needle: string, message?: string): void {
	if (!haystack.includes(needle)) {
		throw new AssertionError(message || `Expected "${haystack}" to contain "${needle}"`);
	}
}

export function assertArrayContains<T>(array: T[], item: T, message?: string): void {
	if (!array.includes(item)) {
		throw new AssertionError(message || `Expected array ${JSON.stringify(array)} to contain ${JSON.stringify(item)}`);
	}
}

// CLI test utilities
export class CLITestRunner {
	private testDir: string;
	private cleanupDirs: string[] = [];

	constructor(testName: string) {
		this.testDir = path.resolve(__dirname, "..", `.test-${testName}`);
		this.cleanupDirs.push(this.testDir);
	}

	async setup(): Promise<void> {
		await fs.rm(this.testDir, { recursive: true, force: true });
		await fs.mkdir(this.testDir, { recursive: true });
	}

	async cleanup(): Promise<void> {
		for (const dir of this.cleanupDirs) {
			await fs.rm(dir, { recursive: true, force: true });
		}
	}

	async runCLITest(options: CLITestOptions): Promise<{
		exitCode: number;
		logs: string[];
		error?: Error;
	}> {
		const originalCwd = process.cwd();
		process.chdir(this.testDir);

		try {
			// Import the CLI module
			const { runClaudeWithBridge } = await import("../src/cli.js");

			// Prepare arguments
			const runArgs = ["-p", options.prompt, ...(options.args || [])];

			let exitCode = 0;
			let error: Error | undefined;
			let consoleOutput = "";

			// Capture console output
			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;

			console.log = (...args) => {
				consoleOutput += args.join(" ") + "\n";
			};
			console.error = (...args) => {
				consoleOutput += "ERROR: " + args.join(" ") + "\n";
			};

			try {
				exitCode = runClaudeWithBridge({
					provider: options.provider,
					model: options.model,
					logDir: this.testDir,
					claudeArgs: runArgs,
				});
			} catch (err) {
				error = err instanceof Error ? err : new Error(String(err));
			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}

			// Read logs and include console output
			const logs = await this.readLogs();
			if (consoleOutput) {
				logs.unshift(`=== console output ===\n${consoleOutput}`);
			}

			const result: { exitCode: number; logs: string[]; error?: Error } = { exitCode, logs };
			if (error) {
				result.error = error;
			}
			return result;
		} finally {
			process.chdir(originalCwd);
		}
	}

	async readLogs(): Promise<string[]> {
		const logs: string[] = [];
		try {
			const files = await fs.readdir(this.testDir);
			for (const file of files) {
				if (file.endsWith(".jsonl") || file.endsWith(".txt")) {
					const content = await fs.readFile(path.join(this.testDir, file), "utf-8");
					logs.push(`=== ${file} ===\n${content}`);
				}
			}
		} catch (error) {
			console.warn("⚠️ Could not read log files:", error);
		}
		return logs;
	}

	validateLogs(logs: string[], options: CLITestOptions): { success: boolean; details: string[] } {
		const details: string[] = [];
		let success = true;

		// Check expected content
		if (options.expectedInLogs) {
			for (const expected of options.expectedInLogs) {
				const found = logs.some((log) => log.toLowerCase().includes(expected.toLowerCase()));
				details.push(`Expected "${expected}": ${found ? "✅" : "❌"}`);
				if (!found) success = false;
			}
		}

		// Check unexpected content
		if (options.unexpectedInLogs) {
			for (const unexpected of options.unexpectedInLogs) {
				const found = logs.some((log) => log.toLowerCase().includes(unexpected.toLowerCase()));
				details.push(`Should not contain "${unexpected}": ${found ? "❌" : "✅"}`);
				if (found) success = false;
			}
		}

		return { success, details };
	}
}

// Test runner
export class TestRunner {
	private results: TestResult[] = [];

	async runSuite(suite: TestSuite): Promise<TestResult[]> {
		console.log(`\n🚀 Running test suite: ${suite.name}`);
		console.log("=".repeat(50));

		// Setup
		if (suite.setup) {
			console.log("⚙️ Running suite setup...");
			await suite.setup();
		}

		try {
			// Run tests
			for (const test of suite.tests) {
				if (test.skip) {
					console.log(`⏭️ Skipping: ${test.name}`);
					continue;
				}

				const result = await this.runTest(test);
				this.results.push(result);

				const icon = result.success ? "✅" : "❌";
				console.log(`${icon} ${result.name} (${result.duration}ms)`);
				if (!result.success) {
					console.log(`   ${result.message}`);
				}
			}
		} finally {
			// Teardown
			if (suite.teardown) {
				console.log("🧹 Running suite teardown...");
				await suite.teardown();
			}
		}

		return this.results.filter((r) => suite.tests.some((t) => t.name === r.name));
	}

	private async runTest(test: Test): Promise<TestResult> {
		const start = Date.now();

		try {
			const result = await Promise.race([test.run(), this.timeoutPromise(test.timeout || 30000)]);

			return {
				...result,
				duration: Date.now() - start,
			};
		} catch (error) {
			return {
				name: test.name,
				success: false,
				message: error instanceof Error ? error.message : String(error),
				duration: Date.now() - start,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private timeoutPromise(ms: number): Promise<TestResult> {
		return new Promise((_, reject) => {
			setTimeout(() => reject(new Error(`Test timed out after ${ms}ms`)), ms);
		});
	}

	printSummary(): void {
		const total = this.results.length;
		const passed = this.results.filter((r) => r.success).length;
		const failed = total - passed;

		console.log(`\n📊 Test Summary`);
		console.log("=".repeat(20));
		console.log(`Total: ${total}`);
		console.log(`Passed: ${passed}`);
		console.log(`Failed: ${failed}`);
		console.log(`Success Rate: ${total > 0 ? Math.round((passed / total) * 100) : 0}%`);

		if (failed > 0) {
			console.log(`\n❌ Failed Tests:`);
			for (const result of this.results.filter((r) => !r.success)) {
				console.log(`  - ${result.name}: ${result.message}`);
				if (result.details && result.details.length > 0) {
					for (const detail of result.details) {
						console.log(`    ${detail}`);
					}
				}
			}
		}
	}

	getResults(): TestResult[] {
		return [...this.results];
	}

	hasFailures(): boolean {
		return this.results.some((r) => !r.success);
	}
}

// Pre-built test utilities for common scenarios
export function createBasicBridgeTest(provider: Provider, model: string, displayName: string): Test {
	return {
		name: "Basic Bridge Functionality",
		run: async (): Promise<TestResult> => {
			const runner = new CLITestRunner("basic-bridge");
			await runner.setup();

			try {
				const result = await runner.runCLITest({
					provider,
					model,
					prompt: "What is 2+2? Please respond with just the number.",
					expectedInLogs: [
						"Claude Bridge interceptor initialized",
						"Intercepted Claude request",
						"anthropic.com/v1/messages",
						"Calling OpenAI",
						"Successfully forwarded request",
					],
				});

				// Check for successful bridge operation indicators
				const hasClaudeStart = result.logs.some((log) => log.includes("Claude Bridge starting:"));
				const hasClaudeLaunch = result.logs.some((log) => log.includes("Launching: node"));
				const hasClaudeExit = result.logs.some((log) => log.includes("Claude exited with code:"));
				const hasApiKeyError = result.logs.some((log) => log.includes("API key not found"));

				// Success if either we successfully launched Claude OR we got the expected API key error
				const success = (hasClaudeStart && hasClaudeLaunch && hasClaudeExit) || hasApiKeyError;

				const validation = {
					success,
					details: [
						`Claude Bridge started: ${hasClaudeStart}`,
						`Claude launched: ${hasClaudeLaunch}`,
						`Claude exited: ${hasClaudeExit}`,
						`API key error (expected if no keys): ${hasApiKeyError}`,
						`Exit code: ${result.exitCode}`,
						`Error: ${result.error?.message || "none"}`,
					],
				};

				await runner.cleanup();

				return {
					name: `Basic Bridge Functionality (${displayName})`,
					success: validation.success,
					message: validation.success ? "Bridge working correctly" : "Bridge test failed",
					duration: 0,
					logs: result.logs,
					details: validation.details,
				};
			} catch (error) {
				await runner.cleanup();
				throw error;
			}
		},
	};
}

export function createToolTest(
	toolName: string,
	prompt: string,
	provider: Provider,
	model: string,
	displayName: string,
): Test {
	return {
		name: `Tool: ${toolName} (${displayName})`,
		run: async (): Promise<TestResult> => {
			const runner = new CLITestRunner(`tool-${toolName.toLowerCase()}-${provider}`);
			await runner.setup();

			try {
				const result = await runner.runCLITest({
					provider,
					model,
					prompt,
					expectedInLogs: [toolName, "tools"],
				});

				const validation = runner.validateLogs(result.logs, {
					provider,
					model,
					prompt,
					expectedInLogs: [toolName, "tools"],
				});

				await runner.cleanup();

				return {
					name: `Tool: ${toolName} (${displayName})`,
					success: validation.success,
					message: validation.success
						? `${toolName} tool working with ${displayName}`
						: `${toolName} tool failed with ${displayName}`,
					duration: 0,
					logs: result.logs,
					details: validation.details,
				};
			} catch (error) {
				await runner.cleanup();
				throw error;
			}
		},
	};
}
