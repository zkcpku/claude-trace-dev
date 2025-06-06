/**
 * App class coordinates the entire file viewer application
 * Manages panels, file views, tabs, and overall UI state
 */
class App {
	constructor() {
		console.log("🚀 Starting File Viewer App");

		// Step 1: Create WebSocket manager immediately
		this.webSocketManager = new WebSocketManager();

		// Step 2: Wait for Monaco, then create everything else
		this.initializeAsync();
	}

	/**
	 * Initialize the application asynchronously
	 */
	async initializeAsync() {
		// Step 3: Wait for Monaco to be FULLY ready
		await this.waitForMonaco();

		// Step 4: Create the permanent editor containers in DOM
		this.createEditorContainers();

		// Step 5: Now create panels (containers exist!)
		this.leftPanel = new Panel("panel0-editor");
		this.rightPanel = new Panel("panel1-editor");

		// File management
		this.fileViews = new Map();
		this.leftPanelTabs = [];
		this.activeLeftTab = null;
		this.rightPanelFile = null;

		// Initialize everything
		this.initializeWebSocket();
		this.initializeResizer();
		this.initializeUI();
		this.setupGlobalAPI();

		console.log("✅ File Viewer App fully initialized");
	}

	/**
	 * Create permanent editor containers in the DOM
	 */
	createEditorContainers() {
		// Replace left section content with permanent structure
		const leftContent = document.querySelector(".left-section .content");
		if (leftContent) {
			leftContent.innerHTML = '<div class="monaco-editor-container" id="panel0-editor"></div>';
		}

		// Replace right section with permanent structure including panel wrapper
		const rightSection = document.querySelector(".right-section");
		if (rightSection) {
			rightSection.innerHTML = `
                <div class="panel">
                    <div class="content">
                        <div class="monaco-editor-container" id="panel1-editor"></div>
                    </div>
                </div>
            `;
		}

		console.log("📦 Permanent editor containers created");
	}

	/**
	 * Wait for Monaco Editor to be available
	 */
	async waitForMonaco() {
		return new Promise((resolve) => {
			console.log("🔧 Initializing Monaco Editor...");

			// Configure require.js for Monaco
			require.config({
				paths: {
					vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs",
				},
			});

			// Load Monaco Editor
			require(["vs/editor/editor.main"], () => {
				console.log("✅ Monaco Editor loaded");

				try {
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
					console.log("✅ Monaco theme configured");
					resolve();
				} catch (error) {
					console.error("Failed to configure Monaco theme:", error);
					resolve(); // Still resolve to continue initialization
				}
			});
		});
	}

	/**
	 * Initialize WebSocket connection
	 */
	initializeWebSocket() {
		// Add connection status listener
		this.webSocketManager.addConnectionListener((connected) => {
			this.updateConnectionStatus(connected);
		});

		// Connect
		this.webSocketManager.connect();

		console.log("🔌 WebSocket manager initialized");
	}

	/**
	 * Initialize resizer for panel splitting
	 */
	initializeResizer() {
		const resizer = document.getElementById("resizer");
		const leftSection = document.querySelector(".left-section");
		const rightSection = document.querySelector(".right-section");

		if (!resizer || !leftSection || !rightSection) {
			console.warn("Resizer elements not found");
			return;
		}

		let isResizing = false;

		resizer.addEventListener("mousedown", (e) => {
			isResizing = true;
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			e.preventDefault();
		});

		const handleMouseMove = (e) => {
			if (!isResizing) return;

			const containerWidth = document.querySelector(".container").offsetWidth;
			const leftWidth = (e.clientX / containerWidth) * 100;
			const rightWidth = 100 - leftWidth;

			if (leftWidth > 20 && rightWidth > 20) {
				leftSection.style.width = `${leftWidth}%`;
				rightSection.style.width = `${rightWidth}%`;

				// Layout editors after resize
				setTimeout(() => {
					this.leftPanel.layout();
					this.rightPanel.layout();
				}, 0);
			}
		};

		const handleMouseUp = () => {
			isResizing = false;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};

		console.log("📐 Resizer initialized");
	}

	/**
	 * Initialize UI and layout
	 */
	initializeUI() {
		this.updateLeftPanel();
		this.updateRightPanel();
		this.updateLayout();

		console.log("🎨 UI initialized");
	}

	/**
	 * Setup global fileViewer API for external access
	 */
	setupGlobalAPI() {
		window.fileViewer = {
			open: (filepath, panel, prevBranch, currBranch) => {
				this.open(filepath, panel, prevBranch, currBranch);
			},
			close: (filepath, prevBranch, currBranch) => {
				this.close(filepath, prevBranch, currBranch);
			},
			closeAll: () => {
				this.closeAll();
			},
			highlight: (filepath, lineNumber, prevBranch, currBranch) => {
				this.highlight(filepath, lineNumber, prevBranch, currBranch);
			},
			refresh: () => {
				this.refresh();
			},
		};

		console.log("🌐 Global fileViewer API created");
	}

