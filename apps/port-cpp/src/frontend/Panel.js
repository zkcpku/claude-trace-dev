/**
 * Panel class that manages content/diff editor switching
 * Simple approach: two permanent containers, show/hide them
 */
class Panel {
	constructor(containerId) {
		this.containerId = containerId;
		this.container = document.getElementById(containerId);

		if (!this.container) {
			throw new Error(`Container with id '${containerId}' not found`);
		}

		console.log(`📋 Panel created for container: ${containerId}`);

		// Current state
		this.currentFileModel = null;
		this.currentMode = null; // 'content' or 'diff'

		// Create permanent DOM structure
		this.setupDOM();

		// Create Monaco editors immediately
		this.createEditors();
	}

	/**
	 * Setup permanent DOM structure
	 */
	setupDOM() {
		this.container.innerHTML = `
            <div class="content-editor-container" style="width: 100%; height: 100%; display: none;"></div>
            <div class="diff-editor-container" style="width: 100%; height: 100%; display: none;"></div>
            <div class="message-container" style="width: 100%; height: 100%; display: none; align-items: center; justify-content: center;"></div>
        `;

		this.contentContainer = this.container.querySelector(".content-editor-container");
		this.diffContainer = this.container.querySelector(".diff-editor-container");
		this.messageContainer = this.container.querySelector(".message-container");
	}

	/**
	 * Create both Monaco editors immediately
	 */
	createEditors() {
		const commonOptions = {
			theme: "custom-dark",
			readOnly: true,
			automaticLayout: true,
			scrollBeyondLastLine: false,
			minimap: { enabled: false },
			renderWhitespace: "selection",
		};

		// Create content editor
		this.contentEditor = monaco.editor.create(this.contentContainer, {
			...commonOptions,
			value: "",
			language: "text",
		});

		// Create diff editor
		this.diffEditor = monaco.editor.createDiffEditor(this.diffContainer, {
			...commonOptions,
			renderSideBySide: true,
			ignoreTrimWhitespace: false,
		});

		console.log(`✅ Panel ${this.containerId} editors created`);
	}

	/**
	 * Show file in content mode
	 */
	showContent(fileModel) {
		// Save current view state before switching
		this.saveCurrentViewState();

		// Switch to content mode
		if (this.currentMode !== "content") {
			this.diffContainer.style.display = "none";
			this.messageContainer.style.display = "none";
			this.contentContainer.style.display = "block";
			this.currentMode = "content";
		}

		// Set model and restore view state
		if (fileModel && fileModel.contentModel) {
			this.contentEditor.setModel(fileModel.contentModel);

			// Restore saved view state after a brief delay for layout
			setTimeout(() => {
				if (fileModel.contentViewState) {
					this.contentEditor.restoreViewState(fileModel.contentViewState);
					console.log(`🔄 Restored content view state for: ${fileModel.identity.getKey()}`);
				}
			}, 200);
		}

		this.currentFileModel = fileModel;
		console.log(`📄 Panel ${this.containerId} showing content for: ${fileModel?.identity.getKey()}`);
	}

	/**
	 * Show file in diff mode
	 */
	showDiff(fileModel) {
		// Save current view state before switching
		this.saveCurrentViewState();

		// Check if we have meaningful diff content
		if (!fileModel || !fileModel.hasDiff()) {
			this.showNoDiff();
			return;
		}

		// Switch to diff mode
		if (this.currentMode !== "diff") {
			this.contentContainer.style.display = "none";
			this.messageContainer.style.display = "none";
			this.diffContainer.style.display = "block";
			this.currentMode = "diff";
		}

		// Set models and restore view state
		if (fileModel && fileModel.originalModel && fileModel.modifiedModel) {
			this.diffEditor.setModel({
				original: fileModel.originalModel,
				modified: fileModel.modifiedModel,
			});

			// Restore saved view state after diff calculation
			const restoreViewState = () => {
				if (fileModel.diffViewState) {
					this.diffEditor.restoreViewState(fileModel.diffViewState);
				}
			};

			// Listen for diff update to know when to restore view state
			const disposable = this.diffEditor.onDidUpdateDiff(() => {
				restoreViewState();
				disposable.dispose();
			});

			// Also try after a timeout in case the event doesn't fire
			setTimeout(() => {
				restoreViewState();
				if (fileModel.diffViewState) {
					console.log(`🔄 Restored diff view state for: ${fileModel.identity.getKey()}`);
				}
			}, 200);
		}

		this.currentFileModel = fileModel;
		console.log(`🔄 Panel ${this.containerId} showing diff for: ${fileModel?.identity.getKey()}`);
	}

