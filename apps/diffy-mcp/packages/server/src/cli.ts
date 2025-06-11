#!/usr/bin/env node

import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as readline from "readline";
import * as path from "path";
import * as fs from "fs";

/**
 * Simple CLI tool for interacting with Diffy MCP server
 */
class DiffyCLI {
	private client!: Client;
	private transport!: StdioClientTransport;
	private rl!: readline.Interface;
	private serverProcess!: any;

	async start() {
		console.log("🎯 Diffy MCP CLI");
		console.log("================");
		console.log("Starting Diffy MCP server...\n");

		try {
			await this.startServer();
			await this.connectToServer();
			await this.startInteractiveSession();
		} catch (error) {
			console.error("❌ Failed to start CLI:", error);
			process.exit(1);
		}
	}

	private async startServer() {
		const serverPath = path.join(__dirname, "index.js");

		this.serverProcess = spawn("node", [serverPath], {
			stdio: ["pipe", "pipe", "inherit"],
		});

		// Wait for server to start
		return new Promise<void>((resolve, reject) => {
			let serverReady = false;

			this.serverProcess.stderr.on("data", (data: Buffer) => {
				const message = data.toString();
				if (message.includes("Diffy MCP server started and listening on stdio")) {
					serverReady = true;
					console.log("✅ Server started successfully!\n");
					resolve();
				}
			});

			this.serverProcess.on("error", reject);

			// Timeout after 10 seconds
			setTimeout(() => {
				if (!serverReady) {
					reject(new Error("Server failed to start within 10 seconds"));
				}
			}, 10000);
		});
	}

	private async connectToServer() {
		console.log("🔌 Connecting to MCP server...");

		this.transport = new StdioClientTransport({
			reader: this.serverProcess.stdout,
			writer: this.serverProcess.stdin,
		});

		this.client = new Client({ name: "diffy-cli", version: "1.0.0" }, { capabilities: {} });

		await this.client.connect(this.transport);

		// List available tools
		const tools = await this.client.listTools();
		console.log("✅ Connected! Available tools:");
		tools.tools.forEach((tool) => {
			console.log(`  • ${tool.name}: ${tool.description}`);
		});
		console.log("");
	}

