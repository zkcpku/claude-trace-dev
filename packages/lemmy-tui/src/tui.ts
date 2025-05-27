import process, { stdout } from "process";
import { logger } from "./logger.js";

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

export interface ContainerInterface {
	render(width: number): ContainerRenderResult;
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

// Shared differential rendering logic for containers
function renderChildren(
	children: (Component | ContainerInterface)[],
	termWidth: number,
	previousTotalLines: number[],
	componentName: string,
): { unchangedLines: number; newLines: string[]; newTotalLines: number[] } {
	let unchangedLines = 0;
	const newLines: string[] = [];
	const newTotalLines: number[] = [];
	let firstChangeIndex = -1;

	// Find first changed component/container
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;

		const result = child.render(termWidth);
		const currentTotalLines = result.lines.length;
		const oldTotalLines = previousTotalLines[i] || 0;

		logger.render(`${componentName}-Child-${i}`, {
			childType: child.constructor.name,
			result: {
				lines: result.lines,
				changed: result.changed,
				...("keepLines" in result ? { keepLines: result.keepLines } : {}),
			},
			currentTotalLines,
			oldTotalLines,
		});

		newTotalLines[i] = currentTotalLines;

		if (firstChangeIndex === -1) {
			// Still looking for first change
			if (result.changed) {
				// Found first change - start re-rendering from here
				firstChangeIndex = i;
				newLines.push(...result.lines);
			} else {
				// Child unchanged - count its lines as unchanged
				unchangedLines += oldTotalLines;
			}
		} else {
			// Already past first change - re-render everything
			newLines.push(...result.lines);
		}
	}

	return { unchangedLines, newLines, newTotalLines };
}

export class TUI implements ContainerInterface {
	private components: Component[] = [];
	private componentTotalLines: number[] = []; // Track total lines for each component
	private focusedComponent: Component | null = null;
	private needsRender: boolean = false;
	private wasRaw: boolean = false;
	private totalLines: number = 0;
	private isFirstRender: boolean = true;
	private isStarted: boolean = false;

	constructor() {
		this.handleResize = this.handleResize.bind(this);
		this.handleKeypress = this.handleKeypress.bind(this);
		logger.componentLifecycle("TUI", "created");
	}

	configureLogging(config: Parameters<typeof logger.configure>[0]): void {
		logger.configure(config);
		logger.info("TUI", "Logging configured", config);
	}

	addComponent(component: Component): void {
		this.components.push(component);
		this.componentTotalLines.push(0);

		// Set parent TUI reference for containers
		if (component instanceof Container) {
			component.setParentTui(this);
		}

		// Only auto-render if TUI has been started
		if (this.isStarted) {
			this.renderAll();
		}
	}

	removeComponent(component: Component): void {
		// First check if it's a direct child
		const index = this.components.indexOf(component);
		if (index >= 0) {
			// Replace with sentinel instead of splicing to maintain array structure
			this.components[index] = new SentinelComponent();
			// Keep the componentTotalLines entry - sentinel will update it to 0

			// Clear parent TUI reference for containers
			if (component instanceof Container) {
				component.setParentTui(undefined);
			}

			// Clear focus if this was the focused component
			if (this.focusedComponent === component) {
				this.focusedComponent = null;
			}

			// Use normal render - sentinel will trigger cascade naturally
			this.requestRender();
			return;
		}

		// Recursively search in containers
		for (const comp of this.components) {
			if (comp instanceof Container) {
				if (this.removeFromContainer(comp, component)) {
					// Clear focus if this was the focused component
					if (this.focusedComponent === component) {
						this.focusedComponent = null;
					}

					// Force full re-render to clear deleted content from screen
					this.renderAll();
					return;
				}
			}
		}
	}

