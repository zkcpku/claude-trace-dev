import process, { stdout } from "process";
import { logger } from "./logger.js";
import { appendFileSync } from "fs";

export interface ComponentRenderResult {
	lines: string[];
	changed: boolean;
}

export interface ContainerRenderResult extends ComponentRenderResult {
	keepLines: number;
}

export interface Component {
	render(width: number): ComponentRenderResult;
	handleInput?(keyData: string): void;
}

// Sentinel component used to mark removed components - triggers cascade rendering
class SentinelComponent implements Component {
	render(): ComponentRenderResult {
		return {
			lines: [],
			changed: true, // Always trigger cascade
		};
	}
}

// Base Container class that manages child components
export class Container {
	protected children: Element[] = [];
	protected lines: string[] = [];
	protected parentTui: TUI | undefined; // Reference to parent TUI for triggering re-renders

	constructor(parentTui?: TUI | undefined) {
		this.parentTui = parentTui;
	}

	setParentTui(tui: TUI | undefined): void {
		this.parentTui = tui;
	}

	addChild(component: Element): void {
		this.children.push(component);

		// Set parent TUI reference for nested containers
		if (component instanceof Container && this.parentTui) {
			component.setParentTui(this.parentTui);
		}

		if (this.parentTui) {
			this.parentTui.requestRender();
		}
	}

	removeChild(component: Element): void {
		const index = this.children.indexOf(component);
		if (index >= 0) {
			// Replace with sentinel instead of splicing to maintain array structure
			this.children[index] = new SentinelComponent();
			// Keep the childTotalLines entry - sentinel will update it to 0

			// Clear parent TUI reference for nested containers
			if (component instanceof Container) {
				component.setParentTui(undefined);
			}

			// Use normal render - sentinel will trigger cascade naturally
			if (this.parentTui) {
				this.parentTui.requestRender();
			}
		} else {
			for (const child of this.children) {
				if (child instanceof Container) {
					child.removeChild(component);
				}
			}
		}
	}

	render(width: number): ContainerRenderResult {
		let keepLines = 0;
		let changed = false;
		const newLines: string[] = [];

		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];
			if (!child) continue;

			if (child instanceof Container) {
				const result = child.render(width);
				newLines.push(...result.lines);
				if (!changed && !result.changed) {
					keepLines += result.lines.length;
				} else {
					changed = true;
					keepLines += result.keepLines;
				}
			} else {
				const result = child.render(width);
				newLines.push(...result.lines);
				if (!changed && !result.changed) {
					keepLines += result.lines.length;
				} else {
					changed = true;
				}
			}
		}

		this.lines = newLines;
		return {
			lines: this.lines,
			changed,
			keepLines,
		};
	}

	// Get child for external manipulation
	getChild(index: number): Element | undefined {
		return this.children[index];
	}

	// Get number of children
	getChildCount(): number {
		return this.children.length;
	}
}

type Element = Component | Container;

export class TUI extends Container {
	private focusedComponent: Component | null = null;
	private needsRender: boolean = false;
	private wasRaw: boolean = false;
	private totalLines: number = 0;
	private isFirstRender: boolean = true;
	private isStarted: boolean = false;

	constructor() {
		super(); // No parent TUI for root
		this.handleResize = this.handleResize.bind(this);
		this.handleKeypress = this.handleKeypress.bind(this);
		logger.componentLifecycle("TUI", "created");
	}

	configureLogging(config: Parameters<typeof logger.configure>[0]): void {
		logger.configure(config);
		logger.info("TUI", "Logging configured", config);
	}

	override addChild(component: Element): void {
		// Set parent TUI reference for containers
		if (component instanceof Container) {
			component.setParentTui(this);
		}
		super.addChild(component);

		// Only auto-render if TUI has been started
		if (this.isStarted) {
			this.requestRender();
		}
	}

	override removeChild(component: Element): void {
		super.removeChild(component);
		this.requestRender();
	}

