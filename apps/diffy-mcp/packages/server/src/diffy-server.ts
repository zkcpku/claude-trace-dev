import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getBrowserOpener } from "./utils/browser.js";
import { getEditorCommand } from "./utils/editor.js";
import { GitUtils } from "./utils/git.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FileData {
	content: string;
	diff: string;
	originalContent?: string;
	modifiedContent?: string;
	error?: string;
}

interface WatchedFile {
	absolutePath: string;
	branch?: string;
	watchers: Set<any>;
}

interface ServerState {
	panels: [string[], string[]]; // [leftPanelFiles, rightPanelFiles]
	activeTabs: [string | null, string | null];
	highlights: Map<string, { start: number; end: number }>;
	openFiles: Set<string>;
}

/**
 * Internal file server that handles WebSocket connections, file watching,
 * and serves the frontend interface
 */
export class DiffyServer {
	private app = express();
	private server = createServer(this.app);
	private wss = new WebSocketServer({ server: this.server });
	private fileWatchers = new Map<string, chokidar.FSWatcher>();
	private watchedFiles = new Map<string, WatchedFile>();
	private clientFiles = new Map<any, Set<string>>();
	private gitUtils = new GitUtils();
	private port = 0;
	private isStarted = false;

	// Server state to restore on browser reconnect
	private state: ServerState = {
		panels: [[], []],
		activeTabs: [null, null],
		highlights: new Map(),
		openFiles: new Set(),
	};

	constructor() {
		this.setupRoutes();
		this.setupWebSocket();
	}

	private setupRoutes() {
		this.app.use(express.json());

		// API route to open files in editor (cursor/code)
		this.app.post("/api/open-in-editor", async (req, res) => {
			try {
				const { filepath } = req.body;

				if (!filepath) {
					return res.status(400).json({ error: "filepath is required" });
				}

				const editorCommand = await getEditorCommand();
				if (!editorCommand) {
					return res.status(500).json({ error: "No suitable editor found (cursor/code)" });
				}

				console.error(`🎯 Opening in ${editorCommand}: ${filepath}`);
				const { execSync } = await import("child_process");
				execSync(`${editorCommand} "${filepath}"`, { stdio: "inherit" });

				res.json({ success: true, message: `Opened ${filepath} in ${editorCommand}` });
			} catch (error) {
				console.error("❌ Failed to open file in editor:", error);
				res.status(500).json({
					error: "Failed to open file in editor",
					details: error instanceof Error ? error.message : String(error),
				});
			}
		});

		// Serve the frontend
		this.app.get("/", (req, res) => {
			res.sendFile(path.join(__dirname, "../../frontend/public/simple.html"));
		});

		// Serve frontend static files
		this.app.use(express.static(path.join(__dirname, "../../frontend/public")));
	}

	private setupWebSocket() {
		this.wss.on("connection", (ws) => {
			console.error("Client connected to Diffy server");

			this.clientFiles.set(ws, new Set());

			// Send current state to new client
			this.sendStateToClient(ws);

			ws.on("message", (data) => {
				try {
					const message = JSON.parse(data.toString());
					console.error("WebSocket message:", message);

					if (message.type === "watch") {
						const { absolutePath, branch } = message;
						this.watchFile(ws, absolutePath, branch);
					} else if (message.type === "unwatch") {
						const { absolutePath } = message;
						this.unwatchFile(ws, absolutePath);
					} else if (message.type === "refresh") {
						this.refreshAllFilesForClient(ws);
					}
				} catch (error) {
					console.error("Error parsing WebSocket message:", error);
				}
			});

			ws.on("close", () => {
				console.error("Client disconnected from Diffy server");
				this.cleanupClient(ws);
			});
		});
	}

	private sendStateToClient(ws: any) {
		// Send state restoration message
		const stateMessage = {
			type: "stateRestore",
			panels: this.state.panels,
			activeTabs: this.state.activeTabs,
			highlights: Array.from(this.state.highlights.entries()),
		};

		if (ws.readyState === 1) {
			ws.send(JSON.stringify(stateMessage));
		}

		// Re-send all watched files
		for (const absolutePath of this.watchedFiles.keys()) {
			this.broadcastFileUpdateToClient(ws, absolutePath);
		}
	}