	/**
	 * Show "no changes" message when diff is empty
	 */
	showNoDiff() {
		// Hide editor containers and show message
		this.contentContainer.style.display = "none";
		this.diffContainer.style.display = "none";

		this.messageContainer.innerHTML = `
            <div class="no-changes">
                <div class="no-changes-icon">📄</div>
                <div class="no-changes-title">No Changes</div>
                <div class="no-changes-message">There are no differences to display between the selected versions.</div>
            </div>
        `;
		this.messageContainer.style.display = "flex";

		this.currentMode = "no-diff";
		console.log(`📄 Panel ${this.containerId} showing no changes message`);
	}

	/**
	 * Show error message
	 */
	showError(error) {
		// Hide editor containers and show message
		this.contentContainer.style.display = "none";
		this.diffContainer.style.display = "none";

		this.messageContainer.innerHTML = `
            <div class="error">
                <div class="error-title">Error</div>
                <div class="error-message">${error || "An unknown error occurred"}</div>
            </div>
        `;
		this.messageContainer.style.display = "flex";

		this.currentMode = "error";
		console.log(`❌ Panel ${this.containerId} showing error: ${error}`);
	}

	/**
	 * Show empty state
	 */
	showEmpty(message = "No file selected") {
		// Hide editor containers and show message
		this.contentContainer.style.display = "none";
		this.diffContainer.style.display = "none";

		this.messageContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-message">${message}</div>
            </div>
        `;
		this.messageContainer.style.display = "flex";

		this.currentMode = "empty";
	}

	/**
	 * Save current view state to the file model
	 */
	saveCurrentViewState() {
		if (!this.currentFileModel) return;

		try {
			if (this.currentMode === "content" && this.contentEditor) {
				const viewState = this.contentEditor.saveViewState();
				this.currentFileModel.contentViewState = viewState;
				console.log(`💾 Saved content view state for: ${this.currentFileModel.identity.getKey()}`);
			} else if (this.currentMode === "diff" && this.diffEditor) {
				const viewState = this.diffEditor.saveViewState();
				this.currentFileModel.diffViewState = viewState;
				console.log(`💾 Saved diff view state for: ${this.currentFileModel.identity.getKey()}`);
			}
		} catch (error) {
			console.error("Failed to save view state:", error);
		}
	}

	/**
	 * Force layout of current editor (call after container resize)
	 */
	layout() {
		if (this.contentEditor) {
			this.contentEditor.layout();
		}
		if (this.diffEditor) {
			this.diffEditor.layout();
		}
	}

	/**
	 * Highlight a specific line in the current editor
	 */
	highlightLine(lineNumber) {
		const currentEditor = this.currentMode === "diff" ? this.diffEditor : this.contentEditor;

		if (!currentEditor || !this.currentFileModel) {
			console.warn("Cannot highlight line - no active editor");
			return;
		}

		// Clear existing decorations
		if (this.currentFileModel.highlightDecorations) {
			if (this.currentMode === "diff") {
				// For diff editor, clear decorations from modified model
				const model = this.diffEditor.getModel();
				if (model && model.modified) {
					model.modified.deltaDecorations(this.currentFileModel.highlightDecorations, []);
				}
			} else {
				// For content editor
				currentEditor.deltaDecorations(this.currentFileModel.highlightDecorations, []);
			}
		}

		// Create highlight decoration
		const decoration = {
			range: new monaco.Range(lineNumber, 1, lineNumber, 1),
			options: {
				isWholeLine: true,
				className: "highlighted-line",
				overviewRuler: {
					color: "#ffd700",
					position: monaco.editor.OverviewRulerLane.Full,
				},
				minimap: {
					color: "#ffd700",
					position: monaco.editor.MinimapPosition.Inline,
				},
			},
		};

		// Apply decoration based on editor type
		if (this.currentMode === "diff") {
			// For diff editor, highlight in modified (right) side
			const model = this.diffEditor.getModel();
			if (model && model.modified) {
				this.currentFileModel.highlightDecorations = model.modified.deltaDecorations([], [decoration]);
			}
		} else {
			// For content editor
			this.currentFileModel.highlightDecorations = currentEditor.deltaDecorations([], [decoration]);
		}

		// Scroll to the line
		currentEditor.revealLineInCenter(lineNumber);

		console.log(`🎯 Highlighted line ${lineNumber} in panel ${this.containerId}`);
	}

	/**
	 * Get current mode
	 */
	getCurrentMode() {
		return this.currentMode;
	}

	/**
	 * Get current file model
	 */
	getCurrentFileModel() {
		return this.currentFileModel;
	}

	/**
	 * Dispose panel and cleanup
	 */
	dispose() {
		// Save current view state
		this.saveCurrentViewState();

		// Dispose editors
		if (this.contentEditor) {
			this.contentEditor.dispose();
		}
		if (this.diffEditor) {
			this.diffEditor.dispose();
		}

		// Clear container
		this.container.innerHTML = "";

		console.log(`🗑️ Panel ${this.containerId} disposed`);
	}
}