	setFocus(component: Component): void {
		// Check if component exists anywhere in the hierarchy
		if (this.findComponent(component)) {
			this.focusedComponent = component;
		}
	}

	private findComponent(component: Component): boolean {
		// Check direct children
		if (this.children.includes(component)) {
			return true;
		}

		// Recursively search in containers
		for (const comp of this.children) {
			if (comp instanceof Container) {
				if (this.findInContainer(comp, component)) {
					return true;
				}
			}
		}

		return false;
	}

	private findInContainer(container: Container, component: Component): boolean {
		const childCount = container.getChildCount();

		// Check direct children
		for (let i = 0; i < childCount; i++) {
			const child = container.getChild(i);
			if (child === component) {
				return true;
			}
		}

		// Recursively search in nested containers
		for (let i = 0; i < childCount; i++) {
			const child = container.getChild(i);
			if (child instanceof Container) {
				if (this.findInContainer(child, component)) {
					return true;
				}
			}
		}

		return false;
	}

	requestRender(): void {
		if (!this.isStarted) return;
		this.needsRender = true;
		// Batch renders on next tick
		process.nextTick(() => {
			if (this.needsRender) {
				this.renderToScreen();
				this.needsRender = false;
			}
		});
	}

	start(): void {
		// Set started flag
		this.isStarted = true;

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
		} catch (error) {
			console.error("Error setting up raw mode:", error);
		}

		// Initial render
		this.renderToScreen();
	}

	stop(): void {
		process.stdin.removeListener("data", this.handleKeypress);
		process.stdout.removeListener("resize", this.handleResize);
		if (process.stdin.setRawMode) {
			process.stdin.setRawMode(this.wasRaw);
		}
	}

	private renderToScreen(): void {
		const termWidth = process.stdout.columns || 80;

		logger.debug("TUI", "Starting render cycle", {
			termWidth,
			componentCount: this.children.length,
			isFirstRender: this.isFirstRender,
		});

		const result = this.render(termWidth);

		if (!result.changed) {
			// Nothing changed - skip render
			return;
		}

		// Handle cursor positioning
		if (this.isFirstRender) {
			// First render: just append to current terminal position
			this.isFirstRender = false;
		} else {
			// Move cursor up to start of changing content and clear down
			const linesToMoveUp = this.totalLines - result.keepLines;
			if (linesToMoveUp > 0) {
				stdout.write(`\x1b[${linesToMoveUp}A\x1b[0J`);
			}
			appendFileSync(
				"tui.log",
				`linesToMoveUp: ${linesToMoveUp}, keepLines: ${result.keepLines}, totalLines: ${this.totalLines}\n`,
			);
		}

		// Output the changing content only
		// Skip the unchanged lines since they're already on screen
		const changingLines = result.lines.slice(result.keepLines);
		appendFileSync("tui.log", `changingLines:\n${changingLines.join("\n")}\n`);
		for (const line of changingLines) {
			console.log(line);
		}

		this.totalLines = result.lines.length;
		appendFileSync("tui.log", `\n\n========================================\n\n`);
	}

	private handleResize(): void {
		// Terminal size changed - force re-render all
		this.requestRender();
	}

	private handleKeypress(data: string): void {
		logger.keyInput("TUI", data);

		// Handle Ctrl+C at TUI level
		if (data.charCodeAt(0) === 3) {
			logger.info("TUI", "Ctrl+C received, stopping TUI");
			this.stop();
			process.exit(0);
		}

		// Send input to focused component
		if (this.focusedComponent && this.focusedComponent.handleInput) {
			logger.debug("TUI", "Forwarding input to focused component", {
				componentType: this.focusedComponent.constructor.name,
			});
			this.focusedComponent.handleInput(data);
			// Trigger re-render after input
			this.requestRender();
		} else {
			logger.warn("TUI", "No focused component to handle input", {
				focusedComponent: this.focusedComponent?.constructor.name || "none",
				hasHandleInput: this.focusedComponent?.handleInput ? "yes" : "no",
			});
		}
	}
}
