#!/usr/bin/env node

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { HTMLGenerator } from "./html-generator";

// Colors for output
const colors = {
	red: "\x1b[0;31m",
	green: "\x1b[0;32m",
	yellow: "\x1b[1;33m",
	blue: "\x1b[0;34m",
	reset: "\x1b[0m",
} as const;

type ColorName = keyof typeof colors;

function log(message: string, color: ColorName = "reset"): void {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function showHelp(): void {
	console.log(`
${colors.blue}Claude Trace${colors.reset}
Record all your interactions with Claude Code as you develop your projects

${colors.yellow}USAGE:${colors.reset}
  claude-trace [OPTIONS] [COMMAND]

${colors.yellow}OPTIONS:${colors.reset}
  --extract-token    Extract OAuth token and exit (reproduces claude-token.py)
  --help, -h         Show this help message

${colors.yellow}MODES:${colors.reset}
  ${colors.green}Interactive logging:${colors.reset}
    claude-trace                     Start Claude with traffic logging
    claude-trace claude chat         Run specific Claude command with logging
    
  ${colors.green}Token extraction:${colors.reset}
    claude-trace --extract-token     Extract OAuth token for SDK usage
    
  ${colors.green}HTML generation:${colors.reset}
    claude-trace file.jsonl          Generate HTML from JSONL file
    claude-trace file.jsonl out.html Generate HTML with custom output name

${colors.yellow}EXAMPLES:${colors.reset}
  # Start Claude with logging
  claude-trace
  
  # Run specific command with logging  
  claude-trace claude chat --model sonnet-3.5
  
  # Extract token for Anthropic SDK
  export ANTHROPIC_API_KEY=$(claude-trace --extract-token)
  
  # Generate HTML report
  claude-trace logs/traffic.jsonl report.html

${colors.yellow}OUTPUT:${colors.reset}
  Logs are saved to: ${colors.green}.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}${colors.reset}
  
${colors.yellow}MIGRATION:${colors.reset}
  This tool replaces Python-based claude-logger and claude-token.py scripts
  with a pure Node.js implementation. All output formats are compatible.

For more information, visit: https://github.com/mariozechner/claude-trace
`);
}

function checkDependencies(): void {
	// Skip dependency check for flags
	if (process.argv.includes("--extract-token")) {
		// For token extraction, we just need claude to exist
		try {
			require("child_process").execSync("which claude", { stdio: "ignore" });
		} catch {
			log(`❌ Command not found: 'claude'. Please install Claude Code CLI`, "red");
			process.exit(1);
		}
		return;
	}

	// Check if claude command exists
	const claudeCmd = process.argv[2] || "claude";
	const claudeExecutable = claudeCmd.split(" ")[0];

	try {
		require("child_process").execSync(`which ${claudeExecutable}`, { stdio: "ignore" });
	} catch {
		log(`❌ Command not found: '${claudeExecutable}'. Please check the path or install required dependencies`, "red");
		process.exit(1);
	}
}

function ensureFrontendBuilt(): void {
	// In published package, frontend should be pre-built
	const packageDir = path.join(__dirname, "..");
	const bundlePath = path.join(packageDir, "frontend", "dist", "index.global.js");

	if (!fs.existsSync(bundlePath)) {
		log("⚠️  Frontend bundle not found. This might be a development environment.", "yellow");

		const frontendDir = path.join(packageDir, "frontend");
		if (fs.existsSync(frontendDir) && fs.existsSync(path.join(frontendDir, "package.json"))) {
			log("🔄 Building frontend...", "yellow");

			try {
				require("child_process").execSync("npm run build", {
					cwd: frontendDir,
					stdio: "inherit",
				});
				log("✅ Frontend built successfully", "green");
			} catch (error) {
				log('❌ Failed to build frontend. Please run "npm run build" in the frontend directory', "red");
				process.exit(1);
			}
		} else {
			log("❌ Frontend not found. This package may be corrupted.", "red");
			process.exit(1);
		}
	}
}

async function runClaudeWithInterception(): Promise<void> {
	// Parse command line arguments
	const args = process.argv.slice(2);
	const claudeCmd = args.length > 0 ? args.join(" ") : "claude";

	log("🚀 Claude Trace", "blue");
	log("This will start Claude CLI with request/response logging", "yellow");
	log("Logs paired request/responses to .claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}", "yellow");
	console.log("");

	// Check dependencies
	checkDependencies();

	// Ensure frontend is built
	ensureFrontendBuilt();

	// Get interceptor path
	const interceptorPath = path.join(__dirname, "interceptor.js");

	if (!fs.existsSync(interceptorPath)) {
		log(`❌ Interceptor not found at: ${interceptorPath}`, "red");
		process.exit(1);
	}

	log("🔄 Starting traffic logger...", "green");
	log("📁 Logs will be written to: .claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}", "blue");
	console.log("");

	// Prepare environment
	const env = {
		...process.env,
		// Ensure Node doesn't reject unauthorized certificates for local development
		NODE_TLS_REJECT_UNAUTHORIZED: "0",
	};

	// Split the command properly
	const [command, ...commandArgs] = claudeCmd.split(" ");

	// Start Claude with the interceptor
	const child: ChildProcess = spawn("node", ["--require", interceptorPath, command, ...commandArgs], {
		env,
		stdio: "inherit",
		cwd: process.cwd(),
	});

	// Handle child process events
	child.on("error", (error: Error) => {
		log(`❌ Error starting Claude: ${error.message}`, "red");
		process.exit(1);
	});

	child.on("exit", (code: number | null, signal: string | null) => {
		if (signal) {
			log(`\n🔄 Claude terminated by signal: ${signal}`, "yellow");
		} else if (code !== 0 && code !== null) {
			log(`\n⚠️  Claude exited with code: ${code}`, "yellow");
		} else {
			log("\n✅ Claude session completed", "green");
		}
	});

	// Handle our own signals
	const handleSignal = (signal: string) => {
		log(`\n🔄 Received ${signal}, shutting down...`, "yellow");
		if (child.pid) {
			child.kill(signal as NodeJS.Signals);
		}
	};

	process.on("SIGINT", () => handleSignal("SIGINT"));
	process.on("SIGTERM", () => handleSignal("SIGTERM"));

	// Wait for child process to complete
	try {
		await new Promise<void>((resolve, reject) => {
			child.on("exit", () => resolve());
			child.on("error", reject);
		});
	} catch (error) {
		const err = error as Error;
		log(`❌ Unexpected error: ${err.message}`, "red");
		process.exit(1);
	}
}

async function generateHTMLFromCLI(): Promise<void> {
	const jsonlFile = process.argv[2];
	const outputFile = process.argv[3];

	try {
		const htmlGenerator = new HTMLGenerator();
		await htmlGenerator.generateHTMLFromJSONL(jsonlFile, outputFile);
		process.exit(0);
	} catch (error) {
		const err = error as Error;
		log(`❌ Error: ${err.message}`, "red");
		process.exit(1);
	}
}

async function extractToken(): Promise<void> {
	// Check dependencies
	checkDependencies();
	ensureFrontendBuilt();

	// Create a temporary file to store the token
	const tempTokenFile = path.join(process.cwd(), `.token-${Date.now()}.tmp`);

	// Create a custom interceptor that writes the token to a file
	const tokenExtractorPath = path.join(process.cwd(), "token-extractor.js");
	const extractorCode = `
const fs = require('fs');
const originalFetch = global.fetch;

global.fetch = async function(input, init = {}) {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
	
	if (url.includes('api.anthropic.com') && url.includes('/v1/messages')) {
		const headers = new Headers(init.headers || {});
		const authorization = headers.get('authorization');
		
		if (authorization && authorization.startsWith('Bearer ')) {
			const token = authorization.substring(7);
			try {
				fs.writeFileSync('${tempTokenFile}', token);
			} catch (e) {
				// Ignore write errors silently
			}
		}
	}
	
	return originalFetch(input, init);
};
`;

	// Write the temporary extractor
	fs.writeFileSync(tokenExtractorPath, extractorCode);

	// Prepare environment
	const env = {
		...process.env,
		NODE_TLS_REJECT_UNAUTHORIZED: "0",
	};

	// Find the absolute path of the claude binary
	let claudePath: string;
	try {
		claudePath = require("child_process").execSync("which claude", { encoding: "utf-8" }).trim();
	} catch (error) {
		console.error("❌ Could not find claude binary");
		process.exit(1);
	}

	// Start Claude with a simple prompt to trigger token usage
	const child: ChildProcess = spawn("node", ["--require", tokenExtractorPath, claudePath, "-p", "hello"], {
		env,
		stdio: ["pipe", "pipe", "pipe"], // Suppress all output from Claude
		cwd: process.cwd(),
	});

	// Set a timeout to avoid hanging
	const timeout = setTimeout(() => {
		child.kill();
		cleanup();
		console.error("❌ Timeout: No token found within 30 seconds");
		process.exit(1);
	}, 30000);

	const cleanup = () => {
		try {
			if (fs.existsSync(tokenExtractorPath)) fs.unlinkSync(tokenExtractorPath);
			if (fs.existsSync(tempTokenFile)) fs.unlinkSync(tempTokenFile);
		} catch (e) {
			// Ignore cleanup errors
		}
	};

	// Handle child process events
	child.on("error", (error: Error) => {
		clearTimeout(timeout);
		cleanup();
		console.error(`❌ Error starting Claude: ${error.message}`);
		process.exit(1);
	});

	child.on("exit", () => {
		clearTimeout(timeout);

		try {
			if (fs.existsSync(tempTokenFile)) {
				const token = fs.readFileSync(tempTokenFile, "utf-8").trim();
				cleanup();
				if (token) {
					// Only output the token, nothing else
					console.log(token);
					process.exit(0);
				}
			}
		} catch (e) {
			// File doesn't exist or read error
		}

		cleanup();
		console.error("❌ No authorization token found");
		process.exit(1);
	});

	// Check for token file periodically
	const checkToken = setInterval(() => {
		try {
			if (fs.existsSync(tempTokenFile)) {
				const token = fs.readFileSync(tempTokenFile, "utf-8").trim();
				if (token) {
					clearTimeout(timeout);
					clearInterval(checkToken);
					child.kill();
					cleanup();

					// Only output the token, nothing else
					console.log(token);
					process.exit(0);
				}
			}
		} catch (e) {
			// Ignore read errors, keep trying
		}
	}, 500);
}

// Main entry point
async function main(): Promise<void> {
	// Check for help flags
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		showHelp();
		process.exit(0);
	}

	// Check for other flags
	if (process.argv.includes("--extract-token")) {
		// Token extraction mode
		await extractToken();
	} else if (process.argv.length > 2 && process.argv[2].endsWith(".jsonl")) {
		// If first argument is a JSONL file, run in HTML generation mode
		await generateHTMLFromCLI();
	} else {
		// Normal mode: run Claude with interception
		await runClaudeWithInterception();
	}
}

main().catch((error) => {
	const err = error as Error;
	log(`❌ Unexpected error: ${err.message}`, "red");
	process.exit(1);
});
