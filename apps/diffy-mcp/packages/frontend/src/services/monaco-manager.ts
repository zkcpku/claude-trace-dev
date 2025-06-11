declare global {
	interface Window {
		monaco: any;
		require: any;
	}
}

/**
 * Service for managing Monaco Editor instances and configuration
 */
export class MonacoService {
	private initialized = false;
	private editors = new Map<string, any>();
	private diffEditors = new Map<string, any>();

	async initialize(): Promise<void> {
		if (this.initialized) return;

		return new Promise((resolve, reject) => {
			console.log("🔧 Initializing Monaco Editor...");

			// Configure require.js for Monaco
			window.require.config({
				paths: {
					vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs",
				},
			});

			// Load Monaco Editor
			window.require(["vs/editor/editor.main"], () => {
				console.log("✅ Monaco Editor loaded");

				try {
					// Set Monaco theme to match our dark UI
					window.monaco.editor.defineTheme("diffy-dark", {
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
							"editorIndentGuide.background": "#404040",
							"editorIndentGuide.activeBackground": "#707070",
							"editor.lineHighlightBackground": "#2a2d2e",
						},
					});

					window.monaco.editor.setTheme("diffy-dark");
					console.log("✅ Monaco theme configured");

					this.initialized = true;
					resolve();
				} catch (error) {
					console.error("Failed to configure Monaco theme:", error);
					reject(error);
				}
			});
		});
	}

	createEditor(container: HTMLElement, options: any = {}): any {
		if (!this.initialized) {
			throw new Error("Monaco service not initialized");
		}

		const defaultOptions = {
			theme: "diffy-dark",
			readOnly: true,
			automaticLayout: true,
			scrollBeyondLastLine: false,
			minimap: { enabled: false },
			renderWhitespace: "selection",
			fontSize: 13,
			lineNumbers: "on",
			glyphMargin: false,
			folding: true,
			wordWrap: "off",
			renderLineHighlight: "line",
			overviewRulerBorder: false,
			hideCursorInOverviewRuler: true,
		};

		const editor = window.monaco.editor.create(container, {
			...defaultOptions,
			...options,
		});

		const editorId = this.generateId();
		this.editors.set(editorId, editor);

		console.log(`📝 Created Monaco editor: ${editorId}`);
		return { editor, id: editorId };
	}

	createDiffEditor(container: HTMLElement, options: any = {}): any {
		if (!this.initialized) {
			throw new Error("Monaco service not initialized");
		}

		const defaultOptions = {
			theme: "diffy-dark",
			readOnly: true,
			automaticLayout: true,
			renderSideBySide: true,
			ignoreTrimWhitespace: false,
			renderOverviewRuler: true,
			originalEditable: false,
			modifiedEditable: false,
		};

		const diffEditor = window.monaco.editor.createDiffEditor(container, {
			...defaultOptions,
			...options,
		});

		const editorId = this.generateId();
		this.diffEditors.set(editorId, diffEditor);

		console.log(`📝 Created Monaco diff editor: ${editorId}`);
		return { editor: diffEditor, id: editorId };
	}

	createModel(content: string, language: string, uri?: string): any {
		if (!this.initialized) {
			throw new Error("Monaco service not initialized");
		}

		const modelUri = uri ? window.monaco.Uri.parse(uri) : undefined;
		return window.monaco.editor.createModel(content, language, modelUri);
	}

	inferLanguage(filename: string): string {
		const ext = filename.toLowerCase().split(".").pop();
		const languageMap: { [key: string]: string } = {
			js: "javascript",
			jsx: "javascript",
			ts: "typescript",
			tsx: "typescript",
			java: "java",
			c: "c",
			h: "c",
			cpp: "cpp",
			cxx: "cpp",
			cc: "cpp",
			hpp: "cpp",
			hxx: "cpp",
			cs: "csharp",
			py: "python",
			rb: "ruby",
			go: "go",
			rs: "rust",
			php: "php",
			swift: "swift",
			kt: "kotlin",
			scala: "scala",
			clj: "clojure",
			hs: "haskell",
			ml: "fsharp",
			fs: "fsharp",
			dart: "dart",
			lua: "lua",
			sh: "shell",
			bash: "shell",
			zsh: "shell",
			fish: "shell",
			ps1: "powershell",
			sql: "sql",
			json: "json",
			yaml: "yaml",
			yml: "yaml",
			xml: "xml",
			html: "html",
			htm: "html",
			css: "css",
			scss: "scss",
			sass: "sass",
			less: "less",
			md: "markdown",
			markdown: "markdown",
			tex: "latex",
			r: "r",
			dockerfile: "dockerfile",
			makefile: "makefile",
			gradle: "groovy",
			groovy: "groovy",
		};

		return languageMap[ext || ""] || "text";
	}

	setEditorContent(editorId: string, content: string, language?: string): void {
		const editor = this.editors.get(editorId);
		if (!editor) {
			console.warn(`Editor not found: ${editorId}`);
			return;
		}

		const currentModel = editor.getModel();
		if (currentModel) {
			currentModel.setValue(content);
			if (language) {
				window.monaco.editor.setModelLanguage(currentModel, language);
			}
		}
	}

	setDiffEditorContent(editorId: string, original: string, modified: string, language?: string): void {
		const diffEditor = this.diffEditors.get(editorId);
		if (!diffEditor) {
			console.warn(`Diff editor not found: ${editorId}`);
			return;
		}

		const originalModel = this.createModel(original, language || "text");
		const modifiedModel = this.createModel(modified, language || "text");

		diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel,
		});
	}

	highlightLines(editorId: string, startLine: number, endLine?: number): void {
		const editor = this.editors.get(editorId);
		if (!editor) {
			console.warn(`Editor not found: ${editorId}`);
			return;
		}

		const endLineNumber = endLine || startLine;
		const decorations = [
			{
				range: new window.monaco.Range(startLine, 1, endLineNumber, 1),
				options: {
					isWholeLine: true,
					className: "highlighted-line",
					overviewRuler: {
						color: "#ffd700",
						position: 4, // OverviewRulerLane.Full
					},
					minimap: {
						color: "#ffd700",
						position: 2, // MinimapPosition.Inline
					},
				},
			},
		];

		editor.deltaDecorations([], decorations);
		editor.revealLineInCenter(startLine);
	}

	clearHighlights(editorId: string): void {
		const editor = this.editors.get(editorId);
		if (!editor) {
			console.warn(`Editor not found: ${editorId}`);
			return;
		}

		editor.deltaDecorations(
			editor
				.getModel()
				?.getAllDecorations()
				?.map((d: any) => d.id) || [],
			[],
		);
	}

	layoutEditor(editorId: string): void {
		const editor = this.editors.get(editorId) || this.diffEditors.get(editorId);
		if (editor) {
			editor.layout();
		}
	}

	layoutAllEditors(): void {
		// Layout all regular editors
		for (const editor of this.editors.values()) {
			editor.layout();
		}

		// Layout all diff editors
		for (const diffEditor of this.diffEditors.values()) {
			diffEditor.layout();
		}
	}

	disposeEditor(editorId: string): void {
		const editor = this.editors.get(editorId);
		if (editor) {
			editor.dispose();
			this.editors.delete(editorId);
			console.log(`🗑️ Disposed Monaco editor: ${editorId}`);
		}

		const diffEditor = this.diffEditors.get(editorId);
		if (diffEditor) {
			diffEditor.dispose();
			this.diffEditors.delete(editorId);
			console.log(`🗑️ Disposed Monaco diff editor: ${editorId}`);
		}
	}

	dispose(): void {
		// Dispose all editors
		for (const [id, editor] of this.editors.entries()) {
			editor.dispose();
			console.log(`🗑️ Disposed Monaco editor: ${id}`);
		}
		this.editors.clear();

		// Dispose all diff editors
		for (const [id, diffEditor] of this.diffEditors.entries()) {
			diffEditor.dispose();
			console.log(`🗑️ Disposed Monaco diff editor: ${id}`);
		}
		this.diffEditors.clear();

		this.initialized = false;
		console.log("🗑️ Monaco service disposed");
	}

	private generateId(): string {
		return `editor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	isInitialized(): boolean {
		return this.initialized;
	}
}