	private watchFile(ws: any, absolutePath: string, branch?: string) {
		const fileKey = this.getFileKey(absolutePath, branch);

		let fileInfo = this.watchedFiles.get(fileKey);
		if (!fileInfo) {
			fileInfo = {
				absolutePath,
				branch,
				watchers: new Set(),
			};
			this.watchedFiles.set(fileKey, fileInfo);
		}
		fileInfo.watchers.add(ws);

		const clientWatchedFiles = this.clientFiles.get(ws);
		if (clientWatchedFiles) {
			clientWatchedFiles.add(fileKey);
		}

		// Set up file system watcher if not already watching
		if (!this.fileWatchers.has(absolutePath)) {
			const watcher = chokidar.watch(absolutePath, { ignoreInitial: false });
			watcher.on("change", () => this.broadcastFileUpdate(fileKey));
			watcher.on("add", () => this.broadcastFileUpdate(fileKey));
			this.fileWatchers.set(absolutePath, watcher);
			console.error(`Started file watcher for: ${absolutePath}`);
		}

		this.broadcastFileUpdateToClient(ws, fileKey);
	}

	private unwatchFile(ws: any, absolutePath: string, branch?: string) {
		const fileKey = this.getFileKey(absolutePath, branch);
		const fileInfo = this.watchedFiles.get(fileKey);
		if (!fileInfo) return;

		fileInfo.watchers.delete(ws);

		const clientWatchedFiles = this.clientFiles.get(ws);
		if (clientWatchedFiles) {
			clientWatchedFiles.delete(fileKey);
		}

		if (fileInfo.watchers.size === 0) {
			this.watchedFiles.delete(fileKey);

			const watcher = this.fileWatchers.get(absolutePath);
			if (watcher) {
				watcher.close();
				this.fileWatchers.delete(absolutePath);
				console.error(`Stopped file watcher for: ${absolutePath}`);
			}
		}
	}

	private cleanupClient(ws: any) {
		const clientWatchedFiles = this.clientFiles.get(ws);
		if (clientWatchedFiles) {
			for (const fileKey of clientWatchedFiles) {
				const [absolutePath, branch] = this.parseFileKey(fileKey);
				this.unwatchFile(ws, absolutePath, branch);
			}
			this.clientFiles.delete(ws);
		}
	}

	private broadcastFileUpdate(fileKey: string) {
		const watchedFile = this.watchedFiles.get(fileKey);
		if (!watchedFile) return;

		const fileData = this.getFileData(watchedFile.absolutePath, watchedFile.branch);

		const message = {
			type: "fileUpdate",
			absolutePath: watchedFile.absolutePath,
			branch: watchedFile.branch,
			filename: path.basename(watchedFile.absolutePath),
			...fileData,
		};

		watchedFile.watchers.forEach((client) => {
			if (client.readyState === 1) {
				client.send(JSON.stringify(message));
			}
		});
	}

	private broadcastFileUpdateToClient(ws: any, fileKey: string) {
		const watchedFile = this.watchedFiles.get(fileKey);
		if (!watchedFile) return;

		const fileData = this.getFileData(watchedFile.absolutePath, watchedFile.branch);

		const message = {
			type: "fileUpdate",
			absolutePath: watchedFile.absolutePath,
			branch: watchedFile.branch,
			filename: path.basename(watchedFile.absolutePath),
			...fileData,
		};

		if (ws.readyState === 1) {
			ws.send(JSON.stringify(message));
		}
	}

	private refreshAllFilesForClient(ws: any) {
		const clientFiles = this.clientFiles.get(ws);
		if (clientFiles) {
			for (const fileKey of clientFiles) {
				this.broadcastFileUpdateToClient(ws, fileKey);
			}
		}
	}

