import logger from "./logger.js";

// File model with Monaco editors for content, diff, and full diff modes
export default class FileModel {
	constructor(fileIdentity, content = "", diff = "", originalContent = "", modifiedContent = "") {
		this.identity = fileIdentity;
		this.filepath = fileIdentity.filepath;
		this.content = content;
		this.diff = diff;
		this.originalContent = originalContent;
		this.modifiedContent = modifiedContent;
		this.error = null;
		this.contentViewState = null;
		this.fullDiffViewState = null;
		this.highlightDecorations = [];
		this.createModels();
	}

	// Create all Monaco editor models for content, diff, and full diff modes
	createModels() {
		const language = this.inferLanguage();
		const baseUri = this.identity.getKey();
		const { original, modified } = this.parseDiffContent(this.diff);

		this.contentModel = monaco.editor.createModel(
			this.content,
			language,
			monaco.Uri.parse(`file://${baseUri}#content`),
		);
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

		logger.log(`✅ Created Monaco models for: ${baseUri}`);
	}

	// Update file content and refresh all Monaco models
	updateContent(content, diff = null, originalContent = null, modifiedContent = null, error = null) {
		this.content = content;
		this.error = error;
		if (diff !== null) this.diff = diff;
		if (originalContent !== null) this.originalContent = originalContent;
		if (modifiedContent !== null) this.modifiedContent = modifiedContent;

		if (this.contentModel && !error) this.contentModel.setValue(content);

		if (diff !== null && this.originalModel && this.modifiedModel) {
			const { original, modified } = this.parseDiffContent(diff);
			this.originalModel.setValue(original);
			this.modifiedModel.setValue(modified);
		}

		if (originalContent !== null && this.fullOriginalModel) this.fullOriginalModel.setValue(originalContent);
		if (modifiedContent !== null && this.fullModifiedModel) this.fullModifiedModel.setValue(modifiedContent);
	}

	// Parse unified diff format into original and modified content for context diff mode
	parseDiffContent(diff) {
		if (!diff?.trim()) return { original: this.content || "", modified: this.content || "" };

		const lines = diff.split("\n");
		const original = [],
			modified = [];

		for (const line of lines) {
			if (
				line.startsWith("@@") ||
				line.startsWith("diff --git") ||
				line.startsWith("index ") ||
				line.startsWith("--") ||
				line.startsWith("++")
			) {
				continue;
			} else if (line.startsWith("-")) {
				original.push(line.substring(1));
			} else if (line.startsWith("+")) {
				modified.push(line.substring(1));
			} else {
				const content = line.startsWith(" ") ? line.substring(1) : line;
				original.push(content);
				modified.push(content);
			}
		}

		return { original: original.join("\n"), modified: modified.join("\n") };
	}

	// Infer Monaco language from file extension
	inferLanguage() {
		if (!this.filepath) return "text";
		const ext = this.filepath.toLowerCase().split(".").pop();
		const map = {
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
			hx: "javascript",
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
		return map[ext] || "text";
	}

	// Check if this model has meaningful diff content
	hasDiff() {
		return this.diff?.trim() !== "";
	}

	// Dispose all Monaco models to free memory
	dispose() {
		[
			this.contentModel,
			this.originalModel,
			this.modifiedModel,
			this.fullOriginalModel,
			this.fullModifiedModel,
		].forEach((model) => model?.dispose());
	}
}
