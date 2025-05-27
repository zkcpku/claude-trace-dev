import { TUI, Component, ComponentRenderResult } from "../src/tui";
import { logger } from "../src/logger";

// Initialize logger for debugging
logger.configure({
	enabled: true,
	logLevel: "debug",
	logFile: "keeplines-debug.log",
});

class StaticComponent implements Component {
	private hasRendered = false;

	constructor(private text: string) {}

	render(width: number): ComponentRenderResult {
		if (!this.hasRendered) {
			// First render - output the content
			this.hasRendered = true;
			return {
				lines: [this.text],
				changed: true,
			};
		} else {
			// Subsequent renders - no change
			return {
				lines: [this.text],
				changed: false,
			};
		}
	}
}

class ChangingComponent implements Component {
	private counter = 0;

	render(width: number): ComponentRenderResult {
		this.counter++;
		return {
			lines: [`Component-2: Timestamp ${Date.now()} (render #${this.counter})`],
			changed: true, // Always changing
		};
	}
}

// Create test components
const component1 = new StaticComponent("Component-1: Static content");
const component2 = new ChangingComponent();
const component3 = new StaticComponent("Component-3: Static content");

// Create TUI and add components
const tui = new TUI();
tui.addComponent(component1);
tui.addComponent(component2);
tui.addComponent(component3);

logger.info("TEST", "Initial Render");
tui.start();

// Wait a bit then trigger a change
setTimeout(() => {
	logger.info("TEST", "Second Render (component-2 changed)");
	tui.requestRender();

	setTimeout(() => {
		logger.info("TEST", "Third Render (component-2 changed again)");
		tui.requestRender();

		setTimeout(() => {
			tui.stop();
			process.exit(0);
		}, 100);
	}, 100);
}, 100);
