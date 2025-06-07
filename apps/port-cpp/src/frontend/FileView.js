import logger from "./logger.js";
import FileModel from "./FileModel.js";

// Manages a single file+branch combination with WebSocket updates and panel display
export default class FileView {
	constructor(
		fileIdentity,
		webSocketManager,
		initialContent = "",
		initialDiff = "",
		initialOriginalContent = "",
		initialModifiedContent = "",
	) {
		this.fileIdentity = fileIdentity;
		this.webSocketManager = webSocketManager;
		this.fileModel = new FileModel(
			fileIdentity,
			initialContent,
			initialDiff,
			initialOriginalContent,
			initialModifiedContent,
		);
		this.currentPanel = null;
		this.currentMode = "content";
		this.updateListeners = new Set();
		this.subscribe();
		logger.log(`📁 FileView created for: ${this.fileIdentity.getKey()}`);
	}

	// Subscribe to WebSocket updates for this file
	subscribe() {
		this.webSocketManager.subscribe(this.fileIdentity, (data) => this.handleUpdate(data));
	}

	// Handle file updates from WebSocket
	handleUpdate(data) {
		logger.log(`📥 Update received for: ${this.fileIdentity.getKey()}`, data);

		if (data.type === "fileUpdate") {
			const { content, diff, originalContent, modifiedContent, error } = data;
			this.fileModel.updateContent(content, diff, originalContent, modifiedContent, error);
			if (this.currentPanel) this.refreshDisplay();
			this.notifyListeners({
				type: "updated",
				fileView: this,
				content,
				diff,
				originalContent,
				modifiedContent,
				error,
			});
		} else if (data.type === "fileRemoved") {
			this.notifyListeners({ type: "removed", fileView: this });
		}
	}

	// Display this file in the specified panel with given mode
	displayIn(panel, mode = "content") {
		this.currentPanel = panel;
		this.currentMode = mode;

		if (this.fileModel.error) {
			panel.showError(this.fileModel.error);
			return;
		}

		if (mode === "content") panel.showContent(this.fileModel);
		else if (mode === "fullDiff") panel.showFullDiff(this.fileModel);

		logger.log(`📺 FileView ${this.fileIdentity.getKey()} displayed in panel ${panel.containerId} (${mode} mode)`);
	}

	// Refresh current display (called after file updates)
	refreshDisplay() {
		if (this.currentPanel) this.displayIn(this.currentPanel, this.currentMode);
	}

	// Switch view mode
	switchMode(newMode) {
		if (!this.currentPanel || this.currentMode === newMode) return;
		logger.log(`🔄 Switching from ${this.currentMode} to ${newMode} mode`);
		this.currentMode = newMode;
		this.displayIn(this.currentPanel, newMode);
		this.notifyListeners({ type: "modeChanged", fileView: this, newMode });
	}

	// Toggle between content and fullDiff modes
	toggleMode() {
		const actualPanelMode = this.currentPanel ? this.currentPanel.getCurrentMode() : this.currentMode;
		const newMode = actualPanelMode === "content" ? "fullDiff" : "content";
		logger.log(`🔄 Switching from ${actualPanelMode} to ${newMode} mode`);
		this.switchMode(newMode);
	}

	// Enhanced highlighting API - only works in content mode
	// highlight() -> remove highlight
	// highlight(line) -> highlight single line
	// highlight(start, end) -> highlight section (end inclusive)
	highlight(start, end) {
		if (!this.currentPanel) return;
		this.currentPanel.highlight(start, end);
		this.notifyListeners({
			type: "highlighted",
			fileView: this,
			start,
			end: arguments.length === 0 ? undefined : arguments.length === 1 ? start : end,
		});
	}

	// Legacy method for backward compatibility
	highlightLine(lineNumber) {
		this.highlight(lineNumber);
	}

	// Request refresh from server
	refresh() {
		logger.log(`🔄 Requesting refresh for: ${this.fileIdentity.getKey()}`);
		this.webSocketManager.refreshFile(this.fileIdentity);
	}

	// Add listener for file view events
	addUpdateListener(callback) {
		this.updateListeners.add(callback);
	}

	// Remove listener for file view events
	removeUpdateListener(callback) {
		this.updateListeners.delete(callback);
	}

	// Notify all listeners of events
	notifyListeners(event) {
		for (const callback of this.updateListeners) {
			try {
				callback(event);
			} catch (error) {
				logger.error("Error in FileView listener:", error);
			}
		}
	}

	// Get file info for UI display
	getDisplayInfo() {
		return {
			filename: this.fileIdentity.getDisplayName(),
			filepath: this.fileIdentity.filepath,
			branchInfo: this.fileIdentity.getBranchInfo(),
			key: this.fileIdentity.getKey(),
			hasError: !!this.fileModel.error,
			hasDiff: this.fileModel.hasDiff(),
			currentMode: this.currentMode,
		};
	}

	// Get file identity
	getFileIdentity() {
		return this.fileIdentity;
	}

	// Get file model
	getFileModel() {
		return this.fileModel;
	}

	// Get current mode
	getCurrentMode() {
		return this.currentMode;
	}

	// Check if file has meaningful diff content
	hasDiff() {
		return this.fileModel.hasDiff();
	}

	// Check if file has error
	hasError() {
		return !!this.fileModel.error;
	}

	// Get error message if any
	getError() {
		return this.fileModel.error;
	}

	// Hide from current panel
	hide() {
		if (this.currentPanel) this.currentPanel.saveCurrentViewState();
		this.currentPanel = null;
		logger.log(`👁️ FileView ${this.fileIdentity.getKey()} hidden`);
	}

	// Dispose this file view and cleanup
	dispose() {
		logger.log(`🗑️ Disposing FileView: ${this.fileIdentity.getKey()}`);
		this.hide();
		this.webSocketManager.unsubscribe(this.fileIdentity);
		this.fileModel.dispose();
		this.updateListeners.clear();
		this.currentPanel = null;
		this.fileModel = null;
		this.webSocketManager = null;
	}
}
