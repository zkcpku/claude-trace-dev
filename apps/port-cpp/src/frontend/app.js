class PortingViewer {
	constructor() {
		this.ws = null;
		this.data = null;
		this.viewModes = { java: "content" };
		this.config = this.parseUrlParams();
		this.setupResizer();
		this.connect();
	}

	parseUrlParams() {
		const params = new URLSearchParams(window.location.search);
		return {
			java: params.get("java"),
			targets:
				params
					.get("targets")
					?.split(",")
					.map((t) => t.trim())
					.filter(Boolean) || [],
			prevBranch: params.get("prevBranch"),
			currentBranch: params.get("currentBranch"),
		};
	}

	connect() {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		this.ws = new WebSocket(`${protocol}//${window.location.host}`);

		this.ws.onopen = () => {
			document.getElementById("connection-status").textContent = "Connected";
			document.getElementById("status-circle").classList.add("connected");

			// Send configuration to server if we have URL parameters
			if (
				this.config.java &&
				this.config.targets.length > 0 &&
				this.config.prevBranch &&
				this.config.currentBranch
			) {
				this.ws.send(
					JSON.stringify({
						type: "configure",
						config: this.config,
					}),
				);
			}
		};

		this.ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.type === "update") {
				this.data = message;
				this.setupPanels();
				this.updateAllPanels();
			}
		};

		this.ws.onclose = () => {
			document.getElementById("connection-status").textContent = "Disconnected";
			document.getElementById("status-circle").classList.remove("connected");
			setTimeout(() => this.connect(), 2000);
		};
	}

	setupResizer() {
		const resizer = document.getElementById("resizer");
		const leftSection = document.querySelector(".left-section");
		const rightSection = document.querySelector(".right-section");
		const container = document.querySelector(".container");

		let isResizing = false;

		resizer.addEventListener("mousedown", (e) => {
			isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		});

		document.addEventListener("mousemove", (e) => {
			if (!isResizing) return;

			const containerRect = container.getBoundingClientRect();
			const containerWidth = containerRect.width;
			const resizerWidth = 4;
			const mouseX = e.clientX - containerRect.left;

			// Calculate percentage, ensuring minimum widths
			let leftPercent = (mouseX / containerWidth) * 100;
			leftPercent = Math.max(20, Math.min(80, leftPercent)); // Between 20% and 80%

			const rightPercent = 100 - leftPercent;

			leftSection.style.width = leftPercent + "%";
			rightSection.style.width = rightPercent + "%";
		});

		document.addEventListener("mouseup", () => {
			if (isResizing) {
				isResizing = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		});
	}

	setupPanels() {
		if (!this.data) return;

		// Update Java panel title
		document.getElementById("java-title").textContent = this.data.filenames.javaFile;

		// Create target panels
		const targetContainer = document.getElementById("target-panels");
		targetContainer.innerHTML = "";

		this.data.filenames.targetFiles.forEach((filename, index) => {
			this.viewModes[`target-${index}`] = "content";

			const panel = document.createElement("div");
			panel.className = "panel";
			panel.innerHTML = `
				<div class="panel-header">
					<div class="panel-title">${filename}</div>
					<button class="toggle-btn" id="target-toggle-${index}">Show Diff</button>
				</div>
				<div class="content">
					<div class="file-content" id="target-content-${index}">Loading...</div>
				</div>
			`;
			targetContainer.appendChild(panel);

			// Setup toggle for this panel
			document.getElementById(`target-toggle-${index}`).onclick = () => this.toggleTargetView(index);
		});

		// Setup Java toggle
		document.getElementById("java-toggle").onclick = () => this.toggleJavaView();
	}

	toggleJavaView() {
		this.viewModes.java = this.viewModes.java === "content" ? "diff" : "content";
		document.getElementById("java-toggle").textContent =
			this.viewModes.java === "content" ? "Show Diff" : "Show Current";
		this.updateJavaPanel();
	}

	toggleTargetView(index) {
		const key = `target-${index}`;
		this.viewModes[key] = this.viewModes[key] === "content" ? "diff" : "content";
		document.getElementById(`target-toggle-${index}`).textContent =
			this.viewModes[key] === "content" ? "Show Diff" : "Show Current";
		this.updateTargetPanel(index);
	}

	updateAllPanels() {
		this.updateJavaPanel();
		if (this.data && this.data.targetFiles) {
			this.data.targetFiles.forEach((_, index) => this.updateTargetPanel(index));
		}
	}

	updateJavaPanel() {
		if (!this.data || !this.data.javaFile) return;
		const content = this.viewModes.java === "content" ? this.data.javaFile.content : this.data.javaFile.diff;
		const language = this.viewModes.java === "content" ? "java" : "diff";
		this.updatePanel("java-content", content, language, this.data.javaFile.error);
	}

	updateTargetPanel(index) {
		if (!this.data || !this.data.targetFiles[index]) return;
		const data = this.data.targetFiles[index];
		const key = `target-${index}`;
		const content = this.viewModes[key] === "content" ? data.content : data.diff;

		// Infer language from filename extension
		const filename = this.data.filenames.targetFiles[index];
		const inferredLanguage = this.inferLanguageFromExtension(filename);
		const language = this.viewModes[key] === "content" ? inferredLanguage : "diff";

		this.updatePanel(`target-content-${index}`, content, language, data.error);
	}

	inferLanguageFromExtension(filename) {
		const ext = filename.toLowerCase().split(".").pop();
		const languageMap = {
			// C/C++
			c: "c",
			h: "c", // C headers
			cpp: "cpp",
			cxx: "cpp",
			cc: "cpp",
			"c++": "cpp",
			hpp: "cpp",
			hxx: "cpp",
			hh: "cpp",
			// C#
			cs: "csharp",
			// TypeScript
			ts: "typescript",
			tsx: "typescript",
			// Swift
			swift: "swift",
			// Dart
			dart: "dart",
			// Haxe
			hx: "haxe",
			// Other languages
			java: "java",
			js: "javascript",
			jsx: "javascript",
			py: "python",
			rb: "ruby",
			go: "go",
			rs: "rust",
			kt: "kotlin",
			php: "php",
			lua: "lua",
			sh: "bash",
			bash: "bash",
			yaml: "yaml",
			yml: "yaml",
			json: "json",
			xml: "xml",
			html: "html",
			htm: "html",
			css: "css",
			scss: "scss",
			sass: "sass",
			md: "markdown",
			markdown: "markdown",
			sql: "sql",
		};
		return languageMap[ext] || "text";
	}

	updatePanel(elementId, content, language, error) {
		const element = document.getElementById(elementId);
		if (!element) return;

		if (error) {
			element.innerHTML = `<div class="error">${error}</div>`;
			return;
		}

		if (!content.trim()) {
			element.innerHTML = '<div class="loading">No content</div>';
			return;
		}

		// Create syntax highlighted content
		const code = document.createElement("code");
		code.className = `language-${language}`;
		code.textContent = content;

		const pre = document.createElement("pre");
		pre.className = `language-${language}`;
		pre.appendChild(code);

		element.innerHTML = "";
		element.appendChild(pre);

		// Apply syntax highlighting
		Prism.highlightElement(code);
	}

	sendConfigUpdate() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(
				JSON.stringify({
					type: "configure",
					config: this.config,
				}),
			);
		}
	}
}

