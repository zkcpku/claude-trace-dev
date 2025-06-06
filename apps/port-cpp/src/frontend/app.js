class FileViewer {
	constructor() {
		this.ws = null;
		this.panel0Files = new Map(); // filepath -> {content, diff, error, viewMode, scrollPosition}
		this.panel1File = null; // {filepath, content, diff, error, viewMode, scrollPosition}
		this.activePanel0Tab = null;
		this.setupResizer();
		this.connect();
		// Set initial layout
		this.updateLayout();
	}

	connect() {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		this.ws = new WebSocket(`${protocol}//${window.location.host}`);

		this.ws.onopen = () => {
			document.getElementById("connection-status").textContent = "Connected";
			document.getElementById("status-circle").classList.add("connected");
		};

		this.ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			this.handleFileUpdate(message);
		};

		this.ws.onclose = () => {
			document.getElementById("connection-status").textContent = "Disconnected";
			document.getElementById("status-circle").classList.remove("connected");
			setTimeout(() => this.connect(), 2000);
		};
	}

	handleFileUpdate(data) {
		if (data.type === "fileUpdate") {
			const { absolutePath, content, diff, error } = data;

			// Update panel 0 files
			if (this.panel0Files.has(absolutePath)) {
				const fileData = this.panel0Files.get(absolutePath);
				fileData.content = content;
				fileData.diff = diff;
				fileData.error = error;
			}

			// Update panel 1 file
			if (this.panel1File && this.panel1File.filepath === absolutePath) {
				this.panel1File.content = content;
				this.panel1File.diff = diff;
				this.panel1File.error = error;
			}

			this.updateUI();
		} else if (data.type === "fileRemoved") {
			const { absolutePath } = data;

			// Remove from panel 0 if present
			if (this.panel0Files.has(absolutePath)) {
				this.close(absolutePath);
			}

			// Remove from panel 1 if present
			if (this.panel1File && this.panel1File.filepath === absolutePath) {
				this.close(absolutePath);
			}
		}
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
			const mouseX = e.clientX - containerRect.left;

			let leftPercent = (mouseX / containerWidth) * 100;
			leftPercent = Math.max(20, Math.min(80, leftPercent));

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

	open(filepath, panel, prevBranch, currBranch) {
		if (panel === 0) {
			// Add to panel 0
			this.panel0Files.set(filepath, {
				content: "",
				diff: "",
				error: null,
				viewMode: "content",
				scrollPosition: 0,
			});
			this.activePanel0Tab = filepath;
		} else if (panel === 1) {
			// Set panel 1 file
			this.panel1File = {
				filepath: filepath,
				content: "",
				diff: "",
				error: null,
				viewMode: "content",
				scrollPosition: 0,
			};
		}

		// Send watch request to server
		this.sendWatchRequest(filepath, prevBranch, currBranch);
		this.updateUI();
	}

	close(filepath) {
		let wasWatched = false;

		// Remove from panel 0
		if (this.panel0Files.has(filepath)) {
			this.panel0Files.delete(filepath);
			wasWatched = true;

			// Update active tab
			if (this.activePanel0Tab === filepath) {
				const remaining = Array.from(this.panel0Files.keys());
				this.activePanel0Tab = remaining.length > 0 ? remaining[0] : null;
			}
		}

		// Remove from panel 1
		if (this.panel1File && this.panel1File.filepath === filepath) {
			this.panel1File = null;
			wasWatched = true;
		}

		// Send unwatch request if file was being watched
		if (wasWatched) {
			this.sendUnwatchRequest(filepath);
		}

		this.updateUI();
	}

	closeAll() {
		// Send unwatch requests for all files
		for (const filepath of this.panel0Files.keys()) {
			this.sendUnwatchRequest(filepath);
		}
		if (this.panel1File) {
			this.sendUnwatchRequest(this.panel1File.filepath);
		}

		// Clear all files
		this.panel0Files.clear();
		this.activePanel0Tab = null;
		this.panel1File = null;
		this.updateUI();
	}

	sendWatchRequest(filepath, prevBranch, currBranch) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(
				JSON.stringify({
					type: "watch",
					absolutePath: filepath,
					prevBranch: prevBranch,
					currBranch: currBranch,
				}),
			);
		}
	}

	sendUnwatchRequest(filepath) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(
				JSON.stringify({
					type: "unwatch",
					absolutePath: filepath,
				}),
			);
		}
	}

	saveScrollPositions() {
		// Save Panel 0 scroll position
		const panel0Content = document.querySelector(".left-section .content");
		if (panel0Content && this.activePanel0Tab) {
			const activeFile = this.panel0Files.get(this.activePanel0Tab);
			if (activeFile) {
				activeFile.scrollPosition = panel0Content.scrollTop;
			}
		}

		// Save Panel 1 scroll position
		const panel1Content = document.querySelector(".right-section .content");
		if (panel1Content && this.panel1File) {
			this.panel1File.scrollPosition = panel1Content.scrollTop;
		}
	}

	restoreScrollPositions() {
		// Restore Panel 0 scroll position
		const panel0Content = document.querySelector(".left-section .content");
		if (panel0Content && this.activePanel0Tab) {
			const activeFile = this.panel0Files.get(this.activePanel0Tab);
			if (activeFile && typeof activeFile.scrollPosition === "number") {
				// Use requestAnimationFrame to ensure DOM is updated
				requestAnimationFrame(() => {
					panel0Content.scrollTop = activeFile.scrollPosition;
				});
			}
		}

		// Restore Panel 1 scroll position
		const panel1Content = document.querySelector(".right-section .content");
		if (panel1Content && this.panel1File && typeof this.panel1File.scrollPosition === "number") {
			requestAnimationFrame(() => {
				panel1Content.scrollTop = this.panel1File.scrollPosition;
			});
		}
	}

	updateUI() {
		this.saveScrollPositions();
		this.updatePanel0();
		this.updatePanel1();
		this.updateLayout();
		this.restoreScrollPositions();
	}

	updatePanel0() {
		const panel = document.querySelector(".left-section .panel");

		if (this.panel0Files.size === 0) {
			// No files - show empty state without header
			panel.innerHTML = `
				<div class="content">
					<div class="file-content">No files opened</div>
				</div>
			`;
			return;
		}

		// Build tabs
		const tabs = Array.from(this.panel0Files.keys())
			.map((filepath) => {
				const filename = filepath.split("/").pop();
				const isActive = filepath === this.activePanel0Tab;
				return `<div class="tab ${isActive ? "active" : ""}" data-filepath="${filepath}">${filename}</div>`;
			})
			.join("");

		// Get active file data
		const activeFile = this.panel0Files.get(this.activePanel0Tab);
		const content = activeFile ? (activeFile.viewMode === "content" ? activeFile.content : activeFile.diff) : "";
		const language = this.inferLanguageFromPath(this.activePanel0Tab);

		// SVG icons for toggle button
		const diffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8.5 1a.5.5 0 0 0-1 0v4H3a.5.5 0 0 0 0 1h4.5v4a.5.5 0 0 0 1 0V6H13a.5.5 0 0 0 0-1H8.5V1z"/>
			<path d="M1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zm0-2a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
			<path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const toggleIcon = activeFile && activeFile.viewMode === "content" ? diffIcon : contentIcon;
		const toggleTitle = activeFile && activeFile.viewMode === "content" ? "Show Diff" : "Show Content";

		panel.innerHTML = `
			<div class="panel-header">
				<div class="tabs">${tabs}</div>
				<button class="toggle-btn" id="panel0-toggle" title="${toggleTitle}">${toggleIcon}</button>
			</div>
			<div class="content">
				<div class="file-content" id="panel0-content">${this.formatContent(content, language, activeFile?.error)}</div>
			</div>
		`;

		// Setup tab clicks
		panel.querySelectorAll(".tab").forEach((tab) => {
			tab.addEventListener("click", () => {
				// Save current scroll position before switching
				this.saveScrollPositions();
				this.activePanel0Tab = tab.dataset.filepath;
				this.updatePanel0();
				// Restore scroll position for the new tab
				this.restoreScrollPositions();
			});
		});

		// Setup toggle
		const toggleBtn = document.getElementById("panel0-toggle");
		if (toggleBtn) {
			toggleBtn.addEventListener("click", () => {
				if (activeFile) {
					activeFile.viewMode = activeFile.viewMode === "content" ? "diff" : "content";
					this.updatePanel0();
				}
			});
		}
	}

	updatePanel1() {
		const rightSection = document.querySelector(".right-section");

		if (!this.panel1File) {
			// Clear the content completely when no file is open
			rightSection.innerHTML = "";
			return;
		}

		const filename = this.panel1File.filepath.split("/").pop();
		const content = this.panel1File.viewMode === "content" ? this.panel1File.content : this.panel1File.diff;
		const language = this.inferLanguageFromPath(this.panel1File.filepath);

		// SVG icons for toggle button
		const diffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8.5 1a.5.5 0 0 0-1 0v4H3a.5.5 0 0 0 0 1h4.5v4a.5.5 0 0 0 1 0V6H13a.5.5 0 0 0 0-1H8.5V1z"/>
			<path d="M1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zm0-2a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
			<path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const toggleIcon = this.panel1File.viewMode === "content" ? diffIcon : contentIcon;
		const toggleTitle = this.panel1File.viewMode === "content" ? "Show Diff" : "Show Content";

		rightSection.innerHTML = `
			<div class="panel">
				<div class="panel-header">
					<div class="panel-title">${filename}</div>
					<button class="toggle-btn" id="panel1-toggle" title="${toggleTitle}">${toggleIcon}</button>
				</div>
				<div class="content">
					<div class="file-content" id="panel1-content">${this.formatContent(content, language, this.panel1File.error)}</div>
				</div>
			</div>
		`;

		// Setup toggle
		const toggleBtn = document.getElementById("panel1-toggle");
		if (toggleBtn) {
			toggleBtn.addEventListener("click", () => {
				this.panel1File.viewMode = this.panel1File.viewMode === "content" ? "diff" : "content";
				this.updatePanel1();
			});
		}
	}

	formatContent(content, language, error) {
		if (error) {
			return `<div class="error">${error}</div>`;
		}

		if (!content.trim()) {
			return '<div class="loading">No content</div>';
		}

		const code = document.createElement("code");
		code.className = `language-${language}`;
		code.textContent = content;

		const pre = document.createElement("pre");
		pre.className = `language-${language}`;
		pre.appendChild(code);

		// Apply syntax highlighting
		Prism.highlightElement(code);

		return pre.outerHTML;
	}

	updateLayout() {
		const leftSection = document.querySelector(".left-section");
		const rightSection = document.querySelector(".right-section");
		const resizer = document.getElementById("resizer");

		if (!this.panel1File) {
			// Hide right panel and resizer, give left panel full width
			rightSection.style.display = "none";
			resizer.style.display = "none";
			leftSection.style.width = "100%";
		} else {
			// Show both panels with resizer
			rightSection.style.display = "block";
			resizer.style.display = "block";
			leftSection.style.width = "50%";
			rightSection.style.width = "50%";
		}
	}

	inferLanguageFromPath(filepath) {
		const ext = filepath.toLowerCase().split(".").pop();
		const languageMap = {
			c: "c",
			h: "c",
			cpp: "cpp",
			cxx: "cpp",
			cc: "cpp",
			"c++": "cpp",
			hpp: "cpp",
			hxx: "cpp",
			hh: "cpp",
			cs: "csharp",
			ts: "typescript",
			tsx: "typescript",
			swift: "swift",
			dart: "dart",
			hx: "haxe",
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
}

// Initialize the viewer
const viewer = new FileViewer();

// Expose fileViewer API
window.fileViewer = {
	// Open file in specified panel with optional git diff (absolute paths only)
	open(absolutePath, panel, prevBranch, currBranch) {
		viewer.open(absolutePath, panel, prevBranch, currBranch);
	},

	// Close specific file (auto-hides panel 1 if that file was closed)
	close(absolutePath) {
		viewer.close(absolutePath);
	},

	// Close all files in both panels
	closeAll() {
		viewer.closeAll();
	},
};
