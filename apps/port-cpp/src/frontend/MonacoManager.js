/**
 * Manages Monaco Editor instances and configurations
 * Handles creation, disposal, and content updates for both regular and diff editors
 */
class MonacoManager {
	constructor(viewStateManager) {
		this.viewStateManager = viewStateManager;
		this.monacoLoaded = false;
	}

	/**
	 * Initialize Monaco Editor
	 */
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
				resolve();
			});
		});
	}

	/**
	 * Create or update Monaco editor for a file
	 * @param {Object} fileData - File data object
	 * @param {string} containerId - DOM container ID
	 */
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

		// Handle empty diff case - show clear message instead of confusing regular editor
		if (fileData.viewMode === "diff" && (!fileData.diff || fileData.diff.trim() === "")) {
			container.innerHTML = `
				<div class="no-changes">
					<div class="no-changes-icon">📄</div>
					<div class="no-changes-title">No Changes</div>
					<div class="no-changes-message">There are no differences to display between the selected versions.</div>
				</div>
			`;
			// Clear any existing editor reference
			if (fileData.editor) {
				fileData.editor.dispose();
				fileData.editor = null;
			}
			return;
		}

		const language = this.inferLanguageFromPath(fileData.filepath || fileData.absolutePath);
		const isDiffMode = fileData.viewMode === "diff" && fileData.diff;

		// Dispose existing editor
		if (fileData.editor) {
			fileData.editor.dispose();
			fileData.editor = null;
		}

		// Create appropriate editor type
		if (isDiffMode) {
			this.createDiffEditor(fileData, container, language);
		} else {
			this.createRegularEditor(fileData, container, language);
		}

		// Layout and restore view state
		this.layoutAndRestoreViewState(fileData, isDiffMode);
	}

	/**
	 * Create a diff editor
	 */
	createDiffEditor(fileData, container, language) {
		fileData.editor = monaco.editor.createDiffEditor(container, {
			theme: "custom-dark",
			readOnly: true,
			automaticLayout: false,
			scrollBeyondLastLine: false,
			minimap: { enabled: false },
			renderSideBySide: true,
			ignoreTrimWhitespace: false,
			renderWhitespace: "selection",
		});

		// Parse diff content
		const { original, modified } = this.parseDiffContent(fileData.diff);
		const originalModel = monaco.editor.createModel(original, language);
		const modifiedModel = monaco.editor.createModel(modified, language);

		fileData.editor.setModel({
			original: originalModel,
			modified: modifiedModel,
		});
	}

	/**
	 * Create a regular editor
	 */
	createRegularEditor(fileData, container, language) {
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

	/**
	 * Layout editor and restore view state using proper Monaco lifecycle events
	 */
	layoutAndRestoreViewState(fileData, isDiffMode) {
		if (!fileData.editor) return;

		// For diff editors, we need to handle both original and modified models
		if (isDiffMode) {
			const diffEditor = fileData.editor;

			// Layout the editor first
			diffEditor.layout();

			// Listen for when the diff editor is fully ready
			const disposable = diffEditor.onDidUpdateDiff(() => {
				// Restore view state after diff calculation is complete
				this.viewStateManager.restoreViewState(fileData, isDiffMode);

				// Clean up the listener
				disposable.dispose();
			});

			// Check if diff is already available
			const originalEditor = diffEditor.getOriginalEditor();
			const modifiedEditor = diffEditor.getModifiedEditor();

			if (originalEditor && modifiedEditor) {
				// If editors are already available, restore immediately
				this.viewStateManager.restoreViewState(fileData, isDiffMode);
				disposable.dispose();
			}
		} else {
			// For regular editors, use a more reliable approach
			const editor = fileData.editor;

			// Layout the editor first
			editor.layout();

			// For regular editors, restore view state after a small delay
			// This ensures the editor is fully rendered
			setTimeout(() => {
				this.viewStateManager.restoreViewState(fileData, isDiffMode);
			}, 50);
		}
	}

	/**
	 * Update editor content without recreating the editor
	 */
	updateEditorContent(fileData) {
		if (!fileData.editor) return;

		// Save current view state to preserve cursor position and scroll
		const currentViewState = fileData.editor.saveViewState();
		const isDiffMode = fileData.viewMode === "diff" && fileData.diff;

		if (isDiffMode) {
			// Update diff editor content
			const { original, modified } = this.parseDiffContent(fileData.diff);
			const models = fileData.editor.getModel();
			if (models && models.original && models.modified) {
				models.original.setValue(original);
				models.modified.setValue(modified);
			}
		} else {
			// Update regular editor content
			const model = fileData.editor.getModel();
			if (model) {
				model.setValue(fileData.content || "");
			}
		}

		// Restore view state to maintain cursor position and scroll
		if (currentViewState) {
			setTimeout(() => {
				fileData.editor.restoreViewState(currentViewState);
			}, 0);
		}
	}

	/**
	 * Parse unified diff format into original and modified content
	 */
	parseDiffContent(diff) {
		const lines = diff.split("\\n");
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
			original: original.join("\\n"),
			modified: modified.join("\\n"),
		};
	}

	/**
	 * Infer Monaco language from file path
	 */
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

	/**
	 * Resize all active editors
	 */
	resizeAllEditors(panel0Files, activePanel0Tab, panel1File) {
		// Resize panel 0 active editor
		if (activePanel0Tab && panel0Files.has(activePanel0Tab)) {
			const activeFile = panel0Files.get(activePanel0Tab);
			if (activeFile && activeFile.editor) {
				activeFile.editor.layout();
			}
		}

		// Resize panel 1 editor
		if (panel1File && panel1File.editor) {
			panel1File.editor.layout();
		}
	}
}