// Initialize the viewer
const viewer = new PortingViewer();

// Expose API functions for external control (e.g., puppeteer)
window.portingAPI = {
	// Change the Java file
	setJavaFile(javaPath, prevBranch = "4.2", currentBranch = "4.3-beta") {
		viewer.config.java = javaPath;
		viewer.config.prevBranch = prevBranch;
		viewer.config.currentBranch = currentBranch;
		viewer.sendConfigUpdate();
	},

	// Add a target file
	addTargetFile(targetPath) {
		if (!viewer.config.targets.includes(targetPath)) {
			viewer.config.targets.push(targetPath);
			viewer.sendConfigUpdate();
		}
	},

	// Remove a target file
	removeTargetFile(targetPath) {
		const index = viewer.config.targets.indexOf(targetPath);
		if (index > -1) {
			viewer.config.targets.splice(index, 1);
			viewer.sendConfigUpdate();
		}
	},

	// Set all target files at once
	setTargetFiles(targetPaths) {
		viewer.config.targets = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
		viewer.sendConfigUpdate();
	},

	// Toggle Java diff view
	toggleJavaDiff() {
		viewer.toggleJavaView();
	},

	// Toggle target file diff by index
	toggleTargetDiff(index) {
		viewer.toggleTargetView(index);
	},

	// Toggle target file diff by filename
	toggleTargetDiffByName(filename) {
		if (!viewer.data || !viewer.data.filenames) return;
		const index = viewer.data.filenames.targetFiles.findIndex((f) => f === filename);
		if (index >= 0) {
			viewer.toggleTargetView(index);
		}
	},

	// Get current configuration
	getConfig() {
		return { ...viewer.config };
	},

	// Get current view modes
	getViewModes() {
		return { ...viewer.viewModes };
	},

	// Get loaded filenames
	getFilenames() {
		return viewer.data ? viewer.data.filenames : null;
	},
};
