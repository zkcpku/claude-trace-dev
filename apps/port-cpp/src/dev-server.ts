#!/usr/bin/env npx tsx

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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
	private currentFiles: { java?: string; cpp: string[]; prevBranch?: string; currentBranch?: string } = { cpp: [] };

	constructor() {
		this.setupRoutes();
		this.setupWebSocket();
	}

	private setupRoutes() {
		// Main route with URL parameters
		this.app.get("/", (req, res) => {
			const { java, cpp, prevBranch, currentBranch } = req.query;

			if (java && cpp && prevBranch && currentBranch) {
				this.updateFiles({
					java: String(java),
					cpp: String(cpp).split(","),
					prevBranch: String(prevBranch),
					currentBranch: String(currentBranch),
				});
			}

			res.send(this.getIndexHTML());
		});

		// API endpoints
		this.app.get("/api/data", (req, res) => {
			if (!this.currentFiles.java) {
				return res.json({ error: "No files configured" });
			}

			res.json({
				javaFile: this.getJavaFileData(),
				cppFiles: this.currentFiles.cpp.map((f) => this.getCppFileData(f)),
				filenames: {
					javaFile: path.basename(this.currentFiles.java),
					cppFiles: this.currentFiles.cpp.map((f) => path.basename(f)),
				},
			});
		});
	}

	private updateFiles(files: { java: string; cpp: string[]; prevBranch: string; currentBranch: string }) {
		// Clear existing watchers
		this.watchers.forEach((watcher) => watcher.close());
		this.watchers.clear();

		// Update current files
		this.currentFiles = files;

		// Setup new watchers
		files.cpp.forEach((cppFile) => {
			if (fs.existsSync(cppFile)) {
				const watcher = chokidar.watch(cppFile);
				watcher.on("change", () => this.broadcastUpdate());
				this.watchers.set(cppFile, watcher);
			}
		});

		// Broadcast initial data
		this.broadcastUpdate();
	}

	private setupWebSocket() {
		this.wss.on("connection", (ws) => {
			console.log("Client connected");
			ws.on("close", () => console.log("Client disconnected"));
		});
	}

	private broadcastUpdate() {
		if (!this.currentFiles.java) return;

		const data = {
			type: "update",
			javaFile: this.getJavaFileData(),
			cppFiles: this.currentFiles.cpp.map((f) => this.getCppFileData(f)),
			filenames: {
				javaFile: path.basename(this.currentFiles.java),
				cppFiles: this.currentFiles.cpp.map((f) => path.basename(f)),
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

	private getCppFileData(cppFile: string): FileData {
		try {
			if (!fs.existsSync(cppFile)) {
				return {
					content: "// File does not exist yet",
					diff: "// New file - no diff available",
				};
			}

			const content = fs.readFileSync(cppFile, "utf8");
			const diff = this.getWorkingTreeDiff(cppFile);
			return { content, diff };
		} catch (error) {
			return {
				content: "",
				diff: "",
				error: `Error reading C++ file: ${error instanceof Error ? error.message : String(error)}`,
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

	private getIndexHTML(): string {
		return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Java-to-C++ Porting Viewer</title>
	<link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
	<link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/diff-highlight/prism-diff-highlight.min.css" rel="stylesheet" />
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body { font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; }
		.header { background: #252526; padding: 1rem; border-bottom: 1px solid #3e3e42; display: flex; justify-content: space-between; align-items: center; }
		.title { font-size: 1.2rem; font-weight: 600; }
		.container { display: flex; height: calc(100vh - 60px); }
		.panel { flex: 1; border-right: 1px solid #3e3e42; display: flex; flex-direction: column; }
		.panel:last-child { border-right: none; }
		.panel-header { background: #2d2d30; padding: 0.75rem; border-bottom: 1px solid #3e3e42; display: flex; justify-content: space-between; align-items: center; }
		.panel-title { font-weight: 500; }
		.toggle-btn { background: #0e639c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-size: 0.875rem; }
		.toggle-btn:hover { background: #1177bb; }
		.content { flex: 1; overflow: auto; }
		.file-content { padding: 1rem; white-space: pre-wrap; font-size: 0.875rem; line-height: 1.5; }
		.error { color: #f48771; background: #2d1b1b; padding: 1rem; margin: 1rem; border-radius: 4px; }
		.loading { color: #cccccc; padding: 1rem; text-align: center; }
		
		/* Prism overrides for dark theme */
		pre[class*="language-"] { background: transparent !important; margin: 0 !important; padding: 0 !important; }
		code[class*="language-"] { background: transparent !important; }
	</style>
</head>
<body>
	<div class="header">
		<div class="title">Java-to-C++ Porting Viewer</div>
		<div id="connection-status">Connecting...</div>
	</div>
	
	<div class="container">
		<div class="panel" id="java-panel">
			<div class="panel-header">
				<div class="panel-title" id="java-title">Java File</div>
				<button class="toggle-btn" id="java-toggle">Show Diff</button>
			</div>
			<div class="content">
				<div class="file-content" id="java-content">Loading...</div>
			</div>
		</div>
		
		<div id="cpp-panels"></div>
	</div>

	<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/diff-highlight/prism-diff-highlight.min.js"></script>

	<script>
		class PortingViewer {
			constructor() {
				this.ws = null;
				this.data = null;
				this.viewModes = { java: 'content' };
				this.loadInitialData();
				this.connect();
			}

			async loadInitialData() {
				try {
					const response = await fetch('/api/data');
					const data = await response.json();
					if (!data.error) {
						this.data = data;
						this.setupPanels();
						this.updateAllPanels();
					}
				} catch (error) {
					console.error('Failed to load initial data:', error);
				}
			}

			connect() {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				this.ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);
				
				this.ws.onopen = () => {
					document.getElementById('connection-status').textContent = 'Connected';
				};
				
				this.ws.onmessage = (event) => {
					const message = JSON.parse(event.data);
					if (message.type === 'update') {
						this.data = message;
						this.setupPanels();
						this.updateAllPanels();
					}
				};
				
				this.ws.onclose = () => {
					document.getElementById('connection-status').textContent = 'Disconnected';
					setTimeout(() => this.connect(), 2000);
				};
			}

			setupPanels() {
				if (!this.data) return;

				// Update Java panel title
				document.getElementById('java-title').textContent = \`Java: \${this.data.filenames.javaFile}\`;
				
				// Create C++ panels
				const cppContainer = document.getElementById('cpp-panels');
				cppContainer.innerHTML = '';
				
				this.data.filenames.cppFiles.forEach((filename, index) => {
					this.viewModes[\`cpp-\${index}\`] = 'content';
					
					const panel = document.createElement('div');
					panel.className = 'panel';
					panel.innerHTML = \`
						<div class="panel-header">
							<div class="panel-title">C++: \${filename}</div>
							<button class="toggle-btn" id="cpp-toggle-\${index}">Show Diff</button>
						</div>
						<div class="content">
							<div class="file-content" id="cpp-content-\${index}">Loading...</div>
						</div>
					\`;
					cppContainer.appendChild(panel);
					
					// Setup toggle for this panel
					document.getElementById(\`cpp-toggle-\${index}\`).onclick = () => this.toggleCppView(index);
				});
				
				// Setup Java toggle
				document.getElementById('java-toggle').onclick = () => this.toggleJavaView();
			}

			toggleJavaView() {
				this.viewModes.java = this.viewModes.java === 'content' ? 'diff' : 'content';
				document.getElementById('java-toggle').textContent = 
					this.viewModes.java === 'content' ? 'Show Diff' : 'Show Current';
				this.updateJavaPanel();
			}

			toggleCppView(index) {
				const key = \`cpp-\${index}\`;
				this.viewModes[key] = this.viewModes[key] === 'content' ? 'diff' : 'content';
				document.getElementById(\`cpp-toggle-\${index}\`).textContent = 
					this.viewModes[key] === 'content' ? 'Show Diff' : 'Show Current';
				this.updateCppPanel(index);
			}

			updateAllPanels() {
				this.updateJavaPanel();
				if (this.data && this.data.cppFiles) {
					this.data.cppFiles.forEach((_, index) => this.updateCppPanel(index));
				}
			}

			updateJavaPanel() {
				if (!this.data || !this.data.javaFile) return;
				const content = this.viewModes.java === 'content' ? this.data.javaFile.content : this.data.javaFile.diff;
				const language = this.viewModes.java === 'content' ? 'java' : 'diff';
				this.updatePanel('java-content', content, language, this.data.javaFile.error);
			}

			updateCppPanel(index) {
				if (!this.data || !this.data.cppFiles[index]) return;
				const data = this.data.cppFiles[index];
				const key = \`cpp-\${index}\`;
				const content = this.viewModes[key] === 'content' ? data.content : data.diff;
				const language = this.viewModes[key] === 'content' ? 'cpp' : 'diff';
				this.updatePanel(\`cpp-content-\${index}\`, content, language, data.error);
			}

			updatePanel(elementId, content, language, error) {
				const element = document.getElementById(elementId);
				if (!element) return;

				if (error) {
					element.innerHTML = \`<div class="error">\${error}</div>\`;
					return;
				}
				
				if (!content.trim()) {
					element.innerHTML = '<div class="loading">No content</div>';
					return;
				}
				
				// Create syntax highlighted content
				const code = document.createElement('code');
				code.className = \`language-\${language}\`;
				code.textContent = content;
				
				const pre = document.createElement('pre');
				pre.className = \`language-\${language}\`;
				pre.appendChild(code);
				
				element.innerHTML = '';
				element.appendChild(pre);
				
				// Apply syntax highlighting
				Prism.highlightElement(code);
			}
		}

		// Initialize the viewer
		new PortingViewer();
	</script>
</body>
</html>`;
	}

	public start(port = 0): Promise<number> {
		return new Promise((resolve) => {
			this.server.listen(port, () => {
				const actualPort = (this.server.address() as any)?.port || port;
				console.log(`🚀 Development server running at: http://localhost:${actualPort}`);
				console.log(
					`📖 Usage: http://localhost:${actualPort}/?java=/path/to/File.java&cpp=/path/to/File.h,/path/to/File.cpp&prevBranch=4.2&currentBranch=4.3-beta`,
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

// CLI usage - just start the server
if (process.argv[1] && process.argv[1].includes("dev-server.ts")) {
	const server = new DevServer();

	server
		.start()
		.then(() => {
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
