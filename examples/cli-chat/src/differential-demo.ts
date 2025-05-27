#!/usr/bin/env node

import { DifferentialTUI, Container } from "./tui-differential.js";
import { TextComponent } from "./text-differential.js";
import { TextEditor } from "./text-editor-differential.js";

// Create TUI manager
const ui = new DifferentialTUI();

// Create components
const header = new TextComponent("🚀 Differential Rendering TUI - Super Efficient!");

// Create a chat container that will hold messages
const chatContainer = new Container();

const editor = new TextEditor();

// Add components to UI
ui.addComponent(header);
ui.addComponent(chatContainer);
ui.addComponent(editor);

// Set focus to the editor (index 2)
ui.setFocus(2);

let messageCount = 0;

// Handle editor submissions
editor.onSubmit = (text: string) => {
	if (text.trim()) {
		messageCount++;

		// Create new message component and add to chat container
		const message = new TextComponent(`💬 Message ${messageCount}: ${text}`);
		chatContainer.addChild(message);

		// This will trigger differential rendering:
		// - Header: unchanged (keepLines: 1, newLines: [])
		// - Chat: new message (keepLines: oldMessageCount*2, newLines: [new message lines])
		// - Editor: reset to empty (keepLines: 0, newLines: [empty editor])
		ui.requestRender();
	}
};

// Ctrl+C is handled by the TUI framework automatically

console.log("🎯 Differential Rendering Demo:");
console.log("📊 As you add messages, watch the debug output!");
console.log("✨ Only NEW message content gets rendered - previous messages stay untouched!");
console.log("⚡ The more messages you have, the more efficient it becomes!\n");

// Start the UI
ui.start();