	private async startInteractiveSession() {
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: "diffy> ",
		});

		console.log("Commands:");
		console.log("  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)");
		console.log("  close <path>                  - Close file");
		console.log("  highlight <path> <start> [end] - Highlight lines");
		console.log("  refresh                       - Refresh all files");
		console.log("  help                          - Show this help");
		console.log("  exit                          - Exit CLI");
		console.log("");
		console.log("Tips:");
		console.log("  - Relative paths are resolved to current working directory");
		console.log("  - Use tab completion for file paths");
		console.log("  - Browser will auto-open when you first open a file");
		console.log("");

		this.rl.prompt();

		this.rl.on("line", async (input) => {
			const line = input.trim();
			if (!line) {
				this.rl.prompt();
				return;
			}

			try {
				await this.handleCommand(line);
			} catch (error) {
				console.error("❌ Command failed:", error instanceof Error ? error.message : error);
			}

			this.rl.prompt();
		});

		this.rl.on("close", () => {
			console.log("\n👋 Goodbye!");
			this.cleanup();
			process.exit(0);
		});

		// Handle Ctrl+C gracefully
		process.on("SIGINT", () => {
			console.log("\n🛑 Shutting down...");
			this.rl.close();
		});
	}

	private async handleCommand(command: string) {
		const parts = command.split(" ").filter((p) => p.length > 0);
		const cmd = parts[0].toLowerCase();

		switch (cmd) {
			case "help":
				this.showHelp();
				break;

			case "open":
				await this.handleOpen(parts.slice(1));
				break;

			case "close":
				await this.handleClose(parts.slice(1));
				break;

			case "highlight":
				await this.handleHighlight(parts.slice(1));
				break;

			case "refresh":
				await this.handleRefresh();
				break;

			case "exit":
			case "quit":
				this.rl.close();
				break;

			default:
				console.log(`❌ Unknown command: ${cmd}`);
				console.log('Type "help" for available commands');
		}
	}

	private showHelp() {
		console.log("\nAvailable commands:");
		console.log("  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)");
		console.log("  close <path>                  - Close file");
		console.log("  highlight <path> <start> [end] - Highlight lines (1-indexed)");
		console.log("  refresh                       - Refresh all files");
		console.log("  help                          - Show this help");
		console.log("  exit                          - Exit CLI");
		console.log("\nExamples:");
		console.log("  open README.md 0              - Open README.md in left panel");
		console.log("  open src/main.ts 1 main       - Open main.ts in right panel, diff vs main branch");
		console.log("  highlight README.md 10 15     - Highlight lines 10-15 in README.md");
		console.log("  close README.md               - Close README.md from all panels");
		console.log("");
	}

	private async handleOpen(args: string[]) {
		if (args.length < 2) {
			console.log("❌ Usage: open <path> <panel> [branch]");
			console.log("   panel: 0 (left) or 1 (right)");
			console.log("   branch: optional branch/commit/tag to diff against");
			return;
		}

		const [filePath, panelStr, branch] = args;
		const panel = parseInt(panelStr);

		if (panel !== 0 && panel !== 1) {
			console.log("❌ Panel must be 0 (left) or 1 (right)");
			return;
		}

		// Resolve relative path to absolute
		const absolutePath = path.resolve(filePath);

		// Check if file exists
		if (!fs.existsSync(absolutePath)) {
			console.log(`❌ File does not exist: ${absolutePath}`);
			return;
		}

		const params = {
			absolutePath,
			panel,
			...(branch && { branch }),
		};

		const panelName = panel === 0 ? "left" : "right";
		const branchInfo = branch ? ` (diff vs ${branch})` : "";
		console.log(`📂 Opening: ${path.basename(absolutePath)} in ${panelName} panel${branchInfo}`);

		const result = await this.client.callTool({
			name: "open",
			arguments: params,
		});

		if (result.content && result.content[0]) {
			const lines = (result.content[0] as any).text.split("\n");
			lines.forEach((line: string) => {
				if (line.trim()) console.log(`   ${line}`);
			});
		}
	}

	private async handleClose(args: string[]) {
		if (args.length < 1) {
			console.log("❌ Usage: close <path>");
			return;
		}

		// Resolve relative path to absolute
		const absolutePath = path.resolve(args[0]);

		console.log(`🗑️ Closing: ${path.basename(absolutePath)}`);

		const result = await this.client.callTool({
			name: "close",
			arguments: { absolutePath },
		});

		if (result.content && result.content[0]) {
			const lines = (result.content[0] as any).text.split("\n");
			lines.forEach((line: string) => {
				if (line.trim()) console.log(`   ${line}`);
			});
		}
	}

	private async handleHighlight(args: string[]) {
		if (args.length < 2) {
			console.log("❌ Usage: highlight <path> <start> [end]");
			console.log("   Line numbers are 1-indexed");
			return;
		}

		const [filePath, startStr, endStr] = args;
		const absolutePath = path.resolve(filePath);
		const startLine = parseInt(startStr);
		const endLine = endStr ? parseInt(endStr) : undefined;

		if (isNaN(startLine) || startLine < 1) {
			console.log("❌ Start line must be a positive number");
			return;
		}

		if (endLine !== undefined && (isNaN(endLine) || endLine < startLine)) {
			console.log("❌ End line must be >= start line");
			return;
		}

		// Check if file exists
		if (!fs.existsSync(absolutePath)) {
			console.log(`❌ File does not exist: ${absolutePath}`);
			return;
		}

		const lineRange = endLine ? `${startLine}-${endLine}` : `${startLine}`;
		console.log(`🎯 Highlighting: ${path.basename(absolutePath)} lines ${lineRange}`);

		const params = {
			absolutePath,
			startLine,
			...(endLine && { endLine }),
		};

		const result = await this.client.callTool({
			name: "highlight",
			arguments: params,
		});

		if (result.content && result.content[0]) {
			const lines = (result.content[0] as any).text.split("\n");
			lines.forEach((line: string) => {
				if (line.trim()) console.log(`   ${line}`);
			});
		}
	}

	private async handleRefresh() {
		console.log("🔄 Refreshing all files...");

		const result = await this.client.callTool({
			name: "refresh",
			arguments: {},
		});

		if (result.content && result.content[0]) {
			const lines = (result.content[0] as any).text.split("\n");
			lines.forEach((line: string) => {
				if (line.trim()) console.log(`   ${line}`);
			});
		}
	}

	private cleanup() {
		try {
			this.transport?.close();
			this.serverProcess?.kill();
		} catch (error) {
			console.error("Error during cleanup:", error);
		}
	}
}

// Start the CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const cli = new DiffyCLI();
	cli.start().catch(console.error);
}