	private getFileData(absolutePath: string, branch?: string): FileData {
		try {
			const content = fs.readFileSync(absolutePath, "utf8");
			let diff = "";
			let originalContent: string | undefined;
			let modifiedContent: string | undefined;

			if (this.gitUtils.isInGitRepo(absolutePath)) {
				if (branch) {
					// Compare branch vs working state
					diff = this.gitUtils.getDiff(absolutePath, branch, null);
					originalContent = this.gitUtils.getFileContent(absolutePath, branch);
					modifiedContent = content;
				} else {
					// Compare HEAD vs working state
					diff = this.gitUtils.getDiff(absolutePath, "HEAD", null);
					originalContent = this.gitUtils.getFileContent(absolutePath, "HEAD");
					modifiedContent = content;
				}
			}

			return { content, diff, originalContent, modifiedContent };
		} catch (error) {
			return {
				content: "",
				diff: "",
				error: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private getFileKey(absolutePath: string, branch?: string): string {
		return branch ? `${absolutePath}@${branch}` : absolutePath;
	}

	private parseFileKey(fileKey: string): [string, string | undefined] {
		const parts = fileKey.split("@");
		return parts.length > 1 ? [parts[0], parts[1]] : [parts[0], undefined];
	}

	// Public API for MCP tools

	async openFile(absolutePath: string, panel: number, branch?: string): Promise<void> {
		// Update server state
		this.state.panels[panel].push(this.getFileKey(absolutePath, branch));
		this.state.activeTabs[panel] = this.getFileKey(absolutePath, branch);
		this.state.openFiles.add(absolutePath);

		// Auto-open browser if no WebSocket connections
		if (this.wss.clients.size === 0) {
			await this.openBrowser();
		}

		// If we have connections, broadcast the open request
		if (this.wss.clients.size > 0) {
			const message = {
				type: "openFile",
				absolutePath,
				panel,
				branch,
			};

			this.wss.clients.forEach((client) => {
				if (client.readyState === 1) {
					client.send(JSON.stringify(message));
				}
			});
		}
	}

	async closeFile(absolutePath: string): Promise<void> {
		// Remove from state
		const fileKeysToRemove = Array.from(this.state.openFiles).filter((f) => f === absolutePath);

		for (const fileKey of fileKeysToRemove) {
			// Remove from panels
			this.state.panels[0] = this.state.panels[0].filter((f) => !f.startsWith(absolutePath));
			this.state.panels[1] = this.state.panels[1].filter((f) => !f.startsWith(absolutePath));

			// Update active tabs
			if (this.state.activeTabs[0]?.startsWith(absolutePath)) {
				this.state.activeTabs[0] = this.state.panels[0][0] || null;
			}
			if (this.state.activeTabs[1]?.startsWith(absolutePath)) {
				this.state.activeTabs[1] = this.state.panels[1][0] || null;
			}
		}

		this.state.openFiles.delete(absolutePath);
		this.state.highlights.delete(absolutePath);

		// Broadcast close request
		const message = {
			type: "closeFile",
			absolutePath,
		};

		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(JSON.stringify(message));
			}
		});
	}

	async highlightFile(absolutePath: string, startLine: number, endLine?: number): Promise<void> {
		// Update state
		this.state.highlights.set(absolutePath, {
			start: startLine,
			end: endLine || startLine,
		});

		// Auto-open browser if no connections
		if (this.wss.clients.size === 0) {
			await this.openBrowser();
		}

		// Broadcast highlight request
		const message = {
			type: "highlightFile",
			absolutePath,
			startLine,
			endLine,
		};

		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(JSON.stringify(message));
			}
		});
	}

	async refreshFiles(): Promise<void> {
		// Broadcast refresh request
		const message = { type: "refresh" };

		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(JSON.stringify(message));
			}
		});

		// Also refresh all file watchers
		for (const fileKey of this.watchedFiles.keys()) {
			this.broadcastFileUpdate(fileKey);
		}
	}

	private async openBrowser(): Promise<void> {
		const autoOpen = process.env.DIFFY_AUTO_OPEN_BROWSER !== "false";
		if (!autoOpen) return;

		const url = `http://localhost:${this.port}`;
		console.error(`🌐 Opening browser: ${url}`);

		try {
			const openBrowser = getBrowserOpener();
			await openBrowser(url);
		} catch (error) {
			console.error("Failed to open browser:", error);
		}
	}

	hasActiveConnections(): boolean {
		return this.wss.clients.size > 0;
	}

	getUrl(): string {
		return `http://localhost:${this.port}`;
	}

	async start(): Promise<void> {
		if (this.isStarted) return;

		const configuredPort = process.env.DIFFY_PORT ? parseInt(process.env.DIFFY_PORT) : 0;
		const host = process.env.DIFFY_HOST || "127.0.0.1";

		return new Promise((resolve, reject) => {
			this.server.listen(configuredPort, host, () => {
				const address = this.server.address();
				if (address && typeof address === "object") {
					this.port = address.port;
				}

				this.isStarted = true;
				console.error(`📁 Diffy file server started at: http://${host}:${this.port}`);
				resolve();
			});

			this.server.on("error", reject);
		});
	}

	async stop(): Promise<void> {
		if (!this.isStarted) return;

		// Close all file watchers
		for (const watcher of this.fileWatchers.values()) {
			watcher.close();
		}
		this.fileWatchers.clear();

		// Close WebSocket server
		this.wss.close();

		// Close HTTP server
		return new Promise((resolve) => {
			this.server.close(() => {
				this.isStarted = false;
				console.error("Diffy file server stopped");
				resolve();
			});
		});
	}
}
