#!/usr/bin/env tsx

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestResult {
	success: boolean;
	message: string;
	logs?: string[];
	details?: string[];
}

interface ToolTest {
	name: string;
	prompt: string;
	expectedInLogs: string[];
	description: string;
}

// Define all Claude Code tools and test prompts for each
const TOOL_TESTS: ToolTest[] = [
	{
		name: "Task",
		prompt: "Use the Task tool to search for files containing 'test' in the current directory",
		expectedInLogs: ["Task", "search for files"],
		description: "Task tool for delegating work to agents",
	},
	{
		name: "Bash",
		prompt: "Use the Bash tool to run 'echo hello world'",
		expectedInLogs: ["Bash", "echo hello world"],
		description: "Bash tool for executing shell commands",
	},
	{
		name: "Glob",
		prompt: "Use the Glob tool to find all .ts files",
		expectedInLogs: ["Glob", "*.ts"],
		description: "Glob tool for pattern-based file searching",
	},
	{
		name: "Grep",
		prompt: "Use the Grep tool to search for 'function' in TypeScript files",
		expectedInLogs: ["Grep", "function"],
		description: "Grep tool for content searching",
	},
	{
		name: "LS",
		prompt: "Use the LS tool to list files in the current directory",
		expectedInLogs: ["LS"],
		description: "LS tool for directory listing",
	},
	{
		name: "Read",
		prompt: "Use the Read tool to read package.json",
		expectedInLogs: ["Read", "package.json"],
		description: "Read tool for file reading",
	},
	{
		name: "Edit",
		prompt: "Use the Edit tool to modify a test file",
		expectedInLogs: ["Edit"],
		description: "Edit tool for file editing",
	},
	{
		name: "MultiEdit",
		prompt: "Use the MultiEdit tool to make multiple changes to a file",
		expectedInLogs: ["MultiEdit"],
		description: "MultiEdit tool for batch file editing",
	},
	{
		name: "Write",
		prompt: "Use the Write tool to create a test file",
		expectedInLogs: ["Write"],
		description: "Write tool for file creation",
	},
	{
		name: "WebFetch",
		prompt: "Use the WebFetch tool to fetch content from https://example.com",
		expectedInLogs: ["WebFetch", "example.com"],
		description: "WebFetch tool for web content retrieval",
	},
	{
		name: "TodoRead",
		prompt: "Use the TodoRead tool to check current todos",
		expectedInLogs: ["TodoRead"],
		description: "TodoRead tool for task list reading",
	},
	{
		name: "TodoWrite",
		prompt: "Use the TodoWrite tool to create a new todo list",
		expectedInLogs: ["TodoWrite"],
		description: "TodoWrite tool for task list management",
	},
	{
		name: "WebSearch",
		prompt: "Use the WebSearch tool to search for 'TypeScript best practices'",
		expectedInLogs: ["WebSearch", "TypeScript"],
		description: "WebSearch tool for web searching",
	},
];

