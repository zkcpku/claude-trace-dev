import process, { stdout } from "process";

// Debug logging to file
import { writeFileSync, appendFileSync } from "fs";
const logFile = "/tmp/tui-debug.log";
function debugLog(message: string) {
	try {
		appendFileSync(logFile, `${new Date().toISOString()}: ${message}\n`);
	} catch (e) {
		// Ignore if can't write to /tmp
	}
}

// Clear log file on startup
try {
	writeFileSync(logFile, `=== TUI Debug Log Started ===\n`);
} catch (e) {
	// Ignore if can't write to /tmp
}

export interface RenderResult {
	keepLines: number; // Keep first N lines unchanged
	newLines: string[]; // New/changed lines to append/replace
}

export interface Component {
	render(width: number): RenderResult;
	handleInput?(keyData: string): void;
}

export class DifferentialTUI {
	private components: Component[] = [];
	private componentTotalLines: number[] = []; // Track total lines for each component
	private focusedIndex: number = -1;
	private needsRender: boolean = false;
	private wasRaw: boolean = false;
	private totalLines: number = 0;
	private isFirstRender: boolean = true;

	constructor() {
		this.handleResize = this.handleResize.bind(this);
		this.handleKeypress = this.handleKeypress.bind(this);
	}

	addComponent(component: Component): void {
		this.components.push(component);
		this.componentTotalLines.push(0);

		// Initial render
		this.requestRender();
	}

	setFocus(index: number): void {
		if (index >= 0 && index < this.components.length) {
			this.focusedIndex = index;
		}
	}

	requestRender(): void {
		this.needsRender = true;
		// Batch renders on next tick
		process.nextTick(() => {
			if (this.needsRender) {
				this.render();
				this.needsRender = false;
			}
		});
	}

	start(): void {
		debugLog("TUI start() called");

		// Set up raw mode for key capture
		try {
			this.wasRaw = process.stdin.isRaw || false;
			if (process.stdin.setRawMode) {
				process.stdin.setRawMode(true);
			}
			process.stdin.setEncoding("utf8");
			process.stdin.resume();

			// Listen for events
			process.stdout.on("resize", this.handleResize);
			process.stdin.on("data", this.handleKeypress);

			debugLog("Raw mode and listeners set up");
		} catch (error) {
			debugLog(`Error setting up raw mode: ${error}`);
		}

		// Initial render
		debugLog("Calling initial render");
		this.render();
	}

	stop(): void {
		debugLog("TUI stop() called");
		process.stdin.removeListener("data", this.handleKeypress);
		process.stdout.removeListener("resize", this.handleResize);
		if (process.stdin.setRawMode) {
			process.stdin.setRawMode(this.wasRaw);
		}
	}

	private render(): void {
		const termWidth = process.stdout.columns || 80;

		let totalKeepLines = 0;
		const newLines: string[] = [];
		let foundChange = false;

		debugLog(`Render called. Components: ${this.components.length}`);

		for (let i = 0; i < this.components.length; i++) {
			const component = this.components[i];
			if (!component) continue;

			const result = component.render(termWidth);
			const newTotalLines = result.keepLines + result.newLines.length;
			const oldTotalLines = this.componentTotalLines[i];

			debugLog(
				`Component ${i}: keepLines=${result.keepLines}, newLines=${result.newLines.length}, oldTotal=${oldTotalLines}, newTotal=${newTotalLines}`,
			);

			if (!foundChange) {
				// Check if this component changed
				if (newTotalLines !== oldTotalLines || result.keepLines === 0) {
					// Component changed OR requested forced re-render - cascade re-render from here
					foundChange = true;
					totalKeepLines += result.keepLines;
					newLines.push(...result.newLines);
					debugLog(
						`First changed component: ${i}, totalKeepLines: ${totalKeepLines} (${result.keepLines === 0 ? "forced re-render" : "size changed"})`,
					);
				} else {
					// Component unchanged - keep all its lines
					totalKeepLines += oldTotalLines;
				}
			} else {
				// Already cascading - must re-render this component completely
				newLines.push(...result.newLines);
			}

			// Update tracked total for this component
			this.componentTotalLines[i] = newTotalLines;
		}

		if (!foundChange) {
			// Nothing changed
			debugLog("No changes detected, skipping render");
			return;
		}

		debugLog(`Keeping ${totalKeepLines} lines, adding ${newLines.length} new lines`);

		// Handle cursor positioning
		if (this.isFirstRender) {
			// First render: just append to current terminal position
			debugLog("First render - appending to terminal");
			this.isFirstRender = false;
		} else {
			// Move cursor up to where changes start and clear down
			const changingLines = this.totalLines - totalKeepLines;
			if (changingLines > 0) {
				debugLog(
					`Moving up ${changingLines} lines and clearing (totalLines=${this.totalLines}, keeping=${totalKeepLines})`,
				);
				stdout.write(`\x1b[${changingLines}A\x1b[0J`);
			}
		}

		// Output all new lines
		for (const line of newLines) {
			console.log(line);
		}

		const newTotalLines = totalKeepLines + newLines.length;
		debugLog(`Updated totalLines from ${this.totalLines} to ${newTotalLines}`);
		this.totalLines = newTotalLines;
	}

	private handleResize(): void {
		// Terminal size changed - force re-render all
		this.renderAll();
	}

	private renderAll(): void {
		// Force re-render everything (preserve terminal history)
		// Move up to start of our content and clear down
		if (this.totalLines > 0) {
			stdout.write(`\x1b[${this.totalLines}A\x1b[0J`);
		}
		this.totalLines = 0;
		this.isFirstRender = false; // Not first render since we already have content

		// Reset all component line counts to force full re-render
		this.componentTotalLines.fill(0);

		this.render();
	}

	private handleKeypress(data: string): void {
		// Handle Ctrl+C at TUI level
		if (data.charCodeAt(0) === 3) {
			this.stop();
			process.exit(0);
		}

		// Send input to focused component
		if (this.focusedIndex >= 0 && this.focusedIndex < this.components.length) {
			const component = this.components[this.focusedIndex];
			if (component && component.handleInput) {
				component.handleInput(data);
				// Trigger re-render after input
				this.requestRender();
			}
		}
	}
}

// Container component that manages child components
export class Container implements Component {
	private children: Component[] = [];
	private childTotalLines: number[] = []; // Track total lines (keepLines + newLines) for each child

	addChild(component: Component): void {
		this.children.push(component);
		this.childTotalLines.push(0);
	}

	render(width: number): RenderResult {
		let totalKeepLines = 0;
		const newLines: string[] = [];
		let foundChange = false;

		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];
			if (!child) continue;

			const result = child.render(width);
			const newTotalLines = result.keepLines + result.newLines.length;
			const oldTotalLines = this.childTotalLines[i];

			if (!foundChange) {
				// Check if this child changed
				if (newTotalLines !== oldTotalLines) {
					// Child changed - cascade re-render from here
					foundChange = true;
					totalKeepLines += result.keepLines;
					newLines.push(...result.newLines);
				} else {
					// Child unchanged - keep all its lines
					totalKeepLines += oldTotalLines;
				}
			} else {
				// Already cascading - must re-render this child completely
				newLines.push(...result.newLines);
			}

			// Update tracked total for this child
			this.childTotalLines[i] = newTotalLines;
		}

		return {
			keepLines: totalKeepLines,
			newLines: newLines,
		};
	}

	// Get child for external manipulation
	getChild(index: number): Component | undefined {
		return this.children[index];
	}

	// Get number of children
	getChildCount(): number {
		return this.children.length;
	}
}
