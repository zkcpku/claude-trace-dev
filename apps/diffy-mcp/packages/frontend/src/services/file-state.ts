interface FileData {
	content: string;
	diff: string;
	originalContent?: string;
	modifiedContent?: string;
	error?: string;
}

interface FileInfo {
	absolutePath: string;
	branch?: string;
	data: FileData;
	key: string;
}

interface AppState {
	panels: [string[], string[]];
	activeTabs: [string | null, string | null];
	highlights: Map<string, { start: number; end: number }>;
	files: Map<string, FileInfo>;
}

/**
 * Service for managing file state and operations
 */
export class FileStateService {
	private state: AppState = {
		panels: [[], []],
		activeTabs: [null, null],
		highlights: new Map(),
		files: new Map(),
	};

	private generateFileKey(absolutePath: string, branch?: string): string {
		return branch ? `${absolutePath}@${branch}` : absolutePath;
	}

	private parseFileKey(key: string): { absolutePath: string; branch?: string } {
		const parts = key.split("@");
		return parts.length > 1 ? { absolutePath: parts[0], branch: parts[1] } : { absolutePath: parts[0] };
	}

	getState(): AppState {
		return this.state;
	}

	restoreState(
		panels: [string[], string[]],
		activeTabs: [string | null, string | null],
		highlights: [string, { start: number; end: number }][],
	): void {
		this.state.panels = panels;
		this.state.activeTabs = activeTabs;
		this.state.highlights = new Map(highlights);
		console.log("📦 State restored:", this.state);
	}

	openFile(absolutePath: string, panel: number, branch?: string): void {
		const key = this.generateFileKey(absolutePath, branch);

		// Add to panel if not already there
		if (!this.state.panels[panel].includes(key)) {
			this.state.panels[panel].push(key);
		}

		// Set as active tab
		this.state.activeTabs[panel] = key;

		console.log(`📂 Opened file: ${key} in panel ${panel}`);
	}

	closeFile(absolutePath: string): void {
		// Remove all variants of this file (different branches)
		const keysToRemove: string[] = [];

		for (const key of this.state.files.keys()) {
			if (key.startsWith(absolutePath)) {
				keysToRemove.push(key);
			}
		}

		// Remove from panels and update active tabs
		for (const key of keysToRemove) {
			// Remove from panels
			this.state.panels[0] = this.state.panels[0].filter((f) => f !== key);
			this.state.panels[1] = this.state.panels[1].filter((f) => f !== key);

			// Update active tabs
			if (this.state.activeTabs[0] === key) {
				this.state.activeTabs[0] = this.state.panels[0][0] || null;
			}
			if (this.state.activeTabs[1] === key) {
				this.state.activeTabs[1] = this.state.panels[1][0] || null;
			}

			// Remove from files
			this.state.files.delete(key);
		}

		// Remove highlights
		this.state.highlights.delete(absolutePath);

		console.log(`🗑️ Closed file: ${absolutePath}`);
	}

	updateFile(absolutePath: string, branch: string | undefined, data: FileData): void {
		const key = this.generateFileKey(absolutePath, branch);

		const fileInfo: FileInfo = {
			absolutePath,
			branch,
			data,
			key,
		};

		this.state.files.set(key, fileInfo);
		console.log(`📝 Updated file: ${key}`);
	}

	highlightFile(absolutePath: string, startLine: number, endLine?: number): void {
		this.state.highlights.set(absolutePath, {
			start: startLine,
			end: endLine || startLine,
		});
		console.log(`🎯 Highlighted ${absolutePath}: ${startLine}${endLine ? `-${endLine}` : ""}`);
	}

	getFile(key: string): FileInfo | undefined {
		return this.state.files.get(key);
	}

	getFilesByPanel(panel: number): FileInfo[] {
		return this.state.panels[panel]
			.map((key) => this.state.files.get(key))
			.filter((file): file is FileInfo => file !== undefined);
	}

	getActiveFile(panel: number): FileInfo | undefined {
		const activeKey = this.state.activeTabs[panel];
		return activeKey ? this.state.files.get(activeKey) : undefined;
	}

	setActiveTab(panel: number, key: string): void {
		if (this.state.panels[panel].includes(key)) {
			this.state.activeTabs[panel] = key;
			console.log(`📋 Set active tab in panel ${panel}: ${key}`);
		}
	}

	removeFileFromPanel(panel: number, key: string): void {
		const index = this.state.panels[panel].indexOf(key);
		if (index !== -1) {
			this.state.panels[panel].splice(index, 1);

			// Update active tab if this was the active one
			if (this.state.activeTabs[panel] === key) {
				this.state.activeTabs[panel] = this.state.panels[panel][0] || null;
			}

			console.log(`📋 Removed file from panel ${panel}: ${key}`);
		}
	}

	getHighlight(absolutePath: string): { start: number; end: number } | undefined {
		return this.state.highlights.get(absolutePath);
	}

	clearHighlight(absolutePath: string): void {
		this.state.highlights.delete(absolutePath);
		console.log(`🧹 Cleared highlight for: ${absolutePath}`);
	}

	getAllFiles(): FileInfo[] {
		return Array.from(this.state.files.values());
	}

	hasFiles(): boolean {
		return this.state.panels[0].length > 0 || this.state.panels[1].length > 0;
	}

	getFilename(key: string): string {
		const { absolutePath } = this.parseFileKey(key);
		return absolutePath.split("/").pop() || absolutePath;
	}

	getBranchInfo(key: string): string {
		const { branch } = this.parseFileKey(key);
		return branch ? `vs ${branch}` : "vs HEAD";
	}
}
