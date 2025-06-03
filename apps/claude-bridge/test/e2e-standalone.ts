#!/usr/bin/env tsx

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestResult {
	success: boolean;
	message: string;
	logs?: string[];
}

async function runClaudeBridgeTest(): Promise<TestResult> {
	const testDir = path.resolve(__dirname, "..", ".test-claude-bridge-e2e");

	try {
		// Clean up and recreate test directory
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		console.log("🧪 Running Claude Bridge E2E test...");
		console.log(`📁 Test directory: ${testDir}`);

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			// Import the runClaudeWithBridge function directly to avoid process.exit
			const { runClaudeWithBridge } = await import("../src/cli.js");
			const exitCode = runClaudeWithBridge({
				provider: "openai",
				model: "gpt-4o",
				logDir: testDir,
				runWith: ["-p", "What is 2+2?"],
			});
			console.log(`Claude exited with code: ${exitCode}`);
		} catch (error) {
			console.log("Main function completed with error (expected):", error);
		} finally {
			process.chdir(originalCwd);
		}

		// Check logs
		const logFiles = [];
		try {
			const files = await fs.readdir(testDir);
			for (const file of files) {
				if (file.endsWith(".jsonl") || file.endsWith(".txt")) {
					const content = await fs.readFile(path.join(testDir, file), "utf-8");
					logFiles.push(`=== ${file} ===\n${content}`);
				}
			}
		} catch (error) {
			console.warn("⚠️ Could not read log files:", error);
		}

		const hasInterceptorLogs = logFiles.some(
			(log) =>
				log.includes("Claude Bridge interceptor initialized") ||
				log.includes("Intercepted Claude request") ||
				log.includes("Skipping transformation"),
		);

		const hasClaudeRequests = logFiles.some((log) => log.includes("anthropic.com/v1/messages"));

		const hasTransformations = logFiles.some(
			(log) => log.includes("transformed-") && log.includes(".jsonl") && log.split("\n").length > 3, // More than just the header
		);

		// Check for OpenAI integration - these indicate successful bridging
		const hasOpenAICalls = logFiles.some((log) => log.includes("Calling OpenAI with configured model:"));
		const hasSuccessfulForwarding = logFiles.some((log) =>
			log.includes("Successfully forwarded request to OpenAI and converted response"),
		);

		// Check that we actually get a meaningful response
		const hasValidResponse = logFiles.some((log) => {
			// Look for responses that contain actual content (not just empty/error responses)
			return log.includes('"content"') && (log.includes("4") || log.includes("2+2") || log.includes("answer"));
		});

		if (hasInterceptorLogs && hasClaudeRequests && hasTransformations && hasOpenAICalls && hasSuccessfulForwarding) {
			return {
				success: true,
				message: `✅ Test passed - OpenAI bridge working successfully${hasValidResponse ? " with valid response" : ""}`,
				logs: logFiles,
			};
		} else {
			// More detailed error reporting
			const missing = [];
			if (!hasInterceptorLogs) missing.push("interceptor logs");
			if (!hasClaudeRequests) missing.push("Claude requests");
			if (!hasTransformations) missing.push("transformations");
			if (!hasOpenAICalls) missing.push("OpenAI calls");
			if (!hasSuccessfulForwarding) missing.push("successful forwarding");

			return {
				success: false,
				message: `❌ Test failed - missing: ${missing.join(", ")}`,
				logs: logFiles,
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `Setup error: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

async function main() {
	console.log("🚀 Starting Claude Bridge E2E Test");
	console.log("=====================================");

	try {
		const result = await runClaudeBridgeTest();

		console.log("\n📊 Test Results:");
		console.log("================");
		console.log(result.message);

		if (result.logs && result.logs.length > 0) {
			console.log("\n📝 Logs:");
			console.log("=========");
			for (const log of result.logs) {
				console.log(log);
				console.log("---");
			}
		}

		process.exit(result.success ? 0 : 1);
	} catch (error) {
		console.error("💥 Fatal error:", error);
		process.exit(1);
	}
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}

export { runClaudeBridgeTest, main as testMain };
