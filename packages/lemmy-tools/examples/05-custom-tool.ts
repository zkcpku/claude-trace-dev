#!/usr/bin/env npx tsx

/**
 * Custom Tool Development Example
 *
 * Shows how to create and use custom tools with lemmy-tools
 * Run with: npx tsx examples/05-custom-tool.ts
 */

import { createAnthropicClient, createContext } from "@mariozechner/lemmy";
import { defineTool } from "@mariozechner/lemmy-tools";
import { z } from "zod";
import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// Custom Git tool with safety checks
const gitTool = defineTool({
	name: "Git",
	description: "Execute git commands with safety checks and validation",
	category: "vcs",
	schema: z.object({
		command: z.enum(["status", "log", "diff", "add", "commit", "branch", "remote"]),
		args: z.array(z.string()).optional().describe("Additional arguments for the git command"),
		message: z.string().optional().describe("Commit message (required for commit command)"),
		files: z.array(z.string()).optional().describe("Files to add (for add command)"),
	}),
	execute: async (args, signal) => {
		console.log(`💻 Executing git ${args.command}...`);

		// Validation for commit command
		if (args.command === "commit" && !args.message) {
			throw new Error("Commit message is required for commit command");
		}

		// Build git command
		const gitArgs = [args.command];

		// Add specific arguments based on command
		if (args.command === "add" && args.files) {
			gitArgs.push(...args.files);
		} else if (args.command === "commit" && args.message) {
			gitArgs.push("-m", args.message);
		} else if (args.args) {
			gitArgs.push(...args.args);
		}

		// Add some default safe arguments
		if (args.command === "log" && !args.args?.some((arg) => arg.includes("-n") || arg.includes("--max-count"))) {
			gitArgs.push("-n", "10"); // Limit to 10 commits by default
		}

		try {
			// Check if we're in a git repository
			await execAsync("git rev-parse --git-dir");

			// Execute git command with cancellation support
			const { stdout, stderr } = await execAsync(`git ${gitArgs.join(" ")}`);

			if (signal?.aborted) {
				throw new Error("Git operation was cancelled");
			}

			return {
				success: true,
				command: `git ${gitArgs.join(" ")}`,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
			};
		} catch (error) {
			if (error.message.includes("not a git repository")) {
				throw new Error("Current directory is not a git repository. Please run this in a git repository.");
			}
			throw error;
		}
	},
});

// Custom System Info tool
const systemInfoTool = defineTool({
	name: "SystemInfo",
	description: "Get system information including OS, CPU, memory, and disk usage",
	category: "system",
	schema: z.object({
		details: z.enum(["basic", "detailed"]).default("basic").describe("Level of detail to return"),
	}),
	execute: async (args, signal) => {
		console.log(`🖥️ Getting ${args.details} system information...`);

		const info: any = {
			platform: process.platform,
			arch: process.arch,
			nodeVersion: process.version,
			timestamp: new Date().toISOString(),
		};

		if (args.details === "detailed") {
			try {
				// Get additional system info (Unix-like systems)
				if (process.platform !== "win32") {
					const { stdout: uptime } = await execAsync("uptime");
					const { stdout: memory } = await execAsync('free -h 2>/dev/null || echo "Memory info not available"');
					const { stdout: disk } = await execAsync('df -h . 2>/dev/null || echo "Disk info not available"');

					info.uptime = uptime.trim();
					info.memory = memory.trim();
					info.disk = disk.trim();
				}

				// Get CPU info
				const cpuCount = require("os").cpus().length;
				const totalMem = require("os").totalmem();
				const freeMem = require("os").freemem();

				info.cpuCount = cpuCount;
				info.totalMemory = `${Math.round((totalMem / 1024 / 1024 / 1024) * 100) / 100} GB`;
				info.freeMemory = `${Math.round((freeMem / 1024 / 1024 / 1024) * 100) / 100} GB`;
				info.loadAverage = require("os").loadavg();
			} catch (error) {
				info.detailsError = `Could not get detailed info: ${error.message}`;
			}
		}

		if (signal?.aborted) {
			throw new Error("System info collection was cancelled");
		}

		return info;
	},
});

async function main() {
	console.log("🔨 Custom Tool Development Demo...");

	const client = createAnthropicClient({ model: "claude-3-5-sonnet-20241022" });
	const context = createContext();

	// Add our custom tools
	console.log("📦 Adding custom tools...");
	context.addTool(gitTool);
	context.addTool(systemInfoTool);

	console.log("  - Git: Safe git command execution");
	console.log("  - SystemInfo: System information gathering");

	// Test the custom Git tool
	console.log("\n💻 Testing Git tool...");
	try {
		const gitResult = await client.ask("Check the git status of this repository and show me the last 3 commits", {
			context,
		});

		if (gitResult.type === "success") {
			console.log("✅ Git tool working!");
			console.log("Response:", gitResult.message.content?.slice(0, 300) + "...");

			if (gitResult.message.toolCalls) {
				console.log(`🔧 Tools used: ${gitResult.message.toolCalls.map((tc) => tc.name).join(", ")}`);
			}
		} else {
			console.log("❌ Git Error:", gitResult.error.message);
		}
	} catch (error) {
		console.error("💥 Git test failed:", error.message);
	}

	// Test the SystemInfo tool
	console.log("\n🖥️ Testing SystemInfo tool...");
	try {
		const sysResult = await client.ask("Give me detailed system information about this machine", { context });

		if (sysResult.type === "success") {
			console.log("✅ SystemInfo tool working!");
			console.log("Response:", sysResult.message.content?.slice(0, 400) + "...");

			if (sysResult.message.toolCalls) {
				console.log(`🔧 Tools used: ${sysResult.message.toolCalls.map((tc) => tc.name).join(", ")}`);
			}
		} else {
			console.log("❌ SystemInfo Error:", sysResult.error.message);
		}
	} catch (error) {
		console.error("💥 SystemInfo test failed:", error.message);
	}

	// Test error handling
	console.log("\n⚠️ Testing error handling...");
	try {
		const errorResult = await client.ask("Try to commit something with git but don't provide a commit message", {
			context,
		});

		if (errorResult.type === "success") {
			console.log("✅ Error handling test completed");
			console.log("Response:", errorResult.message.content?.slice(0, 200) + "...");
		} else {
			console.log("❌ Expected error occurred:", errorResult.error.message);
		}
	} catch (error) {
		console.error("💥 Error test failed:", error.message);
	}

	console.log("\n🎉 Custom tool demo completed!");
	console.log("📝 Key features demonstrated:");
	console.log("  - Input validation with Zod schemas");
	console.log("  - Error handling and user-friendly messages");
	console.log("  - Cancellation support with AbortSignal");
	console.log("  - Platform-aware functionality");
	console.log("  - Safety checks and constraints");
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
	main().catch(console.error);
}
