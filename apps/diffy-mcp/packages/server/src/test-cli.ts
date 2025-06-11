#!/usr/bin/env node

import { spawn } from "child_process";
import { StdioClientTransport, Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as readline from "readline";
import * as path from "path";

/**
 * Interactive CLI for manually testing the Diffy MCP server
 */
class DiffyTestCLI {
	private client!: Client;
	private transport!: StdioClientTransport;
	private rl!: readline.Interface;

	async start() {
		console.log("🧪 Diffy MCP Test CLI");
		console.log("====================");

		try {
			await this.connectToServer();
			await this.startInteractiveSession();
		} catch (error) {
			console.error("❌ Failed to start test CLI:", error);
			process.exit(1);
		}
	}

	private async connectToServer() {
		console.log("🔌 Connecting to Diffy MCP server...");

		// Spawn the MCP server process
		const serverPath = path.join(__dirname, "index.js");
		const serverProcess = spawn("node", [serverPath], {
			stdio: ["pipe", "pipe", "inherit"],
		});

		// Create transport and client
		this.transport = new StdioClientTransport({
			reader: serverProcess.stdout,
			writer: serverProcess.stdin,
		});

		this.client = new Client({ name: "diffy-test-cli", version: "1.0.0" }, { capabilities: {} });

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
			prompt: "> ",
		});

		console.log("Commands:");
		console.log("  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)");
		console.log("  close <path>                  - Close file");
		console.log("  highlight <path> <start> [end] - Highlight lines");
		console.log("  refresh                       - Refresh all files");
		console.log("  help                          - Show this help");
		console.log("  exit                          - Exit CLI");
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
				console.error("❌ Command failed:", error);
			}

			this.rl.prompt();
		});

		this.rl.on("close", () => {
			console.log("\n👋 Goodbye!");
			this.cleanup();
			process.exit(0);
		});
	}

	private async handleCommand(command: string) {
		const parts = command.split(" ");
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
				this.rl.close();
				break;

			default:
				console.log(`❌ Unknown command: ${cmd}`);
				this.showHelp();
		}
	}

	private showHelp() {
		console.log("Available commands:");
		console.log("  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)");
		console.log("  close <path>                  - Close file");
		console.log("  highlight <path> <start> [end] - Highlight lines");
		console.log("  refresh                       - Refresh all files");
		console.log("  help                          - Show this help");
		console.log("  exit                          - Exit CLI");
	}

	private async handleOpen(args: string[]) {
		if (args.length < 2) {
			console.log("❌ Usage: open <path> <panel> [branch]");
			return;
		}

		const [absolutePath, panelStr, branch] = args;
		const panel = parseInt(panelStr);

		if (panel !== 0 && panel !== 1) {
			console.log("❌ Panel must be 0 (left) or 1 (right)");
			return;
		}

		// Convert to absolute path
		const resolvedPath = path.resolve(absolutePath);

		const params = {
			absolutePath: resolvedPath,
			panel,
			...(branch && { branch }),
		};

		console.log(`📂 Opening: ${resolvedPath} in panel ${panel}${branch ? ` (vs ${branch})` : ""}`);

		const result = await this.client.callTool({
			name: "open",
			arguments: params,
		});

		if (result.content && result.content[0]) {
			console.log(result.content[0].text);
		}
	}

	private async handleClose(args: string[]) {
		if (args.length < 1) {
			console.log("❌ Usage: close <path>");
			return;
		}

		const absolutePath = path.resolve(args[0]);

		console.log(`🗑️ Closing: ${absolutePath}`);

		const result = await this.client.callTool({
			name: "close",
			arguments: { absolutePath },
		});

		if (result.content && result.content[0]) {
			console.log(result.content[0].text);
		}
	}

	private async handleHighlight(args: string[]) {
		if (args.length < 2) {
			console.log("❌ Usage: highlight <path> <start> [end]");
			return;
		}

		const [pathArg, startStr, endStr] = args;
		const absolutePath = path.resolve(pathArg);
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

		const lineRange = endLine ? `${startLine}-${endLine}` : `${startLine}`;
		console.log(`🎯 Highlighting: ${absolutePath} lines ${lineRange}`);

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
			console.log(result.content[0].text);
		}
	}

	private async handleRefresh() {
		console.log("🔄 Refreshing all files...");

		const result = await this.client.callTool({
			name: "refresh",
			arguments: {},
		});

		if (result.content && result.content[0]) {
			console.log(result.content[0].text);
		}
	}

	private cleanup() {
		try {
			this.transport?.close();
		} catch (error) {
			console.error("Error during cleanup:", error);
		}
	}
}

// Start the CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const cli = new DiffyTestCLI();
	cli.start().catch(console.error);
}
