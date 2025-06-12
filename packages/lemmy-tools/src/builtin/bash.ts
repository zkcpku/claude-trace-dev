import { z } from "zod";
import { spawn } from "child_process";
import { defineTool } from "@mariozechner/lemmy";
import type { LemmyTool } from "../types.js";

/**
 * Bash tool for executing shell commands
 */
export const bashTool = defineTool({
	name: "Bash",
	description: `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use LS to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
   - Examples of proper quoting:
     - cd "/Users/name/My Documents" (correct)
     - cd /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
  - If the output exceeds 30000 characters, output will be truncated before being returned to you.
  - VERY IMPORTANT: You MUST avoid using search commands like \`find\` and \`grep\`. Instead use Grep, Glob, or Task to search. You MUST avoid read tools like \`cat\`, \`head\`, \`tail\`, and \`ls\`, and use Read and LS to read files.
  - If you _still_ need to run \`grep\`, STOP. ALWAYS USE ripgrep at \`rg\` first, which all Claude Code users have pre-installed.
  - When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.`,
	category: "shell" as const,
	schema: z.object({
		command: z.string().describe("The command to execute"),
		timeout: z.number().max(600000).optional().describe("Optional timeout in milliseconds (max 600000)"),
		description: z.string().optional().describe("Clear, concise description of what this command does in 5-10 words"),
	}),
	execute: async (args, signal) => {
		const { command, timeout = 120000, description } = args;

		return new Promise((resolve, reject) => {
			const startTime = Date.now();

			// Create shell process
			const shell = spawn("bash", ["-c", command], {
				stdio: ["pipe", "pipe", "pipe"],
				env: process.env,
			});

			let stdout = "";
			let stderr = "";
			let killed = false;

			// Handle cancellation
			const abortHandler = () => {
				if (!killed) {
					killed = true;
					shell.kill("SIGTERM");
					// Force kill after 5 seconds
					setTimeout(() => {
						if (!shell.killed) {
							shell.kill("SIGKILL");
						}
					}, 5000);
					reject(new Error("Command execution was cancelled"));
				}
			};

			signal?.addEventListener("abort", abortHandler);

			// Set timeout
			const timeoutId = setTimeout(() => {
				if (!killed) {
					killed = true;
					shell.kill("SIGTERM");
					setTimeout(() => {
						if (!shell.killed) {
							shell.kill("SIGKILL");
						}
					}, 5000);
					reject(new Error(`Command timed out after ${timeout}ms`));
				}
			}, timeout);

			// Collect output
			shell.stdout?.on("data", (data) => {
				stdout += data.toString();
				// Limit output size
				if (stdout.length > 30000) {
					stdout = stdout.slice(0, 30000) + "\n[Output truncated - exceeded 30000 characters]";
				}
			});

			shell.stderr?.on("data", (data) => {
				stderr += data.toString();
				// Limit error output size
				if (stderr.length > 10000) {
					stderr = stderr.slice(0, 10000) + "\n[Error output truncated]";
				}
			});

			// Handle completion
			shell.on("close", (code, signalName) => {
				clearTimeout(timeoutId);
				signal?.removeEventListener("abort", abortHandler);

				if (killed) {
					return; // Already handled
				}

				const duration = Date.now() - startTime;

				const result = {
					command,
					description,
					exitCode: code,
					signal: signalName,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					duration,
					success: code === 0,
				};

				resolve(result);
			});

			shell.on("error", (error) => {
				clearTimeout(timeoutId);
				signal?.removeEventListener("abort", abortHandler);

				if (!killed) {
					reject(new Error(`Failed to execute command: ${error.message}`));
				}
			});
		});
	},
});
