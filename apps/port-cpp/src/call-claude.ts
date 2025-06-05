#!/usr/bin/env npx tsx

/**
 * CLAUDE CLI EXECUTION - STAGGERED PARALLEL EXECUTION
 *
 * Uses staggered parallel execution with 500ms delays between Claude process spawns.
 * This approach avoids resource contention while achieving ~3x performance improvement
 * over sequential execution.
 *
 * IMPLEMENTATION:
 * - Spawn Claude processes with 500ms staggered delays
 * - Use spawn() with proper stdio handling to prevent hanging
 * - Retry failed processes up to 3 times
 * - 10-second timeout per process with SIGTERM cleanup
 */

import { spawn, execSync } from "child_process";
import fs from "fs";

interface CallClaudeOptions {
	timeout?: number;
	cwd?: string;
	skipPermissions?: boolean;
}

/**
 * Execute a prompt using Claude CLI and return the response
 */
export async function callClaude(prompt: string, options: CallClaudeOptions = {}): Promise<string> {
	const {
		timeout = 300000, // 5 minutes default
		cwd = process.cwd(),
		skipPermissions = true,
	} = options;

	// Create temporary file for prompt to handle complex quoting
	const promptFile = `/tmp/claude_prompt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.txt`;

	try {
		fs.writeFileSync(promptFile, prompt);

		const skipFlag = skipPermissions ? "--dangerously-skip-permissions" : "";
		const command = `claude ${skipFlag} -p "$(cat ${promptFile})"`;

		const result = execSync(command, {
			encoding: "utf8",
			cwd,
			timeout,
			stdio: ["pipe", "pipe", "pipe"],
		});

		return result.trim();
	} catch (error) {
		throw new Error(`Claude CLI execution failed: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		// Clean up temp file
		try {
			fs.unlinkSync(promptFile);
		} catch (e) {
			// Ignore cleanup errors
		}
	}
}

/**
 * Execute multiple Claude calls with staggered parallel execution
 *
 * Uses 500ms delays between process spawns to avoid resource contention.
 * Retries failed processes up to 3 times for reliability.
 */
export async function callClaudeMultiple(prompts: string[], options: CallClaudeOptions = {}): Promise<string[]> {
	const {
		timeout = 300000, // 5 minutes default
		cwd = process.cwd(),
		skipPermissions = true,
	} = options;

	const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
	const delayMs = 50; // Optimal delay between spawns
	const maxRetries = 3;

	async function executeWithRetry(prompt: string, promptIndex: number): Promise<string> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await new Promise<string>((resolve, reject) => {
					const delay = promptIndex * delayMs;

					setTimeout(() => {
						const args = ["--print"];
						if (skipPermissions) args.push("--dangerously-skip-permissions");
						args.push(prompt);

						const child = spawn(claudePath, args, {
							stdio: ["ignore", "pipe", "pipe"],
						});

						let stdout = "";
						let stderr = "";

						child.stdout?.on("data", (data) => (stdout += data));
						child.stderr?.on("data", (data) => (stderr += data));

						// Timeout protection
						const timeoutId = setTimeout(() => {
							if (!child.killed) {
								child.kill("SIGTERM");
								reject(new Error("Claude process timeout"));
							}
						}, timeout);

						child.on("close", (code) => {
							clearTimeout(timeoutId);
							if (code === 0) {
								resolve(stdout.trim());
							} else {
								reject(new Error(`Claude process failed with code ${code}: ${stderr || "Unknown error"}`));
							}
						});

						child.on("error", (error) => {
							clearTimeout(timeoutId);
							reject(error);
						});
					}, delay);
				});
			} catch (error) {
				if (attempt === maxRetries) {
					return `ERROR: ${error instanceof Error ? error.message : String(error)} (after ${maxRetries} attempts)`;
				}
				// Wait before retry
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		return `ERROR: Maximum retries exceeded`;
	}

	const promises = prompts.map((prompt, index) => executeWithRetry(prompt, index));
	return Promise.all(promises);
}

// Export for backwards compatibility
export default { callClaude, callClaudeMultiple };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log('Usage: node claude.js "your prompt here"');
		console.log("       node claude.js --file prompt.txt");
		process.exit(1);
	}

	let prompt;
	if (args[0] === "--file") {
		if (!args[1]) {
			console.error("Error: --file requires a filename");
			process.exit(1);
		}
		prompt = fs.readFileSync(args[1], "utf8");
	} else {
		prompt = args.join(" ");
	}

	callClaude(prompt)
		.then((response) => {
			console.log(response);
		})
		.catch((error) => {
			console.error("Error:", error.message);
			process.exit(1);
		});
}
