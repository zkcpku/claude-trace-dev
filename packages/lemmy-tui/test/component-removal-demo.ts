#!/usr/bin/env node

import { TUI, Container, TextComponent, TextEditor, logger } from "../src/index.js";

// Enable debug logging
logger.configure({
	enabled: true,
	logFile: "tui-debug.log",
	logLevel: "debug",
});

// Create TUI manager
const ui = new TUI();

// Create components
const header = new TextComponent("🗑️ Component Removal Test - Press 'r' to remove, 'a' to add, 'c' to clear all");
const statusComponent = new TextComponent("Status: 0 components in container");

// Create a container that will hold dynamic components
const dynamicContainer = new Container(ui);

const instructionsContainer = new Container(ui);
instructionsContainer.addChild(new TextComponent("Commands:"));
instructionsContainer.addChild(new TextComponent("  • Type 'add <text>' to add a component"));
instructionsContainer.addChild(new TextComponent("  • Type 'remove <index>' to remove component at index"));
instructionsContainer.addChild(new TextComponent("  • Type 'clear' to remove all components"));
instructionsContainer.addChild(new TextComponent("  • Type 'list' to see all components"));
instructionsContainer.addChild(new TextComponent("  • Type 'exit' to quit"));

// Use a special submit trigger for command input - very unlikely to appear in real text;
const editor = new TextEditor();

// Add components to UI
ui.addChild(header);
ui.addChild(statusComponent);
ui.addChild(dynamicContainer);
ui.addChild(instructionsContainer);
ui.addChild(editor);

// Set focus to the editor
ui.setFocus(editor);

let componentCount = 0;
const components: TextComponent[] = [];

function updateStatus() {
	const newStatus = `Status: ${components.length} components in container`;
	statusComponent.setText(newStatus);
	ui.requestRender();
}

function listComponents() {
	console.log("\n📋 Current components:");
	if (components.length === 0) {
		console.log("  (none)");
	} else {
		components.forEach((comp, index) => {
			console.log(`  [${index}] ${comp.getText()}`);
		});
	}
	console.log("");
}

// Handle editor submissions
editor.onSubmit = (text: string) => {
	const trimmed = text.trim();
	if (!trimmed) return;

	const parts = trimmed.split(" ");
	const command = parts[0]?.toLowerCase() || "";

	switch (command) {
		case "add":
			const addText = parts.slice(1).join(" ") || `Component ${++componentCount}`;
			const newComponent = new TextComponent(`📦 ${addText}`);
			components.push(newComponent);
			dynamicContainer.addChild(newComponent);
			updateStatus();
			console.log(`✅ Added: "${addText}"`);
			break;

		case "remove":
			const removeIndex = parseInt(parts[1] || "0");
			if (isNaN(removeIndex) || removeIndex < 0 || removeIndex >= components.length) {
				console.log(`❌ Invalid index. Use 0-${components.length - 1}`);
			} else {
				const removedComponent = components[removeIndex];
				if (removedComponent) {
					const removedText = removedComponent.getText();

					// Remove from both our tracking array and the container
					components.splice(removeIndex, 1);
					dynamicContainer.removeChild(removedComponent);

					updateStatus();
					console.log(`🗑️ Removed [${removeIndex}]: "${removedText}"`);
				}
			}
			break;

		case "clear":
			const removedCount = components.length;

			// Remove all components from container
			components.forEach((comp) => dynamicContainer.removeChild(comp));
			components.length = 0;

			updateStatus();
			console.log(`🧹 Cleared ${removedCount} components`);
			break;

		case "list":
			listComponents();
			break;

		case "exit":
			console.log("👋 Goodbye!");
			process.exit(0);
			break;

		default:
			console.log(`❌ Unknown command: ${command}`);
			console.log("💡 Use 'add <text>', 'remove <index>', 'clear', 'list', or 'exit'");
	}
};

// Ctrl+C is handled by the TUI framework automatically

console.log("🧪 Component Removal Test App");
console.log("🎯 This demo tests adding and removing components from containers");
console.log("✨ Notice how removed components are properly cleared from the screen!");
console.log("🔧 Built with @mariozechner/lemmy-tui\n");

// Add some initial components for testing
const initialComponents = ["Initial Component 1", "Initial Component 2", "Initial Component 3"];

initialComponents.forEach((text) => {
	const comp = new TextComponent(`📦 ${text}`);
	components.push(comp);
	dynamicContainer.addChild(comp);
});

updateStatus();

// Start the UI
ui.start();
