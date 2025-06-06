class FileViewer {
	constructor() {
		this.ws = null;
		this.panel0Files = new Map(); // filepath -> {content, diff, error, viewMode, scrollPosition, editor}
		this.panel1File = null; // {filepath, content, diff, error, viewMode, scrollPosition, editor}
		this.activePanel0Tab = null;
		this.monacoLoaded = false;
		this.setupResizer();
		this.initializeMonaco();
	}

	async initializeMonaco() {
		return new Promise((resolve) => {
			require.config({
				paths: {
					vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs",
				},
			});

			require(["vs/editor/editor.main"], () => {
				// Set Monaco theme to match our dark UI
				monaco.editor.defineTheme("custom-dark", {
					base: "vs-dark",
					inherit: true,
					rules: [],
					colors: {
						"editor.background": "#1e1e1e",
						"editor.foreground": "#d4d4d4",
						"editorLineNumber.foreground": "#858585",
						"editorLineNumber.activeForeground": "#c6c6c6",
						"editor.selectionBackground": "#264f78",
						"editor.selectionHighlightBackground": "#add6ff26",
					},
				});

				monaco.editor.setTheme("custom-dark");
				this.monacoLoaded = true;
				this.connect();
				this.updateLayout();
				resolve();
			});
		});
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

			// Trigger Monaco layout update after resize
			setTimeout(() => {
				this.resizeAllEditors();
			}, 0);
		});

		document.addEventListener("mouseup", () => {
			if (isResizing) {
				isResizing = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		});
	}

	resizeAllEditors() {
		// Resize panel 0 active editor
		if (this.activePanel0Tab) {
			const activeFile = this.panel0Files.get(this.activePanel0Tab);
			if (activeFile && activeFile.editor) {
				activeFile.editor.layout();
			}
		}

		// Resize panel 1 editor
		if (this.panel1File && this.panel1File.editor) {
			this.panel1File.editor.layout();
		}
	}

	open(filepath, panel, prevBranch, currBranch) {
		if (panel === 0) {
			// Add to panel 0
			this.panel0Files.set(filepath, {
				filepath: filepath,
				content: "",
				diff: "",
				error: null,
				viewMode: "content", // content, inline-diff, side-diff
				scrollPosition: { lineNumber: 1, column: 1 },
				editor: null,
			});
			this.activePanel0Tab = filepath;
		} else if (panel === 1) {
			// Set panel 1 file
			this.panel1File = {
				filepath: filepath,
				content: "",
				diff: "",
				error: null,
				viewMode: "content", // content, inline-diff, side-diff
				scrollPosition: { lineNumber: 1, column: 1 },
				editor: null,
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
			const fileData = this.panel0Files.get(filepath);
			if (fileData.editor) {
				fileData.editor.dispose();
			}
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
			if (this.panel1File.editor) {
				this.panel1File.editor.dispose();
			}
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

		// Dispose all editors
		for (const [filepath, fileData] of this.panel0Files) {
			if (fileData.editor) {
				fileData.editor.dispose();
			}
		}
		if (this.panel1File && this.panel1File.editor) {
			this.panel1File.editor.dispose();
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
		// Save Panel 0 view state (includes scroll position, cursor, selections, etc.)
		if (this.activePanel0Tab) {
			const activeFile = this.panel0Files.get(this.activePanel0Tab);
			if (activeFile && activeFile.editor) {
				activeFile.viewState = activeFile.editor.saveViewState();
			}
		}

		// Save Panel 1 view state
		if (this.panel1File && this.panel1File.editor) {
			this.panel1File.viewState = this.panel1File.editor.saveViewState();
		}
	}

	updateUI() {
		if (!this.monacoLoaded) return;

		this.saveScrollPositions();
		this.updatePanel0();
		this.updatePanel1();
		this.updateLayout();

		// Restore scroll positions after a short delay to ensure editors are ready
		setTimeout(() => {
			this.restoreScrollPositions();
		}, 100);
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
				return `<div class="tab ${isActive ? "active" : ""}" data-filepath="${filepath}">
					<span class="tab-name">${filename}</span>
					<button class="tab-close" data-filepath="${filepath}" title="Close">×</button>
				</div>`;
			})
			.join("");

		// Get active file data
		const activeFile = this.panel0Files.get(this.activePanel0Tab);

		// SVG icons for toggle button - 3 view modes
		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
			<path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const inlineDiffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
			<path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H4A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const sideDiffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 3a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
			<path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-.5v11h.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h.5V3H7a.5.5 0 0 1-.5-.5v-1A.5.5 0 0 1 7 1h2.5z"/>
			<path d="M11 3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-1z"/>
		</svg>`;

		// Determine current icon and next action based on current view mode
		let toggleIcon, toggleTitle;
		if (!activeFile) {
			toggleIcon = inlineDiffIcon;
			toggleTitle = "Inline Diff";
		} else if (activeFile.viewMode === "content") {
			toggleIcon = inlineDiffIcon;
			toggleTitle = "Inline Diff";
		} else if (activeFile.viewMode === "inline-diff") {
			toggleIcon = sideDiffIcon;
			toggleTitle = "Side-by-Side Diff";
		} else {
			toggleIcon = contentIcon;
			toggleTitle = "Content";
		}

		panel.innerHTML = `
			<div class="panel-header">
				<div class="tabs">${tabs}</div>
				<button class="toggle-btn" id="panel0-toggle" title="${toggleTitle}">${toggleIcon}</button>
			</div>
			<div class="content">
				<div class="monaco-editor-container" id="panel0-editor"></div>
			</div>
		`;

		// Setup tab clicks
		panel.querySelectorAll(".tab").forEach((tab) => {
			// Click anywhere on tab (except close button) to switch tabs
			tab.addEventListener("click", (e) => {
				// Don't trigger if clicking on close button
				if (e.target.classList.contains("tab-close")) {
					return;
				}
				e.stopPropagation();
				// Save current scroll position before switching
				this.saveScrollPositions();
				this.activePanel0Tab = tab.dataset.filepath;
				this.updatePanel0();
			});
		});

		// Setup close buttons
		panel.querySelectorAll(".tab-close").forEach((closeBtn) => {
			closeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const filepath = closeBtn.dataset.filepath;
				this.close(filepath);
			});
		});

		// Setup toggle
		const toggleBtn = document.getElementById("panel0-toggle");
		if (toggleBtn) {
			toggleBtn.addEventListener("click", () => {
				if (activeFile) {
					this.saveScrollPositions();
					// Cycle through: content -> inline-diff -> side-diff -> content
					if (activeFile.viewMode === "content") {
						activeFile.viewMode = "inline-diff";
					} else if (activeFile.viewMode === "inline-diff") {
						activeFile.viewMode = "side-diff";
					} else {
						activeFile.viewMode = "content";
					}
					this.updatePanel0();
				}
			});
		}

		// Create or update Monaco editor
		this.createOrUpdateEditor(activeFile, "panel0-editor");
	}

	updatePanel1() {
		const rightSection = document.querySelector(".right-section");

		if (!this.panel1File) {
			// Clear the content completely when no file is open
			rightSection.innerHTML = "";
			return;
		}

		const filename = this.panel1File.filepath.split("/").pop();

		// SVG icons for toggle button - 3 view modes
		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
			<path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const inlineDiffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
			<path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H4A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5z"/>
		</svg>`;

		const sideDiffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 3a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
			<path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-.5v11h.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h.5V3H7a.5.5 0 0 1-.5-.5v-1A.5.5 0 0 1 7 1h2.5z"/>
			<path d="M11 3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-1z"/>
		</svg>`;

		// Determine current icon and next action based on current view mode
		let toggleIcon, toggleTitle;
		if (this.panel1File.viewMode === "content") {
			toggleIcon = inlineDiffIcon;
			toggleTitle = "Inline Diff";
		} else if (this.panel1File.viewMode === "inline-diff") {
			toggleIcon = sideDiffIcon;
			toggleTitle = "Side-by-Side Diff";
		} else {
			toggleIcon = contentIcon;
			toggleTitle = "Content";
		}

		rightSection.innerHTML = `
			<div class="panel">
				<div class="panel-header">
					<div class="panel-title">${filename}</div>
					<button class="toggle-btn" id="panel1-toggle" title="${toggleTitle}">${toggleIcon}</button>
				</div>
				<div class="content">
					<div class="monaco-editor-container" id="panel1-editor"></div>
				</div>
			</div>
		`;

		// Setup toggle
		const toggleBtn = document.getElementById("panel1-toggle");
		if (toggleBtn) {
			toggleBtn.addEventListener("click", () => {
				this.saveScrollPositions();
				// Cycle through: content -> inline-diff -> side-diff -> content
				if (this.panel1File.viewMode === "content") {
					this.panel1File.viewMode = "inline-diff";
				} else if (this.panel1File.viewMode === "inline-diff") {
					this.panel1File.viewMode = "side-diff";
				} else {
					this.panel1File.viewMode = "content";
				}
				this.updatePanel1();
			});
		}

		// Create or update Monaco editor
		this.createOrUpdateEditor(this.panel1File, "panel1-editor");
	}

	createOrUpdateEditor(fileData, containerId) {
		if (!fileData || fileData.error) {
			const container = document.getElementById(containerId);
			if (container) {
				container.innerHTML = `<div class="error">${fileData?.error || "File data not available"}</div>`;
			}
			return;
		}

		const container = document.getElementById(containerId);
		if (!container) return;

		const language = this.inferLanguageFromPath(fileData.filepath || fileData.absolutePath);
		const isDiffMode = (fileData.viewMode === "inline-diff" || fileData.viewMode === "side-diff") && fileData.diff;
		const isSideBySide = fileData.viewMode === "side-diff";

		// Dispose existing editor and create new one
		if (fileData.editor) {
			fileData.editor.dispose();
			fileData.editor = null;
		}

		if (isDiffMode) {
			// Create diff editor (inline or side-by-side)
			fileData.editor = monaco.editor.createDiffEditor(container, {
				theme: "custom-dark",
				readOnly: true,
				automaticLayout: false,
				scrollBeyondLastLine: false,
				minimap: { enabled: false },
				renderSideBySide: isSideBySide,
				ignoreTrimWhitespace: false,
				renderWhitespace: "selection",
			});

			// Parse diff content to extract original and modified
			const { original, modified } = this.parseDiffContent(fileData.diff);

			const originalModel = monaco.editor.createModel(original, language);
			const modifiedModel = monaco.editor.createModel(modified, language);

			fileData.editor.setModel({
				original: originalModel,
				modified: modifiedModel,
			});
		} else {
			// Create regular editor
			fileData.editor = monaco.editor.create(container, {
				value: fileData.content || "",
				language: language,
				theme: "custom-dark",
				readOnly: true,
				automaticLayout: false,
				scrollBeyondLastLine: false,
				minimap: { enabled: false },
				renderWhitespace: "selection",
			});
		}

		// Layout the editor and restore view state
		setTimeout(() => {
			if (fileData.editor) {
				fileData.editor.layout();
				// Restore view state after layout
				if (fileData.viewState) {
					setTimeout(() => {
						fileData.editor.restoreViewState(fileData.viewState);
					}, 50);
				}
			}
		}, 0);
	}

	parseDiffContent(diff) {
		// Simple diff parser - assumes unified diff format
		const lines = diff.split("\n");
		let original = [];
		let modified = [];

		for (const line of lines) {
			if (line.startsWith("@@")) {
				// Skip diff headers
				continue;
			} else if (line.startsWith("-")) {
				// Line removed in modified version
				original.push(line.substring(1));
			} else if (line.startsWith("+")) {
				// Line added in modified version
				modified.push(line.substring(1));
			} else if (
				line.startsWith(" ") ||
				(!line.startsWith("-") && !line.startsWith("+") && !line.startsWith("@@"))
			) {
				// Context line (same in both)
				const content = line.startsWith(" ") ? line.substring(1) : line;
				original.push(content);
				modified.push(content);
			}
		}

		return {
			original: original.join("\n"),
			modified: modified.join("\n"),
		};
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

		// Trigger editor layout updates
		setTimeout(() => {
			this.resizeAllEditors();
		}, 0);
	}

	getFileExtensionClass(filepath) {
		if (!filepath) return "";

		const ext = filepath.toLowerCase().split(".").pop();
		const extClassMap = {
			js: "file-js",
			jsx: "file-js",
			ts: "file-ts",
			tsx: "file-tsx",
			java: "file-java",
			c: "file-c",
			h: "file-h",
			cpp: "file-cpp",
			cxx: "file-cpp",
			cc: "file-cpp",
			"c++": "file-cpp",
			hpp: "file-hpp",
			hxx: "file-hpp",
			hh: "file-hpp",
			cs: "file-cs",
			py: "file-py",
			swift: "file-swift",
			dart: "file-dart",
			hx: "file-hx",
			md: "file-md",
			markdown: "file-md",
		};
		return extClassMap[ext] || "";
	}

	inferLanguageFromPath(filepath) {
		if (!filepath) return "text";

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
			hx: "javascript", // Haxe syntax is similar to JavaScript/ActionScript
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
			sh: "shell",
			bash: "shell",
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
