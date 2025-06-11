import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { FileStateService } from "../services/file-state.js";
import { MonacoService } from "../services/monaco-manager.js";

/**
 * File panel component - displays files in tabs with Monaco editor
 */
@customElement("diffy-file-panel")
export class FilePanel extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			height: 100%;
			width: 100%;
			background: #1e1e1e;
			border-right: 1px solid #3e3e42;
		}

		:host(:last-child) {
			border-right: none;
		}

		.panel-header {
			background: linear-gradient(to bottom, #2d2d30, #252528);
			padding: 0 0.5rem;
			border-bottom: 1px solid #3e3e42;
			display: flex;
			justify-content: space-between;
			align-items: center;
			height: 35px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}

		.tabs {
			display: flex;
			gap: 0.25rem;
			flex: 1;
			overflow-x: auto;
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.tabs::-webkit-scrollbar {
			display: none;
		}

		.tab {
			background: #2d2d30;
			color: #cccccc;
			padding: 0.5rem 0.75rem;
			cursor: pointer;
			font-size: 0.7rem;
			white-space: nowrap;
			border-right: 1px solid #3e3e42;
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-shrink: 0;
			height: 35px;
			min-width: 120px;
			position: relative;
			transition: all 0.15s ease;
		}

		.tab:hover {
			background: #37373d;
		}

		.tab.active {
			background: #1e1e1e;
			color: white;
			border-bottom: 2px solid #0e639c;
			transform: translateY(-1px);
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		}

		.tab-close {
			background: none;
			border: none;
			color: inherit;
			cursor: pointer;
			font-size: 1rem;
			padding: 0;
			width: 16px;
			height: 16px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 3px;
			opacity: 0.6;
			margin-left: auto;
		}

		.tab-close:hover {
			background: rgba(255, 255, 255, 0.15);
			opacity: 1;
		}

		.file-info {
			background-color: #252526;
			border-bottom: 1px solid #404040;
			padding: 6px 12px;
			font-size: 11px;
			color: #cccccc;
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 8px;
		}

		.file-path {
			color: #569cd6;
			font-family: "Monaco", "Menlo", monospace;
			cursor: pointer;
			transition: color 0.2s ease;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			flex: 1;
		}

		.file-path:hover {
			color: #9cdcfe;
			text-decoration: underline;
		}

		.branch-info {
			color: #9cdcfe;
			font-weight: 500;
		}

		.mode-toggle {
			background: #0e639c;
			color: white;
			border: none;
			padding: 0.25rem 0.4rem;
			border-radius: 3px;
			cursor: pointer;
			font-size: 0.8rem;
			display: flex;
			align-items: center;
			justify-content: center;
			min-width: 24px;
			height: 24px;
			transition: all 0.2s ease;
			opacity: 0.9;
		}

		.mode-toggle:hover {
			background: #1177bb;
			opacity: 1;
			transform: scale(1.05);
		}

		.content {
			flex: 1;
			overflow: hidden;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}

		.editor-container {
			width: 100%;
			height: 100%;
			border: none;
			overflow: hidden;
		}

		.empty-panel {
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			color: #888;
			font-size: 0.9rem;
		}
	`;

	@property({ type: Number }) panelIndex!: number;
	@property({ type: Array }) files!: string[];
	@property({ type: String }) activeTab!: string | null;
	@property({ type: Object }) highlights!: Map<string, { start: number; end: number }>;
	@property({ type: Object }) fileStateService!: FileStateService;
	@property({ type: Object }) monacoService!: MonacoService;

	@state() private viewMode: "content" | "diff" | "fullDiff" = "content";
	@state() private editorId: string | null = null;

	private editorContainer?: HTMLElement;

	connectedCallback() {
		super.connectedCallback();
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		if (this.editorId) {
			this.monacoService.disposeEditor(this.editorId);
		}
	}

	firstUpdated() {
		this.editorContainer = this.shadowRoot?.querySelector(".editor-container") as HTMLElement;
		this.updateEditor();
	}

	updated(changedProperties: Map<string, any>) {
		if (changedProperties.has("activeTab") || changedProperties.has("files")) {
			this.updateEditor();
		}
	}

	private updateEditor() {
		if (!this.editorContainer || !this.monacoService.isInitialized()) return;

		const activeFile = this.fileStateService.getActiveFile(this.panelIndex);
		if (!activeFile) {
			if (this.editorId) {
				this.monacoService.disposeEditor(this.editorId);
				this.editorId = null;
			}
			return;
		}

		// Create editor if needed
		if (!this.editorId) {
			const result = this.monacoService.createEditor(this.editorContainer);
			this.editorId = result.id;
		}

		// Update content
		const language = this.monacoService.inferLanguage(activeFile.absolutePath);
		this.monacoService.setEditorContent(this.editorId, activeFile.data.content, language);

		// Apply highlights
		const highlight = this.highlights.get(activeFile.absolutePath);
		if (highlight) {
			this.monacoService.highlightLines(this.editorId, highlight.start, highlight.end);
		} else {
			this.monacoService.clearHighlights(this.editorId);
		}
	}

	private handleTabClick(fileKey: string) {
		this.fileStateService.setActiveTab(this.panelIndex, fileKey);
		this.requestUpdate();
	}

	private handleTabClose(event: Event, fileKey: string) {
		event.stopPropagation();
		const file = this.fileStateService.getFile(fileKey);
		if (file) {
			this.fileStateService.removeFileFromPanel(this.panelIndex, fileKey);
			this.requestUpdate();
		}
	}

	private handleModeToggle() {
		const modes: ("content" | "diff" | "fullDiff")[] = ["content", "diff", "fullDiff"];
		const currentIndex = modes.indexOf(this.viewMode);
		this.viewMode = modes[(currentIndex + 1) % modes.length];
		// TODO: Implement diff modes
	}

	private async handleFilePathClick(absolutePath: string) {
		try {
			const response = await fetch("/api/open-in-editor", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ filepath: absolutePath }),
			});

			if (!response.ok) {
				console.error("Failed to open file in editor");
			}
		} catch (error) {
			console.error("Error opening file in editor:", error);
		}
	}

	private getModeIcon(): string {
		switch (this.viewMode) {
			case "content":
				return "📄";
			case "diff":
				return "📊";
			case "fullDiff":
				return "🔍";
			default:
				return "📄";
		}
	}

	private getModeTitle(): string {
		switch (this.viewMode) {
			case "content":
				return "Switch to Diff";
			case "diff":
				return "Switch to Full Diff";
			case "fullDiff":
				return "Switch to Content";
			default:
				return "Switch Mode";
		}
	}

	render() {
		if (this.files.length === 0) {
			return html`
				<div class="empty-panel">${this.panelIndex === 0 ? "Left panel" : "Right panel"} - no files open</div>
			`;
		}

		const activeFile = this.fileStateService.getActiveFile(this.panelIndex);

		return html`
			<div class="panel-header">
				<div class="tabs">
					${this.files.map((fileKey) => {
						const file = this.fileStateService.getFile(fileKey);
						if (!file) return "";

						const isActive = fileKey === this.activeTab;
						const filename = this.fileStateService.getFilename(fileKey);

						return html`
							<div
								class="tab ${isActive ? "active" : ""}"
								@click=${() => this.handleTabClick(fileKey)}
								title="${file.absolutePath}"
							>
								<span class="tab-name">${filename}</span>
								<button class="tab-close" @click=${(e: Event) => this.handleTabClose(e, fileKey)} title="Close">
									×
								</button>
							</div>
						`;
					})}
				</div>
			</div>

			${activeFile
				? html`
						<div class="file-info">
							<div class="file-info-content">
								<div
									class="file-path"
									@click=${() => this.handleFilePathClick(activeFile.absolutePath)}
									title="Click to open in editor: ${activeFile.absolutePath}"
								>
									${activeFile.absolutePath}
								</div>
								<div class="branch-info">${this.fileStateService.getBranchInfo(activeFile.key)}</div>
							</div>
							<button class="mode-toggle" @click=${this.handleModeToggle} title="${this.getModeTitle()}">
								${this.getModeIcon()}
							</button>
						</div>
					`
				: ""}

			<div class="content">
				<div class="editor-container"></div>
			</div>
		`;
	}
}