	/**
	 * Open a file in specified panel
	 */
	open(filepath, panel, prevBranch = null, currBranch = null) {
		console.log(`📂 Opening: ${filepath} in panel ${panel}`, { prevBranch, currBranch });

		// Create file identity
		const fileIdentity = new FileIdentity(filepath, prevBranch, currBranch);
		const fileKey = fileIdentity.getKey();

		// Create FileView if doesn't exist
		if (!this.fileViews.has(fileKey)) {
			const fileView = new FileView(fileIdentity, this.webSocketManager);
			this.fileViews.set(fileKey, fileView);

			// Listen for file view events
			fileView.addUpdateListener((event) => {
				this.handleFileViewEvent(event);
			});
		}

		const fileView = this.fileViews.get(fileKey);

		if (panel === 0) {
			// Add to left panel tabs
			if (!this.leftPanelTabs.includes(fileKey)) {
				this.leftPanelTabs.push(fileKey);
			}
			this.activeLeftTab = fileKey;

			// Display in left panel
			const mode = fileView.getCurrentMode();
			fileView.displayIn(this.leftPanel, mode);

			this.updateLeftPanel();
		} else if (panel === 1) {
			// Set as right panel file
			this.rightPanelFile = fileKey;

			// Display in right panel
			const mode = fileView.getCurrentMode();
			fileView.displayIn(this.rightPanel, mode);

			this.updateRightPanel();
		}

		this.updateLayout();

		console.log(`✅ File opened: ${fileKey}`);
	}

	/**
	 * Close a file
	 */
	close(filepath, prevBranch = null, currBranch = null) {
		const fileIdentity = new FileIdentity(filepath, prevBranch, currBranch);
		const fileKey = fileIdentity.getKey();

		console.log(`🗑️ Closing: ${fileKey}`);

		// Remove from left panel tabs
		const leftTabIndex = this.leftPanelTabs.indexOf(fileKey);
		if (leftTabIndex >= 0) {
			this.leftPanelTabs.splice(leftTabIndex, 1);

			// Update active tab
			if (this.activeLeftTab === fileKey) {
				this.activeLeftTab = this.leftPanelTabs.length > 0 ? this.leftPanelTabs[0] : null;
			}
		}

		// Remove from right panel
		if (this.rightPanelFile === fileKey) {
			this.rightPanelFile = null;
		}

		// Dispose file view
		const fileView = this.fileViews.get(fileKey);
		if (fileView) {
			fileView.dispose();
			this.fileViews.delete(fileKey);
		}

		// Update UI
		this.updateLeftPanel();
		this.updateRightPanel();
		this.updateLayout();

		console.log(`✅ File closed: ${fileKey}`);
	}

	/**
	 * Close all files
	 */
	closeAll() {
		console.log("🗑️ Closing all files");

		// Dispose all file views
		for (const fileView of this.fileViews.values()) {
			fileView.dispose();
		}

		// Clear all state
		this.fileViews.clear();
		this.leftPanelTabs = [];
		this.activeLeftTab = null;
		this.rightPanelFile = null;

		// Update UI
		this.updateLeftPanel();
		this.updateRightPanel();
		this.updateLayout();

		console.log("✅ All files closed");
	}

	/**
	 * Highlight a line in a file
	 */
	highlight(filepath, lineNumber, prevBranch = null, currBranch = null) {
		const fileIdentity = new FileIdentity(filepath, prevBranch, currBranch);
		const fileKey = fileIdentity.getKey();

		const fileView = this.fileViews.get(fileKey);
		if (fileView) {
			fileView.highlightLine(lineNumber);
			console.log(`🎯 Highlighted line ${lineNumber} in ${fileKey}`);
		} else {
			console.warn(`Cannot highlight line - file not open: ${fileKey}`);
		}
	}

	/**
	 * Refresh all files
	 */
	refresh() {
		console.log("🔄 Refreshing all files");
		this.webSocketManager.refresh();
	}

	/**
	 * Handle file view events
	 */
	handleFileViewEvent(event) {
		if (event.type === "removed") {
			// File was removed, close it
			const fileKey = event.fileView.getFileIdentity().getKey();
			this.close(
				event.fileView.getFileIdentity().filepath,
				event.fileView.getFileIdentity().prevBranch,
				event.fileView.getFileIdentity().currBranch,
			);
		}
		// Other events can be handled here as needed
	}