	private removeFromContainer(container: Container, component: Component): boolean {
		// Check if component is a direct child of this container
		const childCount = container.getChildCount();
		for (let i = 0; i < childCount; i++) {
			const child = container.getChild(i);
			if (child === component) {
				container.removeChild(component);
				return true;
			}
		}

		// Recursively search in nested containers
		for (let i = 0; i < childCount; i++) {
			const child = container.getChild(i);
			if (child instanceof Container) {
				if (this.removeFromContainer(child, component)) {
					return true;
				}
			}
		}

		return false;
	}

	setFocus(component: Component): void {
		// Check if component exists anywhere in the hierarchy
		if (this.findComponent(component)) {
			this.focusedComponent = component;
		}
	}

	private findComponent(component: Component): boolean {
		// Check direct children
		if (this.components.includes(component)) {
			return true;
		}

		// Recursively search in containers
		for (const comp of this.components) {
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

	render(width: number): ContainerRenderResult {
		const renderResult = renderChildren(this.components, width, this.componentTotalLines, "TUI");

		// Update our tracking
		this.componentTotalLines = renderResult.newTotalLines;

		// Determine if we changed
		const newTotalLines = renderResult.unchangedLines + renderResult.newLines.length;
		const changed = newTotalLines !== this.totalLines || renderResult.newLines.length > 0;

		return {
			lines: renderResult.newLines,
			changed,
			keepLines: renderResult.unchangedLines,
		};
	}

	private renderToScreen(): void {
		const termWidth = process.stdout.columns || 80;

		logger.debug("TUI", "Starting render cycle", {
			termWidth,
			componentCount: this.components.length,
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
		}

		// Output all new lines
		for (const line of result.lines) {
			console.log(line);
		}

		const newTotalLines = result.keepLines + result.lines.length;
		this.totalLines = newTotalLines;
	}

	private handleResize(): void {
		// Terminal size changed - force re-render all
		this.renderAll();
	}

	renderAll(): void {
		// Force re-render everything (preserve terminal history)
		// Move up to start of our content and clear down
		if (this.totalLines > 0) {
			stdout.write(`\x1b[${this.totalLines}A\x1b[0J`);
		}
		this.totalLines = 0;
		this.isFirstRender = false; // Not first render since we already have content

		// Reset all component line counts to force full re-render
		this.componentTotalLines.fill(0);

		this.renderToScreen();
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

// Container component that manages child components
export class Container implements ContainerInterface {
	private children: (Component | ContainerInterface)[] = [];
	private childTotalLines: number[] = []; // Track total lines for each child
	private parentTui: TUI | undefined; // Reference to parent TUI for triggering re-renders

	constructor(parentTui?: TUI | undefined) {
		this.parentTui = parentTui;
	}

	setParentTui(tui: TUI | undefined): void {
		this.parentTui = tui;
	}

	addChild(component: Component | ContainerInterface): void {
		this.children.push(component);
		this.childTotalLines.push(0);

		// Set parent TUI reference for nested containers
		if (component instanceof Container && this.parentTui) {
			component.setParentTui(this.parentTui);
		}

		// Note: Manual re-render via ui.requestRender() is preferred for now
		// to avoid interference with TUI's rendering cycle
	}

	removeChild(component: Component): void {
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
		}
	}

	render(width: number): ContainerRenderResult {
		const renderResult = renderChildren(this.children, width, this.childTotalLines, "Container");

		// Update our tracking
		this.childTotalLines = renderResult.newTotalLines;

		// Build full lines array by rendering all children
		const fullLines: string[] = [];
		for (const child of this.children) {
			if (child) {
				const childResult = child.render(width);
				fullLines.push(...childResult.lines);
			}
		}

		// Determine if we changed
		const changed = renderResult.newLines.length > 0;

		return {
			lines: fullLines,
			changed,
			keepLines: renderResult.unchangedLines,
		};
	}

	// Get child for external manipulation
	getChild(index: number): Component | ContainerInterface | undefined {
		return this.children[index];
	}

	// Get number of children
	getChildCount(): number {
		return this.children.length;
	}
}
