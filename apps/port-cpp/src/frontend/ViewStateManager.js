/**
 * Manages view state (scroll positions, cursor positions) for Monaco editors
 * Handles preservation of state when switching between content and diff modes
 */
class ViewStateManager {
	constructor() {
		this.isChangingViewMode = false;
	}

	/**
	 * Save current view state for a file
	 * @param {Object} fileData - File data object with editor and viewMode
	 */
	saveViewState(fileData) {
		if (!fileData || !fileData.editor) return;

		try {
			const viewState = fileData.editor.saveViewState();
			const editorType = fileData.viewMode === "diff" ? "diff" : "content";

			console.log(`💾 Saving ${editorType} view state:`, {
				viewMode: fileData.viewMode,
				hasViewState: !!viewState,
				viewStateType: viewState ? viewState.constructor.name : "null",
				filepath: fileData.filepath || fileData.absolutePath,
			});

			if (fileData.viewMode === "content") {
				fileData.contentViewState = viewState;
				console.log(`✅ Saved content view state for: ${fileData.filepath || fileData.absolutePath}`);
			} else {
				fileData.diffViewState = viewState;
				console.log(`✅ Saved diff view state for: ${fileData.filepath || fileData.absolutePath}`);
			}
		} catch (error) {
			console.error(`❌ Failed to save view state:`, error);
		}
	}

	/**
	 * Restore view state for a file based on current view mode
	 * @param {Object} fileData - File data object
	 * @param {boolean} isDiffMode - Whether we're in diff mode
	 */
	restoreViewState(fileData, isDiffMode) {
		if (!fileData || !fileData.editor) {
			console.log(`Cannot restore view state - missing fileData or editor`);
			return;
		}

		const viewState = isDiffMode ? fileData.diffViewState : fileData.contentViewState;
		console.log(`🔄 Attempting to restore ${isDiffMode ? "diff" : "content"} view state:`, {
			isDiffMode,
			hasViewState: !!viewState,
			viewStateKeys: viewState ? Object.keys(viewState) : null,
			filePath: fileData.filepath || fileData.absolutePath,
			editorType: isDiffMode ? "DiffEditor" : "StandaloneCodeEditor",
		});

		if (viewState) {
			try {
				console.log(`📍 View state details:`, JSON.stringify(viewState, null, 2));
				fileData.editor.restoreViewState(viewState);
				console.log(`✅ Successfully restored ${isDiffMode ? "diff" : "content"} view state`);

				// Verify the restoration worked
				setTimeout(() => {
					const currentViewState = fileData.editor.saveViewState();
					console.log(`🔍 After restoration - current view state:`, JSON.stringify(currentViewState, null, 2));
				}, 100);
			} catch (error) {
				console.error(`❌ Failed to restore view state:`, error);
			}
		} else {
			console.log(
				`⚠️ No ${isDiffMode ? "diff" : "content"} view state to restore - this is expected for first-time mode switch`,
			);
		}
	}

	/**
	 * Handle view mode change with proper state preservation
	 * @param {Object} fileData - File data object
	 * @param {string} newViewMode - New view mode ('content' or 'diff')
	 * @param {Function} recreateEditor - Function to recreate the editor
	 */
	handleViewModeChange(fileData, newViewMode, recreateEditor) {
		if (!fileData || !fileData.editor) return;

		// Set flag to prevent recursion
		this.isChangingViewMode = true;

		// Save current view state to the correct storage based on current view mode
		const currentViewState = fileData.editor.saveViewState();
		if (fileData.viewMode === "content") {
			fileData.contentViewState = currentViewState;
			console.log(`Saved content view state before switching to ${newViewMode}`);
		} else {
			fileData.diffViewState = currentViewState;
			console.log(`Saved diff view state before switching to ${newViewMode}`);
		}

		// Change the view mode
		fileData.viewMode = newViewMode;

		// Recreate editor with new mode
		recreateEditor();

		// Clear flag after editor creation
		setTimeout(() => {
			this.isChangingViewMode = false;
		}, 200);
	}

	/**
	 * Save view states for all files in both panels
	 * @param {Map} panel0Files - Panel 0 files map
	 * @param {string} activePanel0Tab - Active tab in panel 0
	 * @param {Object} panel1File - Panel 1 file object
	 */
	saveAllViewStates(panel0Files, activePanel0Tab, panel1File) {
		// Save Panel 0 view state
		if (activePanel0Tab && panel0Files.has(activePanel0Tab)) {
			const activeFile = panel0Files.get(activePanel0Tab);
			this.saveViewState(activeFile);
		}

		// Save Panel 1 view state
		if (panel1File) {
			this.saveViewState(panel1File);
		}
	}
}