	/**
	 * Update left panel UI
	 */
	updateLeftPanel() {
		const leftSection = document.querySelector(".left-section .panel");

		if (this.leftPanelTabs.length === 0) {
			// No files - show empty message but preserve editor container
			let header = leftSection.querySelector(".panel-header");
			if (!header) {
				header = document.createElement("div");
				header.className = "panel-header";
				leftSection.insertBefore(header, leftSection.firstChild);
			}
			header.innerHTML = '<div class="empty-message">No files opened</div>';

			// Ensure content div exists but don't touch editor container
			let content = leftSection.querySelector(".content");
			if (!content) {
				content = document.createElement("div");
				content.className = "content";
				content.innerHTML = '<div class="monaco-editor-container" id="panel0-editor"></div>';
				leftSection.appendChild(content);
			}
			return;
		}

		// Build tabs
		const tabs = this.leftPanelTabs
			.map((fileKey) => {
				const fileView = this.fileViews.get(fileKey);
				const displayInfo = fileView.getDisplayInfo();
				const isActive = fileKey === this.activeLeftTab;

				return `
                <div class="tab ${isActive ? "active" : ""}" data-file-key="${fileKey}">
                    <span class="tab-name" title="${displayInfo.filepath}">${displayInfo.filename}</span>
                    <button class="tab-close" data-file-key="${fileKey}" title="Close">×</button>
                </div>
            `;
			})
			.join("");

		// Get active file info
		const activeFileView = this.activeLeftTab ? this.fileViews.get(this.activeLeftTab) : null;
		const currentMode = activeFileView ? activeFileView.getCurrentMode() : "content";

		// Toggle button icon
		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
            <path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
        </svg>`;

		const diffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 3a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-.5v11h.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h.5V3H7a.5.5 0 0 1-.5-.5v-1A.5.5 0 0 1 7 1h2.5z"/>
            <path d="M11 3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-1z"/>
        </svg>`;

		const toggleIcon = currentMode === "content" ? diffIcon : contentIcon;
		const toggleTitle = currentMode === "content" ? "Diff" : "Content";

		// Update only the header, preserve the content div with editor container
		let header = leftSection.querySelector(".panel-header");
		if (!header) {
			header = document.createElement("div");
			header.className = "panel-header";
			leftSection.insertBefore(header, leftSection.firstChild);
		}
		header.innerHTML = `
            <div class="tabs">${tabs}</div>
            <button class="toggle-btn" id="panel0-toggle" title="${toggleTitle}">${toggleIcon}</button>
        `;

		// Ensure content div exists but don't touch existing editor container
		let content = leftSection.querySelector(".content");
		if (!content) {
			content = document.createElement("div");
			content.className = "content";
			content.innerHTML = '<div class="monaco-editor-container" id="panel0-editor"></div>';
			leftSection.appendChild(content);
		}

		// Setup event listeners
		this.setupLeftPanelEvents();

		// Display active file
		if (activeFileView) {
			activeFileView.displayIn(this.leftPanel, currentMode);
		}
	}

	/**
	 * Setup left panel event listeners
	 */
	setupLeftPanelEvents() {
		// Use event delegation for tabs to avoid multiple listeners
		const leftSection = document.querySelector(".left-section");

		// Remove existing delegated listeners by cloning the left section header
		const header = leftSection.querySelector(".panel-header");
		if (header) {
			const newHeader = header.cloneNode(true);
			header.parentNode.replaceChild(newHeader, header);

			// Setup delegated event listeners on the new header
			newHeader.addEventListener("click", (e) => {
				// Handle tab clicks
				const tab = e.target.closest(".tab");
				if (tab && !e.target.classList.contains("tab-close")) {
					const fileKey = tab.dataset.fileKey;
					if (fileKey && fileKey !== this.activeLeftTab) {
						this.activeLeftTab = fileKey;
						this.updateLeftPanel();
					}
					return;
				}

				// Handle tab close buttons
				const closeBtn = e.target.closest(".tab-close");
				if (closeBtn) {
					e.stopPropagation();
					const fileKey = closeBtn.dataset.fileKey;
					const fileView = this.fileViews.get(fileKey);
					if (fileView) {
						const identity = fileView.getFileIdentity();
						this.close(identity.filepath, identity.prevBranch, identity.currBranch);
					}
					return;
				}

				// Handle toggle button
				const toggleBtn = e.target.closest("#panel0-toggle");
				if (toggleBtn && this.activeLeftTab) {
					const fileView = this.fileViews.get(this.activeLeftTab);
					if (fileView) {
						fileView.toggleMode();
						// Update UI after mode change
						setTimeout(() => this.updateLeftPanel(), 0);
					}
					return;
				}
			});
		}
	}

