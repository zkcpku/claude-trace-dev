#!/usr/bin/env node

import { TUI, Container, TextComponent, TextEditor } from "../src/index.js";

// Create TUI manager
const ui = new TUI();

// Create components
const header = new TextComponent("🚀 Differential Rendering TUI - Super Efficient!");

// Create a chat container that will hold messages
const chatContainer = new Container();

const editor = new TextEditor();

// Add components to UI
ui.addChild(header);
ui.addChild(chatContainer);
ui.addChild(editor);

// Set focus to the editor (index 2)
ui.setFocus(editor);

let messageCount = 0;

// Handle editor submissions
editor.onSubmit = (text: string) => {
	if (text.trim()) {
		messageCount++;

		// Create new message component and add to chat container
		const message = new TextComponent(`💬 Message ${messageCount}: ${text}`);
		chatContainer.addChild(message);

		// Manually trigger re-render
		ui.requestRender();
	}
};

// Ctrl+C is handled by the TUI framework automatically

console.log("🎯 Differential Rendering Demo:");
console.log("📊 As you add messages, notice how efficient the rendering is!");
console.log("✨ Only NEW message content gets rendered - previous messages stay untouched!");
console.log("⚡ The more messages you have, the more efficient it becomes!");
console.log("🔧 Built with @mariozechner/lemmy-tui\n");

// Start the UI
ui.start();
