# @mariozechner/lemmy-tui

Terminal UI framework with differential rendering for building interactive CLI applications.

## Features

- **Differential Rendering**: Only re-renders content that has changed for optimal performance
- **Interactive Components**: Text editor, autocomplete, selection lists, and markdown rendering
- **Composable Architecture**: Container-based component system with proper lifecycle management
- **TypeScript**: Fully typed for better development experience
- **Performance Focused**: Minimal screen updates and efficient text wrapping

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

## Core Components

### TUI

Main TUI manager that handles rendering, input, and component coordination.

**Methods:**

- `addComponent(component)` - Add a component to the TUI
- `removeComponent(component)` - Remove a component from the TUI
- `setFocus(component)` - Set which component receives keyboard input
- `start()` - Start the TUI (enables raw mode)
- `stop()` - Stop the TUI (disables raw mode)
- `requestRender()` - Request a re-render on next tick

### Container

Component that manages child components with differential rendering.

**Methods:**

- `addChild(component)` - Add a child component
- `removeChild(component)` - Remove a child component
- `getChild(index)` - Get a specific child component
- `getChildCount()` - Get the number of child components

### TextEditor

Interactive multiline text editor with cursor support and keyboard shortcuts.

**Features:**

- `onSubmit?: (text: string) => void` - Callback when user presses Enter
- Keyboard shortcuts: Ctrl+A (home), Ctrl+E (end), Ctrl+K (delete line)
- Option+Enter for new lines, Enter to submit
- Cursor positioning and text selection

### TextComponent

Simple text component with automatic text wrapping and differential rendering.

**Methods:**

- `setText(text)` - Update the text content
- Automatically wraps text to fit terminal width
- Uses differential rendering to avoid unnecessary updates

### MarkdownComponent

Renders markdown content with syntax highlighting and proper formatting.

**Features:**

- Code block syntax highlighting
- List and heading rendering
- Link and emphasis formatting
- Differential rendering for performance

### SelectList

Interactive selection component for choosing from options.

**Features:**

- Keyboard navigation (arrow keys, Enter)
- Search/filter functionality
- Custom option rendering
- Multi-select support

### Autocomplete

Text input with autocomplete suggestions.

**Features:**

- Real-time suggestion filtering
- Keyboard navigation through suggestions
- Custom completion logic
- Integration with text editor

## Differential Rendering

The core concept: components return `{lines: string[], changed: boolean, keepLines?: number}`:

- `lines`: All lines the component should display
- `changed`: Whether the component has changed since last render
- `keepLines`: (Containers only) How many lines from the beginning are unchanged

**How it works:**

1. TUI calculates total unchanged lines from top (`keepLines`)
2. Moves cursor up by `(totalLines - keepLines)` positions
3. Clears from cursor position down with `\x1b[0J`
4. Prints only the changing lines: `result.lines.slice(keepLines)`

This approach minimizes screen updates and provides smooth performance even with large amounts of text.

## Examples

### Chat Application

```typescript
import { TUI, Container, TextEditor, MarkdownComponent } from "@mariozechner/lemmy-tui";

const ui = new TUI();
const chatHistory = new Container();
const editor = new TextEditor();

editor.onSubmit = (text) => {
	const message = new MarkdownComponent(`**You:** ${text}`);
	chatHistory.addChild(message);

	// Add AI response (simulated)
	setTimeout(() => {
		const response = new MarkdownComponent(`**AI:** Response to "${text}"`);
		chatHistory.addChild(response);
		ui.requestRender();
	}, 1000);
};

ui.addComponent(chatHistory);
ui.addComponent(editor);
ui.setFocus(editor);
ui.start();
```

### Selection Menu

```typescript
import { TUI, SelectList } from "@mariozechner/lemmy-tui";

const ui = new TUI();
const menu = new SelectList(["Option 1", "Option 2", "Option 3"]);

menu.onSelect = (option, index) => {
	console.log(`Selected: ${option} (index ${index})`);
	ui.stop();
};

ui.addComponent(menu);
ui.setFocus(menu);
ui.start();
```

## Development

```bash
npm run build     # Build the package
npm run typecheck # Type checking
```

**Testing:**
Test the TUI components with simulated input:

```bash
npx tsx --no-deprecation src/index.ts chat --simulate-input "Hello world" "ENTER"
```

Special input keywords for simulation: "TAB", "ENTER", "SPACE", "ESC"

## Philosophy

This TUI framework prioritizes:

- **Performance**: Differential rendering minimizes screen updates
- **Composability**: Clean component architecture with proper separation
- **Developer Experience**: TypeScript types and intuitive APIs
- **Flexibility**: Build complex interfaces from simple, reusable components
