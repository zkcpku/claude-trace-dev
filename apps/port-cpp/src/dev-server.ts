#!/usr/bin/env npx tsx

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FileData {
	content: string;
	diff: string;
	error?: string;
}

class DevServer {
	private app = express();
	private server = createServer(this.app);
	private wss = new WebSocketServer({ server: this.server });
	private watchers = new Map<string, chokidar.FSWatcher>();
	private currentFiles: { java?: string; targets: string[]; prevBranch?: string; currentBranch?: string } = {
		targets: [],
	};
	private runtimesDir: string;

	constructor(runtimesDir: string) {
		this.runtimesDir = runtimesDir;
		this.setupRoutes();
		this.setupWebSocket();
	}

	private setupRoutes() {
		// Main route - just serve the HTML (no URL parameter processing)
		this.app.get("/", (req, res) => {
			res.sendFile(path.join(__dirname, "frontend", "index.html"));
		});

		// Serve static files from frontend directory
		this.app.use(express.static(path.join(__dirname, "frontend")));
	}

	private updateFiles(files: { java: string; targets: string[]; prevBranch: string; currentBranch: string }) {
		// Clear existing watchers
		this.watchers.forEach((watcher) => watcher.close());
		this.watchers.clear();

		// Update current files
		this.currentFiles = files;

		// Setup new watchers
		files.targets.forEach((targetFile) => {
			if (fs.existsSync(targetFile)) {
				const watcher = chokidar.watch(targetFile);
				watcher.on("change", () => this.broadcastUpdate());
				this.watchers.set(targetFile, watcher);
			}
		});

		// Broadcast initial data
		this.broadcastUpdate();
	}

	private resolvePath(filePath: string): string {
		// If already absolute, return as-is
		if (path.isAbsolute(filePath)) {
			return filePath;
		}
		// Otherwise resolve relative to runtimes directory
		return path.resolve(this.runtimesDir, filePath);
	}

	private setupWebSocket() {
		this.wss.on("connection", (ws) => {
			console.log("Client connected");

			ws.on("message", (data) => {
				try {
					const message = JSON.parse(data.toString());
					if (message.type === "configure" && message.config) {
						const { java, targets, prevBranch, currentBranch } = message.config;

						if (java && targets && targets.length > 0 && prevBranch && currentBranch) {
							// Resolve paths relative to runtimes directory
							const javaPath = this.resolvePath(java);
							const targetPaths = targets.map((p: string) => this.resolvePath(p));

							this.updateFiles({
								java: javaPath,
								targets: targetPaths,
								prevBranch,
								currentBranch,
							});
						}
					}
				} catch (error) {
					console.error("Error parsing WebSocket message:", error);
				}
			});

			ws.on("close", () => console.log("Client disconnected"));
		});
	}

	private broadcastUpdate() {
		if (!this.currentFiles.java) return;

		const data = {
			type: "update",
			javaFile: this.getJavaFileData(),
			targetFiles: this.currentFiles.targets.map((f) => this.getTargetFileData(f)),
			filenames: {
				javaFile: path.basename(this.currentFiles.java),
				targetFiles: this.currentFiles.targets.map((f) => path.basename(f)),
			},
		};

		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(JSON.stringify(data));
			}
		});
	}

	private getJavaFileData(): FileData {
		if (!this.currentFiles.java || !this.currentFiles.prevBranch || !this.currentFiles.currentBranch) {
			return { content: "", diff: "", error: "No Java file configured" };
		}

		try {
			const content = fs.readFileSync(this.currentFiles.java, "utf8");
			const diff = this.getGitDiff(
				this.currentFiles.java,
				this.currentFiles.prevBranch,
				this.currentFiles.currentBranch,
			);
			return { content, diff };
		} catch (error) {
			return {
				content: "",
				diff: "",
				error: `Error reading Java file: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private getTargetFileData(targetFile: string): FileData {
		try {
			if (!fs.existsSync(targetFile)) {
				return {
					content: "// File does not exist yet",
					diff: "// New file - no diff available",
				};
			}

			const content = fs.readFileSync(targetFile, "utf8");
			const diff = this.getWorkingTreeDiff(targetFile);
			return { content, diff };
		} catch (error) {
			return {
				content: "",
				diff: "",
				error: `Error reading target file: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private getGitDiff(filePath: string, prevBranch: string, currentBranch: string): string {
		try {
			const gitRoot = execSync("git rev-parse --show-toplevel", {
				encoding: "utf8",
				cwd: path.dirname(filePath),
			}).trim();
			const relativePath = path.relative(gitRoot, filePath);

			return execSync(`git diff ${prevBranch}..${currentBranch} -- "${relativePath}"`, {
				encoding: "utf8",
				cwd: gitRoot,
			});
		} catch (error) {
			return `Error getting git diff: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	private getWorkingTreeDiff(filePath: string): string {
		try {
			const gitRoot = execSync("git rev-parse --show-toplevel", {
				encoding: "utf8",
				cwd: path.dirname(filePath),
			}).trim();
			const relativePath = path.relative(gitRoot, filePath);

			return execSync(`git diff HEAD -- "${relativePath}"`, {
				encoding: "utf8",
				cwd: gitRoot,
			});
		} catch (error) {
			return `Error getting working tree diff: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	public start(port = 0): Promise<number> {
		return new Promise((resolve) => {
			this.server.listen(port, () => {
				const actualPort = (this.server.address() as any)?.port || port;
				console.log(`🚀 Development server running at: http://localhost:${actualPort}`);
				console.log(
					`📖 Usage: http://localhost:${actualPort}/?java=/path/to/File.java&targets=/path/to/File.h,/path/to/File.cpp&prevBranch=4.2&currentBranch=4.3-beta`,
				);
				resolve(actualPort);
			});
		});
	}

	public stop() {
		this.watchers.forEach((watcher) => watcher.close());
		this.server.close();
	}
}

// CLI usage - start the server with spine runtimes directory
if (process.argv[1] && process.argv[1].includes("dev-server.ts")) {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.error("Usage: npx tsx src/dev-server.ts <spine-runtimes-dir>");
		console.error("");
		console.error("Example:");
		console.error("  npx tsx src/dev-server.ts /path/to/spine-runtimes");
		process.exit(1);
	}

	const spineRuntimesDir = path.resolve(args[0]);
	console.log(`📁 Spine runtimes directory: ${spineRuntimesDir}`);

	const server = new DevServer(spineRuntimesDir);

	server
		.start()
		.then((port) => {
			console.log(`📖 Example URL with relative paths:`);
			console.log(
				`http://localhost:${port}/?java=spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/Bone.java&targets=spine-cpp/spine-cpp/include/spine/Bone.h,spine-cpp/spine-cpp/src/spine/Bone.cpp&prevBranch=4.2&currentBranch=4.3-beta`,
			);

			process.on("SIGINT", () => {
				console.log("\n👋 Shutting down development server...");
				server.stop();
				process.exit(0);
			});
		})
		.catch((error) => {
			console.error("❌ Failed to start server:", error);
			process.exit(1);
		});
}

export { DevServer };
