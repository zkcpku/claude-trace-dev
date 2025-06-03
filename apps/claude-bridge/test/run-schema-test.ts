#!/usr/bin/env tsx

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { TransformationEntry } from "../src/types.js";
import type { SerializedToolDefinition } from "@mariozechner/lemmy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestResult {
	success: boolean;
	message: string;
	logs?: string[];
	details?: string[];
}

async function runToolSchemaValidationTest(testDir: string): Promise<TestResult> {
	console.log("🔍 Running tool schema validation test...");

	try {
		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { runClaudeWithBridge } = await import("../src/cli.js");
			const exitCode = runClaudeWithBridge({
				provider: "openai",
				model: "gpt-4o",
				logDir: testDir,
				runWith: [
					"-p",
					"Please use multiple tools: first use LS to list files, then use Read to read a file, then use Bash to echo something.",
				],
			});
			console.log(`Schema validation test: Claude exited with code: ${exitCode}`);
		} catch (error) {
			console.log("Schema validation test completed (expected):", error);
		} finally {
			process.chdir(originalCwd);
		}

		// Check logs for tool schema conversion
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
			console.warn("⚠️ Could not read log files for schema validation:", error);
		}

		// Parse the transformed JSONL file to extract tool information
		let totalToolsConverted = 0;
		let toolNames: string[] = [];

		try {
			const transformedFiles = await fs.readdir(testDir);
			const transformedFile = transformedFiles.find(
				(file) => file.startsWith("transformed-") && file.endsWith(".jsonl"),
			);

			if (transformedFile) {
				const transformedContent = await fs.readFile(path.join(testDir, transformedFile), "utf-8");
				const lines = transformedContent
					.trim()
					.split("\n")
					.filter((line) => line.length > 0);

				for (const line of lines) {
					try {
						const entry: TransformationEntry = JSON.parse(line);
						if (entry.lemmy_context && entry.lemmy_context.tools) {
							const tools: SerializedToolDefinition[] = entry.lemmy_context.tools;
							const entryToolNames = tools.map((tool) => tool.name);
							toolNames = Array.from(new Set([...toolNames, ...entryToolNames]));
						}
					} catch (parseError) {
						console.warn("Failed to parse transformation entry:", parseError);
					}
				}
				totalToolsConverted = toolNames.length;
			}
		} catch (error) {
			console.warn("Failed to read transformed file:", error);
		}

		const hasMultipleTools = totalToolsConverted >= 15; // Should have at least 15 core tools
		const hasZodConversion = logFiles.some(
			(log) => log.includes("jsonSchemaToZod") || log.includes("Calling OpenAI"),
		);
		const hasSchemaValidation = logFiles.some(
			(log) => log.includes("Transformed and logged request") || log.includes("tools"),
		);

		const details = [
			`Total tools converted: ${totalToolsConverted}`,
			`Tool names: ${toolNames.join(", ")}`,
			`Multiple tools found: ${hasMultipleTools}`,
			`Zod conversion: ${hasZodConversion}`,
			`Schema validation: ${hasSchemaValidation}`,
		];

		if (hasMultipleTools && hasZodConversion && hasSchemaValidation) {
			return {
				success: true,
				message: `✅ Tool schema validation test passed - ${totalToolsConverted} tools converted`,
				logs: logFiles,
				details,
			};
		} else {
			return {
				success: false,
				message: `❌ Tool schema validation test failed`,
				logs: logFiles,
				details,
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `❌ Schema validation test setup error: ${error instanceof Error ? error.message : String(error)}`,
			details: [`Error: ${error}`],
		};
	}
}

async function main() {
	const testDir = path.resolve(__dirname, "..", ".test-claude-bridge-schema");

	try {
		// Clean up and recreate test directory
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		console.log("🚀 Running Tool Schema Validation Test");
		console.log("=====================================");
		console.log(`📁 Test directory: ${testDir}`);

		const result = await runToolSchemaValidationTest(testDir);

		console.log("\n📊 Test Results:");
		console.log("================");
		console.log(result.message);

		if (result.details && result.details.length > 0) {
			console.log("\n📋 Test Details:");
			console.log("================");
			for (const detail of result.details) {
				console.log(`  ${detail}`);
			}
		}

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

export { runToolSchemaValidationTest };
