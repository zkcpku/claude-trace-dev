# @mariozechner/lemmy-tui

Terminal User Interface library with differential rendering for efficient text-based applications.

## Features

- **Differential Rendering**: Only re-renders content that has changed, making it efficient for applications with lots of text
- **Interactive Components**: Built-in text editor with cursor support, text wrapping, and keyboard shortcuts
- **Simplified Architecture**: Components report what lines to keep vs. what's new, with automatic cascade rendering
- **TypeScript**: Fully typed for better development experience

## Quick Start

```typescript
import { TUI, Container, TextComponent, TextEditor } from "@mariozechner/lemmy-tui";

// Create TUI manager
const ui = new TUI();

// Create components
const header = new TextComponent("🚀 My TUI App");
const chatContainer = new Container();
const editor = new TextEditor();

// Add components to UI
ui.addComponent(header);
ui.addComponent(chatContainer);
ui.addComponent(editor);

// Set focus to the editor
ui.setFocus(editor);

// Handle editor submissions
editor.onSubmit = (text: string) => {
	if (text.trim()) {
		const message = new TextComponent(`💬 ${text}`);
		chatContainer.addChild(message);
		ui.requestRender();
	}
};

// Start the UI
ui.start();
```

## Components

### TUI

The main TUI manager that handles rendering, input, and component coordination.

- `addComponent(component)` - Add a component to the TUI
- `removeComponent(component)` - Remove a component from the TUI
- `setFocus(component)` - Set which component receives keyboard input
- `start()` - Start the TUI (enables raw mode)
- `stop()` - Stop the TUI (disables raw mode)
- `requestRender()` - Request a re-render on next tick

### Container

A component that manages child components with differential rendering.

- `addChild(component)` - Add a child component
- `removeChild(component)` - Remove a child component
- `getChild(index)` - Get a specific child component
- `getChildCount()` - Get the number of child components

### TextEditor

An interactive multiline text editor with cursor support.

- `onSubmit?: (text: string) => void` - Callback when user presses Enter
- Supports keyboard shortcuts: Ctrl+A (home), Ctrl+E (end), Ctrl+K (delete line)
- Option+Enter for new lines, Enter to submit

### TextComponent

A simple text component with automatic text wrapping.

- `setText(text)` - Update the text content
- Automatically wraps text to fit terminal width
- Uses differential rendering to avoid unnecessary updates

## Differential Rendering

The core concept is simple: components report `{keepLines: number, newLines: string[]}`:

- `keepLines`: How many lines from the previous render to keep unchanged
- `newLines`: New lines to append/replace after the kept lines

If `keepLines + newLines.length != totalOldLines`, all components below will cascade re-render.

Interactive components (like TextEditor) can use `keepLines: 0` to always force re-rendering.

## Demos

Try the included demos to see the library in action:

```bash
# Interactive chat demo with differential rendering
npx tsx test/demo.ts

# Component removal demo - test adding/removing components
npx tsx test/component-removal-demo.ts
```

The demos showcase:

- **Differential rendering efficiency** - Only changed content gets re-rendered
- **Component lifecycle management** - Adding and removing components with proper screen clearing
- **Interactive text editor** - Multiline editing with keyboard shortcuts

## License

MIT
