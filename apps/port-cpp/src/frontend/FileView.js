/**
 * FileView manages a single file+branch combination
 * Handles WebSocket subscription, file updates, and coordinates with Panel for display
 */
class FileView {
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

		// Create file model
		this.fileModel = new FileModel(
			fileIdentity,
			initialContent,
			initialDiff,
			initialOriginalContent,
			initialModifiedContent,
		);

		// Current display state
		this.currentPanel = null;
		this.currentMode = "content"; // 'content', 'diff', or 'fullDiff'

		// Event listeners
		this.updateListeners = new Set();

		// Subscribe to WebSocket updates
		this.subscribe();

		console.log(`📁 FileView created for: ${this.fileIdentity.getKey()}`);
	}

	/**
	 * Subscribe to WebSocket updates for this file
	 */
	subscribe() {
		this.webSocketManager.subscribe(this.fileIdentity, (data) => this.handleUpdate(data));
	}

	/**
	 * Handle file updates from WebSocket
	 */
	handleUpdate(data) {
		console.log(`📥 Update received for: ${this.fileIdentity.getKey()}`, data);

		if (data.type === "fileUpdate") {
			const { content, diff, originalContent, modifiedContent, error } = data;

			// Update file model
			this.fileModel.updateContent(content, diff, originalContent, modifiedContent, error);

			// Notify panel if currently displayed
			if (this.currentPanel) {
				this.refreshDisplay();
			}

			// Notify any listeners
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
			// Handle file removal
			this.notifyListeners({
				type: "removed",
				fileView: this,
			});
		}
	}

	/**
	 * Display this file in the specified panel with given mode
	 */
	displayIn(panel, mode = "content") {
		this.currentPanel = panel;
		this.currentMode = mode;

		// Check for errors first
		if (this.fileModel.error) {
			panel.showError(this.fileModel.error);
			return;
		}

		// Display based on mode
		if (mode === "content") {
			panel.showContent(this.fileModel);
		} else if (mode === "diff") {
			panel.showDiff(this.fileModel);
		} else if (mode === "fullDiff") {
			panel.showFullDiff(this.fileModel);
		}

		console.log(`📺 FileView ${this.fileIdentity.getKey()} displayed in panel ${panel.containerId} (${mode} mode)`);
	}

	/**
	 * Refresh current display (called after file updates)
	 */
	refreshDisplay() {
		if (!this.currentPanel) return;

		// Re-display with current mode
		this.displayIn(this.currentPanel, this.currentMode);
	}

	/**
	 * Switch view mode (content <-> diff)
	 */
	switchMode(newMode) {
		if (!this.currentPanel) {
			console.warn("Cannot switch mode - file not displayed in any panel");
			return;
		}

		if (this.currentMode === newMode) {
			console.log(`Already in ${newMode} mode`);
			return;
		}

		console.log(`🔄 Switching from ${this.currentMode} to ${newMode} mode`);

		this.currentMode = newMode;
		this.displayIn(this.currentPanel, newMode);

		// Notify listeners of mode change
		this.notifyListeners({
			type: "modeChanged",
			fileView: this,
			newMode,
		});
	}

	/**
	 * Toggle between content, diff, and fullDiff modes
	 */
	toggleMode() {
		// Check the actual panel mode, not just the FileView mode
		const actualPanelMode = this.currentPanel ? this.currentPanel.getCurrentMode() : this.currentMode;

		let newMode;
		if (actualPanelMode === "content") {
			newMode = "diff";
		} else if (actualPanelMode === "diff") {
			newMode = "fullDiff";
		} else {
			// If in 'fullDiff', 'no-diff', or any other mode, switch to content
			newMode = "content";
		}

		console.log(`🔄 Switching from ${actualPanelMode} to ${newMode} mode`);
		this.switchMode(newMode);
	}

	/**
	 * Highlight a specific line in the current display
	 */
	highlightLine(lineNumber) {
		if (!this.currentPanel) {
			console.warn("Cannot highlight line - file not displayed in any panel");
			return;
		}

		this.currentPanel.highlightLine(lineNumber);

		// Notify listeners
		this.notifyListeners({
			type: "lineHighlighted",
			fileView: this,
			lineNumber,
		});
	}

	/**
	 * Request refresh from server
	 */
	refresh() {
		console.log(`🔄 Requesting refresh for: ${this.fileIdentity.getKey()}`);
		this.webSocketManager.refreshFile(this.fileIdentity);
	}

	/**
	 * Add listener for file view events
	 */
	addUpdateListener(callback) {
		this.updateListeners.add(callback);
	}

	/**
	 * Remove listener for file view events
	 */
	removeUpdateListener(callback) {
		this.updateListeners.delete(callback);
	}

	/**
	 * Notify all listeners of events
	 */
	notifyListeners(event) {
		for (const callback of this.updateListeners) {
			try {
				callback(event);
			} catch (error) {
				console.error("Error in FileView listener:", error);
			}
		}
	}

	/**
	 * Get file info for UI display
	 */
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

	/**
	 * Get file identity
	 */
	getFileIdentity() {
		return this.fileIdentity;
	}

	/**
	 * Get file model
	 */
	getFileModel() {
		return this.fileModel;
	}

	/**
	 * Get current mode
	 */
	getCurrentMode() {
		return this.currentMode;
	}

	/**
	 * Check if file has meaningful diff content
	 */
	hasDiff() {
		return this.fileModel.hasDiff();
	}

	/**
	 * Check if file has error
	 */
	hasError() {
		return !!this.fileModel.error;
	}

	/**
	 * Get error message if any
	 */
	getError() {
		return this.fileModel.error;
	}

	/**
	 * Hide from current panel
	 */
	hide() {
		if (this.currentPanel) {
			// Save current view state before hiding
			this.currentPanel.saveCurrentViewState();
		}

		this.currentPanel = null;

		console.log(`👁️ FileView ${this.fileIdentity.getKey()} hidden`);
	}

	/**
	 * Dispose this file view and cleanup
	 */
	dispose() {
		console.log(`🗑️ Disposing FileView: ${this.fileIdentity.getKey()}`);

		// Hide from panel
		this.hide();

		// Unsubscribe from WebSocket
		this.webSocketManager.unsubscribe(this.fileIdentity);

		// Dispose file model
		this.fileModel.dispose();

		// Clear listeners
		this.updateListeners.clear();

		// Clear references
		this.currentPanel = null;
		this.fileModel = null;
		this.webSocketManager = null;
	}
}
