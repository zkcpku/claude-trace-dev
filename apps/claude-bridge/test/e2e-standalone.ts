#!/usr/bin/env tsx

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cliMain from "../src/cli.js";

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

		const testArgs = [
			"node",
			"cli.js",
			"--provider",
			"openai",
			"--model",
			"gpt-4o",
			"--log-dir",
			testDir,
			"--run-with",
			"-p",
			"What is 2+2?",
		];

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			await cliMain(testArgs);
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

		if (hasInterceptorLogs && hasClaudeRequests && hasTransformations) {
			return {
				success: true,
				message: "✅ Test passed - interceptor working, requests detected, and transformations logged",
				logs: logFiles,
			};
		} else {
			return {
				success: false,
				message: "❌ Test failed - missing transformations (transformed file is empty)",
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