async function runSingleToolTest(toolTest: ToolTest, testDir: string): Promise<TestResult> {
	console.log(`🔧 Testing ${toolTest.name}: ${toolTest.description}`);

	try {
		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			// Import the runClaudeWithBridge function
			const { runClaudeWithBridge } = await import("../src/cli.js");

			// Run Claude with the tool-specific prompt
			const exitCode = runClaudeWithBridge({
				provider: "openai",
				model: "gpt-4o",
				logDir: testDir,
				runWith: ["-p", toolTest.prompt],
			});

			console.log(`${toolTest.name} test: Claude exited with code: ${exitCode}`);
		} catch (error) {
			console.log(`${toolTest.name} test completed (expected):`, error);
		} finally {
			process.chdir(originalCwd);
		}

		// Check logs for tool usage
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
			console.warn(`⚠️ Could not read log files for ${toolTest.name}:`, error);
		}

		// Check if the tool was successfully converted and included
		const hasToolInSchema = logFiles.some(
			(log) =>
				log.includes(`Creating dummy tool: ${toolTest.name}`) ||
				log.includes(`Successfully converted tool ${toolTest.name}`),
		);

		const hasToolInTransformation = logFiles.some((log) => {
			// Look for the tool in transformed requests
			return log.includes(`"name": "${toolTest.name}"`) || log.includes(`${toolTest.name}"`);
		});

		const hasExpectedContent = toolTest.expectedInLogs.every((expected) =>
			logFiles.some((log) => log.toLowerCase().includes(expected.toLowerCase())),
		);

		const details = [
			`Tool in schema: ${hasToolInSchema}`,
			`Tool in transformation: ${hasToolInTransformation}`,
			`Expected content found: ${hasExpectedContent}`,
			`Expected content: ${toolTest.expectedInLogs.join(", ")}`,
		];

		if (hasToolInSchema) {
			return {
				success: true,
				message: `✅ ${toolTest.name} tool test passed`,
				logs: logFiles,
				details,
			};
		} else {
			return {
				success: false,
				message: `❌ ${toolTest.name} tool test failed - tool not found in logs`,
				logs: logFiles,
				details,
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `❌ ${toolTest.name} test setup error: ${error instanceof Error ? error.message : String(error)}`,
			details: [`Error: ${error}`],
		};
	}
}

