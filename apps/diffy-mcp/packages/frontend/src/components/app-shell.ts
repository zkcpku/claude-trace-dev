import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WebSocketService } from "../services/websocket.js";
import { FileStateService } from "../services/file-state.js";
import { MonacoService } from "../services/monaco-manager.js";

interface AppState {
	panels: [string[], string[]];
	activeTabs: [string | null, string | null];
	highlights: Map<string, { start: number; end: number }>;
	connectionStatus: "connecting" | "connected" | "disconnected" | "error";
	hasFiles: boolean;
}

/**
 * Main application shell - coordinates all components and services
 */
@customElement("diffy-app")
export class AppShell extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			height: 100vh;
			width: 100%;
			background: #1e1e1e;
			color: #d4d4d4;
			font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace;
		}

		.connection-status {
			position: fixed;
			bottom: 20px;
			right: 20px;
			z-index: 1000;
			font-size: 0.7rem;
			color: #888;
			display: flex;
			align-items: center;
			gap: 0.5rem;
			background: rgba(30, 30, 30, 0.9);
			padding: 0.5rem 0.75rem;
			border-radius: 4px;
			border: 1px solid #3e3e42;
		}

		.status-circle {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: #ef4444;
		}

		.status-circle.connected {
			background: #22c55e;
		}

		.status-circle.connecting {
			background: #f59e0b;
			animation: pulse 1s infinite;
		}

		@keyframes pulse {
			0%,
			100% {
				opacity: 0.6;
			}
			50% {
				opacity: 1;
			}
		}

		.main-container {
			display: flex;
			flex: 1;
			height: 100%;
			min-height: 0;
			overflow: hidden;
		}

		.empty-state {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			color: #888;
			padding: 2rem;
			text-align: center;
		}

		.empty-icon {
			font-size: 4rem;
			margin-bottom: 1rem;
			opacity: 0.6;
		}

		.empty-title {
			font-size: 1.4rem;
			font-weight: 600;
			margin-bottom: 0.5rem;
			color: #cccccc;
		}

		.empty-message {
			font-size: 1rem;
			line-height: 1.4;
			max-width: 500px;
			margin-bottom: 1.5rem;
		}

		.empty-instructions {
			font-size: 0.9rem;
			color: #888;
			line-height: 1.4;
			max-width: 600px;
		}

		.panels-container {
			display: flex;
			flex: 1;
			height: 100%;
			min-height: 0;
		}

		.panel-divider {
			width: 4px;
			min-width: 4px;
			background: #3e3e42;
			cursor: col-resize;
			user-select: none;
			flex-shrink: 0;
		}

		.panel-divider:hover {
			background: #0e639c;
		}

		.left-panel,
		.right-panel {
			flex: 1;
			min-width: 0;
			height: 100%;
		}

		.single-panel {
			width: 100%;
		}
	`;

	@state() private appState: AppState = {
		panels: [[], []],
		activeTabs: [null, null],
		highlights: new Map(),
		connectionStatus: "connecting",
		hasFiles: false,
	};

	private webSocketService!: WebSocketService;
	private fileStateService!: FileStateService;
	private monacoService!: MonacoService;
	private resizeObserver?: ResizeObserver;

	async connectedCallback() {
		super.connectedCallback();
		await this.initializeServices();
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.cleanup();
	}

	private async initializeServices() {
		try {
			// Initialize Monaco first
			this.monacoService = new MonacoService();
			await this.monacoService.initialize();

			// Initialize file state service
			this.fileStateService = new FileStateService();

			// Initialize WebSocket service
			this.webSocketService = new WebSocketService();
			this.setupWebSocketListeners();

			// Connect to server
			await this.webSocketService.connect();

			// Setup resize handling
			this.setupResizeHandling();

			// App is ready
			this.dispatchEvent(new CustomEvent("diffy-ready", { bubbles: true }));

			console.log("✅ Diffy app initialized");
		} catch (error) {
			console.error("Failed to initialize app:", error);
			this.appState = { ...this.appState, connectionStatus: "error" };
		}
	}

	private setupWebSocketListeners() {
		this.webSocketService.addEventListener("connection-status", (event: any) => {
			const { connected } = event.detail;
			this.appState = {
				...this.appState,
				connectionStatus: connected ? "connected" : "disconnected",
			};
		});

		this.webSocketService.addEventListener("state-restore", (event: any) => {
			const { panels, activeTabs, highlights } = event.detail;
			this.fileStateService.restoreState(panels, activeTabs, highlights);
			this.updateAppState();
		});

		this.webSocketService.addEventListener("file-update", (event: any) => {
			const { absolutePath, branch, content, diff, originalContent, modifiedContent, error } = event.detail;
			this.fileStateService.updateFile(absolutePath, branch, {
				content,
				diff,
				originalContent,
				modifiedContent,
				error,
			});
			this.updateAppState();
		});

		this.webSocketService.addEventListener("open-file", (event: any) => {
			const { absolutePath, panel, branch } = event.detail;
			this.fileStateService.openFile(absolutePath, panel, branch);
			this.updateAppState();
		});

		this.webSocketService.addEventListener("close-file", (event: any) => {
			const { absolutePath } = event.detail;
			this.fileStateService.closeFile(absolutePath);
			this.updateAppState();
		});

		this.webSocketService.addEventListener("highlight-file", (event: any) => {
			const { absolutePath, startLine, endLine } = event.detail;
			this.fileStateService.highlightFile(absolutePath, startLine, endLine);
			this.updateAppState();
		});
	}

	private updateAppState() {
		const state = this.fileStateService.getState();
		this.appState = {
			...this.appState,
			panels: state.panels,
			activeTabs: state.activeTabs,
			highlights: state.highlights,
			hasFiles: state.panels[0].length > 0 || state.panels[1].length > 0,
		};
	}

	private setupResizeHandling() {
		this.resizeObserver = new ResizeObserver(() => {
			// Layout Monaco editors when container resizes
			setTimeout(() => {
				this.monacoService.layoutAllEditors();
			}, 0);
		});

		this.resizeObserver.observe(this);
	}

	private cleanup() {
		this.webSocketService?.disconnect();
		this.monacoService?.dispose();
		this.resizeObserver?.disconnect();
	}

	private getConnectionStatusText(): string {
		switch (this.appState.connectionStatus) {
			case "connecting":
				return "Connecting...";
			case "connected":
				return "Connected";
			case "disconnected":
				return "Disconnected";
			case "error":
				return "Error";
			default:
				return "Unknown";
		}
	}

	private getConnectionStatusClass(): string {
		switch (this.appState.connectionStatus) {
			case "connected":
				return "connected";
			case "connecting":
				return "connecting";
			default:
				return "";
		}
	}

	private renderEmptyState() {
		return html`
			<div class="empty-state">
				<div class="empty-icon">📁</div>
				<div class="empty-title">Welcome to Diffy</div>
				<div class="empty-message">
					No files are currently open. Use the MCP tools to open files for viewing and comparison.
				</div>
				<div class="empty-instructions">
					<strong>Available MCP Tools:</strong><br />
					• <code>open</code> - Open a file in left (0) or right (1) panel<br />
					• <code>highlight</code> - Highlight specific lines in a file<br />
					• <code>close</code> - Close a file from all panels<br />
					• <code>refresh</code> - Refresh all files and diffs
				</div>
			</div>
		`;
	}

	private renderPanels() {
		const leftHasFiles = this.appState.panels[0].length > 0;
		const rightHasFiles = this.appState.panels[1].length > 0;

		if (!leftHasFiles && !rightHasFiles) {
			return this.renderEmptyState();
		}

		// Single panel mode
		if (leftHasFiles && !rightHasFiles) {
			return html`
				<diffy-file-panel
					.panelIndex=${0}
					.files=${this.appState.panels[0]}
					.activeTab=${this.appState.activeTabs[0]}
					.highlights=${this.appState.highlights}
					.fileStateService=${this.fileStateService}
					.monacoService=${this.monacoService}
					class="single-panel"
				>
				</diffy-file-panel>
			`;
		}

		if (!leftHasFiles && rightHasFiles) {
			return html`
				<diffy-file-panel
					.panelIndex=${1}
					.files=${this.appState.panels[1]}
					.activeTab=${this.appState.activeTabs[1]}
					.highlights=${this.appState.highlights}
					.fileStateService=${this.fileStateService}
					.monacoService=${this.monacoService}
					class="single-panel"
				>
				</diffy-file-panel>
			`;
		}

		// Dual panel mode
		return html`
			<div class="panels-container">
				<diffy-file-panel
					.panelIndex=${0}
					.files=${this.appState.panels[0]}
					.activeTab=${this.appState.activeTabs[0]}
					.highlights=${this.appState.highlights}
					.fileStateService=${this.fileStateService}
					.monacoService=${this.monacoService}
					class="left-panel"
				>
				</diffy-file-panel>

				<div class="panel-divider"></div>

				<diffy-file-panel
					.panelIndex=${1}
					.files=${this.appState.panels[1]}
					.activeTab=${this.appState.activeTabs[1]}
					.highlights=${this.appState.highlights}
					.fileStateService=${this.fileStateService}
					.monacoService=${this.monacoService}
					class="right-panel"
				>
				</diffy-file-panel>
			</div>
		`;
	}

	render() {
		return html`
			<div class="main-container">${this.renderPanels()}</div>

			<div class="connection-status">
				<div class="status-circle ${this.getConnectionStatusClass()}"></div>
				<span>${this.getConnectionStatusText()}</span>
			</div>
		`;
	}
}