	/**
	 * Update right panel UI
	 */
	updateRightPanel() {
		const rightSection = document.querySelector(".right-section");

		if (!this.rightPanelFile) {
			// Hide right panel when no file
			rightSection.style.display = "none";
			return;
		}

		const fileView = this.fileViews.get(this.rightPanelFile);
		if (!fileView) {
			rightSection.style.display = "none";
			return;
		}

		// Show right panel
		rightSection.style.display = "flex";

		const displayInfo = fileView.getDisplayInfo();
		const currentMode = fileView.getCurrentMode();

		// Toggle button icon
		const contentIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4z"/>
            <path d="M4.5 8a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
        </svg>`;

		const diffIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 3a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z"/>
            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-.5v11h.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h.5V3H7a.5.5 0 0 1-.5-.5v-1A.5.5 0 0 1 7 1h2.5z"/>
            <path d="M11 3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-1z"/>
        </svg>`;

		const toggleIcon = currentMode === "content" ? diffIcon : contentIcon;
		const toggleTitle = currentMode === "content" ? "Diff" : "Content";

		// Update with panel structure preserving the permanent editor container
		let panel = rightSection.querySelector(".panel");
		if (!panel) {
			panel = document.createElement("div");
			panel.className = "panel";
			rightSection.appendChild(panel);
		}

		let header = panel.querySelector(".panel-header");
		if (!header) {
			header = document.createElement("div");
			header.className = "panel-header";
			panel.insertBefore(header, panel.firstChild);
		}
		header.innerHTML = `
            <div class="panel-title" title="${displayInfo.filepath}">${displayInfo.filename}</div>
            <button class="toggle-btn" id="panel1-toggle" title="${toggleTitle}">${toggleIcon}</button>
        `;

		// Ensure content div exists but don't touch existing editor container
		let content = panel.querySelector(".content");
		if (!content) {
			content = document.createElement("div");
			content.className = "content";
			content.innerHTML = '<div class="monaco-editor-container" id="panel1-editor"></div>';
			panel.appendChild(content);
		}

		// Setup event listeners
		this.setupRightPanelEvents();

		// Display file
		fileView.displayIn(this.rightPanel, currentMode);
	}

	/**
	 * Setup right panel event listeners
	 */
	setupRightPanelEvents() {
		const toggleBtn = document.getElementById("panel1-toggle");
		if (toggleBtn && this.rightPanelFile) {
			// Remove any existing listeners by cloning the button
			const newToggleBtn = toggleBtn.cloneNode(true);
			toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);

			// Add fresh event listener
			newToggleBtn.addEventListener("click", () => {
				const fileView = this.fileViews.get(this.rightPanelFile);
				if (fileView) {
					fileView.toggleMode();
					// Update UI after mode change
					setTimeout(() => this.updateRightPanel(), 0);
				}
			});
		}
	}

	/**
	 * Update layout based on visible panels
	 */
	updateLayout() {
		const leftSection = document.querySelector(".left-section");
		const rightSection = document.querySelector(".right-section");
		const resizer = document.getElementById("resizer");

		if (!this.rightPanelFile) {
			// Hide right panel and resizer
			rightSection.style.display = "none";
			resizer.style.display = "none";
			leftSection.style.width = "100%";
		} else {
			// Show both panels
			rightSection.style.display = "flex";
			resizer.style.display = "block";
			leftSection.style.width = "50%";
			rightSection.style.width = "50%";
		}

		// Layout editors
		setTimeout(() => {
			this.leftPanel.layout();
			this.rightPanel.layout();
		}, 0);
	}

	/**
	 * Update connection status display
	 */
	updateConnectionStatus(connected) {
		const statusElement = document.getElementById("connection-status");
		const circleElement = document.getElementById("status-circle");

		if (statusElement) {
			statusElement.textContent = connected ? "Connected" : "Disconnected";
		}

		if (circleElement) {
			if (connected) {
				circleElement.classList.add("connected");
			} else {
				circleElement.classList.remove("connected");
			}
		}
	}

	/**
	 * Dispose app and cleanup
	 */
	dispose() {
		console.log("🗑️ Disposing App");

		// Close all files
		this.closeAll();

		// Dispose panels
		if (this.leftPanel) {
			this.leftPanel.dispose();
		}
		if (this.rightPanel) {
			this.rightPanel.dispose();
		}

		// Disconnect WebSocket
		this.webSocketManager.disconnect();

		// Clear global API
		delete window.fileViewer;

		console.log("✅ App disposed");
	}
}
