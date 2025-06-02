#!/usr/bin/env node --no-deprecation

import { Command } from "commander";
import { spawn, spawnSync } from "child_process";
import { getDefaultApiKeyEnvVar, getProviders } from "@mariozechner/lemmy";
import path from "path";
import { fileURLToPath } from "url";
import { patchClaudeBinary } from "./patch-claude.js";

interface ClaudeArgs {
	provider: string;
	model: string;
	apiKey?: string;
	logDir?: string;
	runWith?: string[];
	patchClaude?: boolean;
}

function setupProgram(): Command {
	const program = new Command();

	program
		.name("claude-bridge")
		.description("Use non-Anthropic models with Claude Code by proxying requests")
		.version("1.0.0");

	program.addOption(
		program
			.createOption("--provider <provider>", "LLM provider to bridge to")
			.choices(getProviders().filter((p) => p !== "anthropic")),
	);

	program.option("--model <model>", "Model to use with the provider");

	program.option("--apiKey <key>", "API key for the provider (optional, uses env vars if not provided)");

	program.option("--log-dir <dir>", "Directory for log files (default: .claude-bridge)");

	program.option("--run-with <args...>", "Arguments to pass to Claude Code (default: chat)");

	program.option(
		"--patch-claude",
		"Patch Claude binary to disable anti-debugging checks (allows debugging interceptor)",
	);

	program.addHelpText(
		"after",
		`
Examples:
  # Use OpenAI GPT-4o with Claude Code
  claude-bridge --provider openai --model gpt-4o --run-with chat

  # Use Google Gemini with a specific prompt
  claude-bridge --provider google --model gemini-1.5-pro --run-with -p "Hello world"

  # Use custom API key
  claude-bridge --provider openai --model gpt-4o --apiKey sk-... --run-with chat

Environment Variables:
  ANTHROPIC_API_KEY    - Fallback if --apiKey not provided and provider is anthropic
  OPENAI_API_KEY       - Fallback if --apiKey not provided and provider is openai
  GOOGLE_API_KEY       - Fallback if --apiKey not provided and provider is google

Note: The interceptor logs requests to .claude-bridge/requests.jsonl and debug info to .claude-bridge/log.txt in the current directory.
`,
	);

	return program;
}

function findClaudeExecutable(): string {
	// Try to find claude in PATH
	const possibleNames = ["claude", "claude-code"];

	for (const name of possibleNames) {
		try {
			const result = spawnSync("which", [name], { stdio: "pipe", encoding: "utf-8" });
			if (result.status === 0) {
				return result.stdout.trim();
			}
		} catch {
			// Continue searching
		}
	}

	// If not found, show error and exit
	console.error("❌ Claude CLI not found in PATH");
	console.error("❌ Please install Claude Code CLI first");
	process.exit(1);
}

async function runClaudeWithBridge(args: ClaudeArgs): Promise<void> {
	if (!args.provider) {
		console.error("❌ --provider is required");
		process.exit(1);
	}

	if (!args.model) {
		console.error("❌ --model is required");
		process.exit(1);
	}

	// Default to chat if no run-with args provided
	const claudeArgs = args.runWith && args.runWith.length > 0 ? args.runWith : [];

	let apiKey = args.apiKey;
	if (!apiKey) {
		const envVar = getDefaultApiKeyEnvVar(args.provider as "anthropic" | "openai" | "google");
		apiKey = process.env[envVar];
		if (!apiKey) {
			console.error(`❌ API key not found. Provide --apiKey or set ${envVar} environment variable`);
			process.exit(1);
		}
	}

	console.log(`🌉 Claude Bridge starting:`);
	console.log(`   Provider: ${args.provider}`);
	console.log(`   Model: ${args.model}`);
	console.log(`   Logging to: ${args.logDir || ".claude-bridge"}/requests.jsonl`);

	let claudeExe = findClaudeExecutable();

	// Patch Claude binary if requested
	if (args.patchClaude) {
		console.log("🔧 Patching Claude binary to disable anti-debugging...");
		const logDir = args.logDir || ".claude-bridge";
		claudeExe = patchClaudeBinary(claudeExe, logDir);
	}

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const interceptorLoader = path.join(__dirname, "interceptor-loader.js");

	// Filter out debugging flags from node arguments
	const cleanNodeArgs = ["--import", interceptorLoader];

	const spawnArgs = [...cleanNodeArgs, claudeExe, ...claudeArgs];

	console.log(`🚀 Launching: node ${spawnArgs.join(" ")}`);

	// Clean environment to avoid Claude's anti-debugging checks
	const cleanEnv = { ...process.env };

	// Remove debugging-related environment variables
	if (cleanEnv["NODE_OPTIONS"]) {
		// Remove debugging flags and other problematic options
		cleanEnv["NODE_OPTIONS"] = cleanEnv["NODE_OPTIONS"]
			.replace(/--inspect(-brk)?|--debug(-brk)?/g, "")
			.replace(/-publish-uid=\S+/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!cleanEnv["NODE_OPTIONS"]) {
			delete cleanEnv["NODE_OPTIONS"];
		}
	}

	const childProcess = spawn("node", spawnArgs, {
		stdio: "inherit",
		env: {
			...cleanEnv,
			CLAUDE_BRIDGE_PROVIDER: args.provider,
			CLAUDE_BRIDGE_MODEL: args.model,
			CLAUDE_BRIDGE_API_KEY: apiKey,
			CLAUDE_BRIDGE_LOG_DIR: args.logDir,
		},
	});

	childProcess.on("error", (error) => {
		console.error(`❌ Failed to start Claude: ${error.message}`);
		process.exit(1);
	});

	childProcess.on("exit", (code, signal) => {
		if (signal) {
			console.log(`\n🛑 Claude terminated by signal: ${signal}`);
		} else {
			console.log(`\n✅ Claude exited with code: ${code}`);
		}
		process.exit(code || 0);
	});

	process.on("SIGINT", () => {
		console.log("\n🛑 Received SIGINT, terminating Claude...");
		childProcess.kill("SIGINT");
	});

	process.on("SIGTERM", () => {
		console.log("\n🛑 Received SIGTERM, terminating Claude...");
		childProcess.kill("SIGTERM");
	});
}

async function main(argv: string[] = process.argv) {
	const program = setupProgram();

	program.action(async (options) => {
		await runClaudeWithBridge({
			provider: options.provider,
			model: options.model,
			apiKey: options.apiKey,
			logDir: options.logDir,
			runWith: options.runWith,
			patchClaude: options.patchClaude,
		});
	});

	try {
		await program.parseAsync(argv);
	} catch (error) {
		console.error(`❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
	process.exit(1);
});

// Export functions for testing
export default main;
export { runClaudeWithBridge };

// Only run if this file is executed directly (ESM check)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