async function runBasicBridgeTest(testDir: string): Promise<TestResult> {
	console.log("🧪 Running basic Claude Bridge functionality test...");

	try {
		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { runClaudeWithBridge } = await import("../src/cli.js");
			const exitCode = runClaudeWithBridge({
				provider: "openai",
				model: "gpt-4o",
				logDir: testDir,
				runWith: ["-p", "What is 2+2? Please respond with just the number."],
			});
			console.log(`Basic test: Claude exited with code: ${exitCode}`);
		} catch (error) {
			console.log("Basic test completed (expected):", error);
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
			(log) => log.includes("transformed-") && log.includes(".jsonl") && log.split("\n").length > 3,
		);
		const hasOpenAICalls = logFiles.some((log) => log.includes("Calling OpenAI with configured model:"));
		const hasSuccessfulForwarding = logFiles.some((log) =>
			log.includes("Successfully forwarded request to OpenAI and converted response"),
		);

		if (hasInterceptorLogs && hasClaudeRequests && hasTransformations && hasOpenAICalls && hasSuccessfulForwarding) {
			return {
				success: true,
				message: "✅ Basic bridge functionality test passed",
				logs: logFiles,
				details: [
					`Interceptor logs: ${hasInterceptorLogs}`,
					`Claude requests: ${hasClaudeRequests}`,
					`Transformations: ${hasTransformations}`,
					`OpenAI calls: ${hasOpenAICalls}`,
					`Successful forwarding: ${hasSuccessfulForwarding}`,
				],
			};
		} else {
			const missing = [];
			if (!hasInterceptorLogs) missing.push("interceptor logs");
			if (!hasClaudeRequests) missing.push("Claude requests");
			if (!hasTransformations) missing.push("transformations");
			if (!hasOpenAICalls) missing.push("OpenAI calls");
			if (!hasSuccessfulForwarding) missing.push("successful forwarding");

			return {
				success: false,
				message: `❌ Basic bridge test failed - missing: ${missing.join(", ")}`,
				logs: logFiles,
				details: [
					`Missing: ${missing.join(", ")}`,
					`Interceptor logs: ${hasInterceptorLogs}`,
					`Claude requests: ${hasClaudeRequests}`,
					`Transformations: ${hasTransformations}`,
					`OpenAI calls: ${hasOpenAICalls}`,
					`Successful forwarding: ${hasSuccessfulForwarding}`,
				],
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `❌ Basic bridge test setup error: ${error instanceof Error ? error.message : String(error)}`,
			details: [`Error: ${error}`],
		};
	}
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

		// Count how many tools were successfully converted
		const toolConversions = logFiles.filter(
			(log) => log.includes("Successfully converted tool") && log.includes("to Zod schema"),
		);

		const totalToolsConverted = logFiles.reduce((count, log) => {
			const matches = log.match(/Successfully converted tool \w+ to Zod schema/g);
			return count + (matches ? matches.length : 0);
		}, 0);

		const hasMultipleTools = totalToolsConverted >= 10; // Should have at least 10 core tools
		const hasZodConversion = logFiles.some((log) => log.includes("jsonSchemaToZod"));
		const hasSchemaValidation = logFiles.some(
			(log) => log.includes("Creating dummy tool") || log.includes("schema keys:"),
		);

		const details = [
			`Total tools converted: ${totalToolsConverted}`,
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

async function runComprehensiveToolsTest(): Promise<TestResult> {
	const testDir = path.resolve(__dirname, "..", ".test-claude-bridge-tools");

	try {
		// Clean up and recreate test directory
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		console.log("🚀 Starting Comprehensive Claude Bridge Tools Test");
		console.log("===============================================");
		console.log(`📁 Test directory: ${testDir}`);

		const results: TestResult[] = [];

		// 1. Basic bridge functionality test
		console.log("\n📋 Step 1: Basic Bridge Functionality");
		console.log("=====================================");
		const basicResult = await runBasicBridgeTest(testDir);
		results.push(basicResult);
		console.log(basicResult.message);

		if (!basicResult.success) {
			return {
				success: false,
				message: "❌ Basic bridge test failed - cannot proceed with tool tests",
				logs: basicResult.logs,
				details: basicResult.details,
			};
		}

		// 2. Tool schema validation test
		console.log("\n📋 Step 2: Tool Schema Validation");
		console.log("==================================");
		const schemaResult = await runToolSchemaValidationTest(testDir);
		results.push(schemaResult);
		console.log(schemaResult.message);

		// 3. Individual tool tests (sample of important tools)
		console.log("\n📋 Step 3: Individual Tool Tests");
		console.log("=================================");

		// Test a subset of the most important tools to avoid overwhelming the system
		const priorityTools = TOOL_TESTS.filter((tool) =>
			["Bash", "Read", "Write", "Edit", "LS", "Glob", "Grep"].includes(tool.name),
		);

		for (const toolTest of priorityTools) {
			// Clean test directory for each tool test
			await fs.rm(testDir, { recursive: true, force: true });
			await fs.mkdir(testDir, { recursive: true });

			const toolResult = await runSingleToolTest(toolTest, testDir);
			results.push(toolResult);
			console.log(toolResult.message);

			// Short delay between tests
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		// Aggregate results
		const successful = results.filter((r) => r.success).length;
		const total = results.length;
		const allLogs = results.flatMap((r) => r.logs || []);
		const allDetails = results.flatMap((r) => r.details || []);

		if (successful === total) {
			return {
				success: true,
				message: `✅ All tests passed (${successful}/${total}) - Claude Bridge tools working correctly`,
				logs: allLogs,
				details: allDetails,
			};
		} else {
			return {
				success: false,
				message: `❌ Some tests failed (${successful}/${total}) - see details for specifics`,
				logs: allLogs,
				details: allDetails,
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `❌ Test setup error: ${error instanceof Error ? error.message : String(error)}`,
			details: [`Setup error: ${error}`],
		};
	}
}

async function main() {
	try {
		const result = await runComprehensiveToolsTest();

		console.log("\n📊 Final Test Results:");
		console.log("======================");
		console.log(result.message);

		if (result.details && result.details.length > 0) {
			console.log("\n📋 Test Details:");
			console.log("================");
			for (const detail of result.details) {
				console.log(`  ${detail}`);
			}
		}

		if (result.logs && result.logs.length > 0 && !result.success) {
			console.log("\n📝 Logs (only shown on failure):");
			console.log("=================================");
			for (const log of result.logs.slice(-2)) {
				// Show last 2 log files only
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

export { runComprehensiveToolsTest, main as testMain };
