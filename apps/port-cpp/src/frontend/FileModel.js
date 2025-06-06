/**
 * Represents a file with its Monaco models and view states
 * Each FileModel corresponds to a specific file+branch combination
 */
class FileModel {
	constructor(fileIdentity, content = "", diff = "", originalContent = "", modifiedContent = "") {
		this.identity = fileIdentity;
		this.filepath = fileIdentity.filepath; // Convenience accessor

		// File content and diff
		this.content = content;
		this.diff = diff;
		this.originalContent = originalContent;
		this.modifiedContent = modifiedContent;
		this.error = null;

		// Create Monaco models with unique URIs
		this.createModels();

		// View states for different editor modes
		this.contentViewState = null;
		this.diffViewState = null;
		this.fullDiffViewState = null;

		// Highlight decorations
		this.highlightDecorations = [];
	}

	/**
	 * Create Monaco models for this file
	 */
	createModels() {
		const language = this.inferLanguage();
		const baseUri = this.identity.getKey();

		// Content model for regular editor
		this.contentModel = monaco.editor.createModel(
			this.content,
			language,
			monaco.Uri.parse(`file://${baseUri}#content`),
		);

		// Context-only diff models (parsed from unified diff)
		const { original, modified } = this.parseDiffContent(this.diff);
		this.originalModel = monaco.editor.createModel(
			original,
			language,
			monaco.Uri.parse(`file://${baseUri}#original`),
		);
		this.modifiedModel = monaco.editor.createModel(
			modified,
			language,
			monaco.Uri.parse(`file://${baseUri}#modified`),
		);

		// Full diff models (complete file contents)
		this.fullOriginalModel = monaco.editor.createModel(
			this.originalContent || this.content,
			language,
			monaco.Uri.parse(`file://${baseUri}#fullOriginal`),
		);
		this.fullModifiedModel = monaco.editor.createModel(
			this.modifiedContent || this.content,
			language,
			monaco.Uri.parse(`file://${baseUri}#fullModified`),
		);

		console.log(`✅ Created Monaco models for: ${baseUri}`);
	}

	/**
	 * Update file content and refresh models
	 */
	updateContent(content, diff = null, originalContent = null, modifiedContent = null, error = null) {
		this.content = content;
		this.error = error;

		if (diff !== null) {
			this.diff = diff;
		}
		if (originalContent !== null) {
			this.originalContent = originalContent;
		}
		if (modifiedContent !== null) {
			this.modifiedContent = modifiedContent;
		}

		// Update content model
		if (this.contentModel && !error) {
			this.contentModel.setValue(content);
		}

		// Update context diff models if diff provided
		if (diff !== null && this.originalModel && this.modifiedModel) {
			const { original, modified } = this.parseDiffContent(diff);
			this.originalModel.setValue(original);
			this.modifiedModel.setValue(modified);
		}

		// Update full diff models if full content provided
		if (originalContent !== null && this.fullOriginalModel) {
			this.fullOriginalModel.setValue(originalContent);
		}
		if (modifiedContent !== null && this.fullModifiedModel) {
			this.fullModifiedModel.setValue(modifiedContent);
		}
	}

	/**
	 * Parse unified diff format into original and modified content
	 */
	parseDiffContent(diff) {
		if (!diff || diff.trim() === "") {
			// Empty diff - both sides are the same
			return {
				original: this.content || "",
				modified: this.content || "",
			};
		}

		const lines = diff.split("\n");
		let original = [];
		let modified = [];

		for (const line of lines) {
			if (line.startsWith("@@")) {
				// Skip diff headers
				continue;
			} else if (
				line.startsWith("diff --git") ||
				line.startsWith("index ") ||
				line.startsWith("---") ||
				line.startsWith("+++")
			) {
				// Skip git diff metadata lines
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

	/**
	 * Infer Monaco language from file path
	 */
	inferLanguage() {
		if (!this.filepath) return "text";

		const ext = this.filepath.toLowerCase().split(".").pop();
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
	 * Check if this model has meaningful diff content
	 */
	hasDiff() {
		return this.diff && this.diff.trim() !== "";
	}

	/**
	 * Dispose all Monaco models to free memory
	 */
	dispose() {
		if (this.contentModel) {
			this.contentModel.dispose();
		}
		if (this.originalModel) {
			this.originalModel.dispose();
		}
		if (this.modifiedModel) {
			this.modifiedModel.dispose();
		}
		if (this.fullOriginalModel) {
			this.fullOriginalModel.dispose();
		}
		if (this.fullModifiedModel) {
			this.fullModifiedModel.dispose();
		}
	}
}
