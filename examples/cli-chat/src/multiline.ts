#!/usr/bin/env node

import { stdin, stdout } from "process";

interface MultilineEditor {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
	chatMode?: boolean; // If true, don't clear screen on renders
	startRow?: number; // Remember where editor starts in terminal
}

/**
 * Demo multiline text input in terminal
 *
 * Controls:
 * - Type normally to add text
 * - Enter: Submit message
 * - Option+Enter (macOS) or Ctrl+Enter (others): Add new line
 * - Backspace: Delete character/merge lines
 * - Arrow keys: Navigate cursor
 * - Ctrl+C: Exit
 */
export function startMultilineDemo(chatMode = false): Promise<string> {
	return new Promise((resolve, reject) => {
		// Save terminal state
		const wasRaw = stdin.isRaw;

		// Initialize fresh editor state
		const editor: MultilineEditor = {
			lines: [""],
			cursorLine: 0,
			cursorCol: 0,
			chatMode,
		};

		// Set up raw mode for key capture
		stdin.setRawMode(true);
		stdin.setEncoding("utf8");
		stdin.resume();

		// Show initial editor
		renderEditor(editor, !chatMode);

		// Handle terminal resize
		const handleResize = () => {
			renderEditor(editor);
		};
		process.stdout.on("resize", handleResize);

		const handleKeypress = (data: string) => {
			// Debug: uncomment to see key sequences (useful for finding new shortcuts)
			// if (data.length > 1 && !data.includes('\n')) {
			//     console.log('Key sequence:', JSON.stringify(data));
			// }

			// Handle paste - detect when we get a lot of text at once (typical paste behavior)
			if (data.length > 10 || (data.length > 2 && data.includes("\n"))) {
				handlePaste(editor, data);
				renderEditor(editor);
				return;
			}

			// Handle special key combinations first

			// Ctrl+C - Exit
			if (data.charCodeAt(0) === 3) {
				cleanup();
				reject(new Error("Cancelled"));
				return;
			}

			// Ctrl+K - Delete current line
			if (data.charCodeAt(0) === 11) {
				deleteCurrentLine(editor);
				renderEditor(editor);
				return;
			}

			// Ctrl+A - Move to start of line (like Cmd+Left)
			if (data.charCodeAt(0) === 1) {
				moveToLineStart(editor);
				renderEditor(editor);
				return;
			}

			// Ctrl+E - Move to end of line (like Cmd+Right)
			if (data.charCodeAt(0) === 5) {
				moveToLineEnd(editor);
				renderEditor(editor);
				return;
			}

			// New line shortcuts (varies by terminal):
			// - VS Code: Option+Enter
			// - iTerm2: Shift+Enter
			// - General: Ctrl+Enter
			if (
				data.charCodeAt(0) === 10 || // Ctrl+Enter
				data === "\x1b\r" || // Option+Enter in some terminals
				data === "\x1b[13;2~" || // Shift+Enter in some terminals
				(data.length > 1 && data.includes("\x1b") && data.includes("\r"))
			) {
				// Modifier + Enter = new line
				addNewLine(editor);
				renderEditor(editor);
				return;
			}

			// Plain Enter (char code 13)
			if (data.charCodeAt(0) === 13 && data.length === 1) {
				// Plain Enter = submit
				const result = editor.lines.join("\n").trim();

				// Clear the entire editor area before submitting (just input area now)
				// Move up to start of input area and clear down
				if (editor.chatMode && lastInputAreaLines > 0) {
					stdout.write(`\x1b[${lastInputAreaLines}A\x1b[0J`);
				}

				cleanup();
				resolve(result);
				return;
			}

			const key = data.charCodeAt(0);

			// Backspace
			if (key === 127 || key === 8) {
				handleBackspace(editor);
				renderEditor(editor);
				return;
			}

			// Line navigation shortcuts (Home/End keys work more reliably than Cmd+Arrow)
			if (data === "\x1b[H" || data === "\x1b[1~" || data === "\x1b[7~") {
				// Home key
				moveToLineStart(editor);
				renderEditor(editor);
				return;
			}
			if (data === "\x1b[F" || data === "\x1b[4~" || data === "\x1b[8~") {
				// End key
				moveToLineEnd(editor);
				renderEditor(editor);
				return;
			}

			// Forward delete (Fn+Backspace or Delete key)
			if (data === "\x1b[3~") {
				// Delete key
				handleForwardDelete(editor);
				renderEditor(editor);
				return;
			}

			// Arrow keys
			if (data === "\x1b[A") {
				// Up
				moveCursor(editor, -1, 0);
				renderEditor(editor);
				return;
			}
			if (data === "\x1b[B") {
				// Down
				moveCursor(editor, 1, 0);
				renderEditor(editor);
				return;
			}
			if (data === "\x1b[C") {
				// Right
				moveCursor(editor, 0, 1);
				renderEditor(editor);
				return;
			}
			if (data === "\x1b[D") {
				// Left
				moveCursor(editor, 0, -1);
				renderEditor(editor);
				return;
			}

			// Regular characters (printable ASCII)
			if (key >= 32 && key <= 126) {
				insertCharacter(editor, data);
				renderEditor(editor);
			}
		};

		const cleanup = () => {
			stdin.removeListener("data", handleKeypress);
			process.stdout.removeListener("resize", handleResize);
			stdin.setRawMode(wasRaw);
		};

		stdin.on("data", handleKeypress);
	});
}

function insertCharacter(editor: MultilineEditor, char: string) {
	const line = editor.lines[editor.cursorLine] || "";

	const before = line.slice(0, editor.cursorCol);
	const after = line.slice(editor.cursorCol);

	editor.lines[editor.cursorLine] = before + char + after;
	editor.cursorCol++;
}

function handlePaste(editor: MultilineEditor, pastedText: string) {
	// Clean the pasted text
	const cleanText = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	// Filter out non-printable characters except newlines
	const filteredText = cleanText
		.split("")
		.filter((char) => char === "\n" || (char >= " " && char <= "~"))
		.join("");

	// Split into lines
	const pastedLines = filteredText.split("\n");

	if (pastedLines.length === 1) {
		// Single line - just insert each character
		const text = pastedLines[0] || "";
		for (const char of text) {
			insertCharacter(editor, char);
		}
		return;
	}

	// Multi-line paste - be very careful with array manipulation
	const currentLine = editor.lines[editor.cursorLine] || "";
	const beforeCursor = currentLine.slice(0, editor.cursorCol);
	const afterCursor = currentLine.slice(editor.cursorCol);

	// Build the new lines array step by step
	const newLines: string[] = [];

	// Add all lines before current line
	for (let i = 0; i < editor.cursorLine; i++) {
		newLines.push(editor.lines[i] || "");
	}

	// Add the first pasted line merged with before cursor text
	newLines.push(beforeCursor + (pastedLines[0] || ""));

	// Add all middle pasted lines
	for (let i = 1; i < pastedLines.length - 1; i++) {
		newLines.push(pastedLines[i] || "");
	}

	// Add the last pasted line with after cursor text
	newLines.push((pastedLines[pastedLines.length - 1] || "") + afterCursor);

	// Add all lines after current line
	for (let i = editor.cursorLine + 1; i < editor.lines.length; i++) {
		newLines.push(editor.lines[i] || "");
	}

	// Replace the entire lines array
	editor.lines = newLines;

	// Update cursor position to end of pasted content
	editor.cursorLine += pastedLines.length - 1;
	editor.cursorCol = (pastedLines[pastedLines.length - 1] || "").length;
}

function addNewLine(editor: MultilineEditor) {
	const currentLine = editor.lines[editor.cursorLine] || "";

	const before = currentLine.slice(0, editor.cursorCol);
	const after = currentLine.slice(editor.cursorCol);

	// Split current line
	editor.lines[editor.cursorLine] = before;
	editor.lines.splice(editor.cursorLine + 1, 0, after);

	// Move cursor to start of new line
	editor.cursorLine++;
	editor.cursorCol = 0;
}

function handleBackspace(editor: MultilineEditor) {
	if (editor.cursorCol > 0) {
		// Delete character in current line
		const line = editor.lines[editor.cursorLine] || "";

		const before = line.slice(0, editor.cursorCol - 1);
		const after = line.slice(editor.cursorCol);

		editor.lines[editor.cursorLine] = before + after;
		editor.cursorCol--;
	} else if (editor.cursorLine > 0) {
		// Merge with previous line
		const currentLine = editor.lines[editor.cursorLine] || "";
		const previousLine = editor.lines[editor.cursorLine - 1] || "";

		editor.lines[editor.cursorLine - 1] = previousLine + currentLine;
		editor.lines.splice(editor.cursorLine, 1);

		editor.cursorLine--;
		editor.cursorCol = previousLine.length;
	}
}

function moveToLineStart(editor: MultilineEditor) {
	// Move to start of current visual line (accounting for wrapping)
	const termWidth = process.stdout.columns || 80;
	const lineNumberWidth = 5;
	const availableWidth = termWidth - lineNumberWidth;

	const currentVisualLine = Math.floor(editor.cursorCol / availableWidth);
	editor.cursorCol = currentVisualLine * availableWidth;
}

function moveToLineEnd(editor: MultilineEditor) {
	// Move to end of current visual line (accounting for wrapping)
	const termWidth = process.stdout.columns || 80;
	const lineNumberWidth = 5;
	const availableWidth = termWidth - lineNumberWidth;

	const currentLine = editor.lines[editor.cursorLine] || "";
	const currentVisualLine = Math.floor(editor.cursorCol / availableWidth);
	const maxVisualLines = Math.max(1, Math.ceil(currentLine.length / availableWidth));

	if (currentVisualLine < maxVisualLines - 1) {
		// Not on the last visual line - move to end of current visual line
		editor.cursorCol = (currentVisualLine + 1) * availableWidth - 1;
	} else {
		// On the last visual line - move to end of actual line
		editor.cursorCol = currentLine.length;
	}
}

function handleForwardDelete(editor: MultilineEditor) {
	const currentLine = editor.lines[editor.cursorLine] || "";

	if (editor.cursorCol < currentLine.length) {
		// Delete character at cursor position (forward delete)
		const before = currentLine.slice(0, editor.cursorCol);
		const after = currentLine.slice(editor.cursorCol + 1);
		editor.lines[editor.cursorLine] = before + after;
	} else if (editor.cursorLine < editor.lines.length - 1) {
		// At end of line - merge with next line
		const nextLine = editor.lines[editor.cursorLine + 1] || "";
		editor.lines[editor.cursorLine] = currentLine + nextLine;
		editor.lines.splice(editor.cursorLine + 1, 1);
	}
}

function deleteCurrentLine(editor: MultilineEditor) {
	if (editor.lines.length === 1) {
		// Only one line - just clear it
		editor.lines[0] = "";
		editor.cursorCol = 0;
	} else {
		// Multiple lines - remove current line
		editor.lines.splice(editor.cursorLine, 1);

		// Adjust cursor position
		if (editor.cursorLine >= editor.lines.length) {
			// Was on last line, move to new last line
			editor.cursorLine = editor.lines.length - 1;
		}

		// Clamp cursor column to new line length
		const newLine = editor.lines[editor.cursorLine] || "";
		editor.cursorCol = Math.min(editor.cursorCol, newLine.length);
	}
}

function moveCursor(editor: MultilineEditor, deltaLine: number, deltaCol: number) {
	const termWidth = process.stdout.columns || 80;
	const lineNumberWidth = 5; // " 1: " takes 4 chars
	const availableWidth = termWidth - lineNumberWidth;

	if (deltaLine !== 0) {
		// Calculate current visual position (which visual line within the logical line)
		const currentLine = editor.lines[editor.cursorLine] || "";
		const currentVisualLine = Math.floor(editor.cursorCol / availableWidth);
		const currentVisualCol = editor.cursorCol % availableWidth;

		if (deltaLine === -1) {
			// Up arrow
			if (currentVisualLine > 0) {
				// Move up within the same logical line (unwrap)
				const newCol = Math.max(0, editor.cursorCol - availableWidth);
				const line = editor.lines[editor.cursorLine] || "";
				editor.cursorCol = Math.min(newCol, line.length);
			} else if (editor.cursorLine > 0) {
				// Move to previous logical line
				editor.cursorLine--;
				const prevLine = editor.lines[editor.cursorLine] || "";

				// Find the last visual line of the previous logical line
				const prevLineVisualLines = Math.max(1, Math.ceil(prevLine.length / availableWidth));
				const targetVisualCol = currentVisualCol;
				const targetCol = (prevLineVisualLines - 1) * availableWidth + targetVisualCol;

				editor.cursorCol = Math.min(targetCol, prevLine.length);
			}
		} else if (deltaLine === 1) {
			// Down arrow
			const currentLine = editor.lines[editor.cursorLine] || "";
			const maxVisualLines = Math.max(1, Math.ceil(currentLine.length / availableWidth));

			if (currentVisualLine < maxVisualLines - 1) {
				// Move down within the same logical line (wrap)
				const newCol = editor.cursorCol + availableWidth;
				editor.cursorCol = Math.min(newCol, currentLine.length);
			} else if (editor.cursorLine < editor.lines.length - 1) {
				// Move to next logical line
				editor.cursorLine++;
				const nextLine = editor.lines[editor.cursorLine] || "";
				const targetCol = currentVisualCol;

				editor.cursorCol = Math.min(targetCol, nextLine.length);
			}
		}
	}

	if (deltaCol !== 0) {
		// Move column
		const newCol = editor.cursorCol + deltaCol;
		const currentLine = editor.lines[editor.cursorLine] || "";
		const maxCol = currentLine.length;
		editor.cursorCol = Math.max(0, Math.min(maxCol, newCol));
	}
}

let lastInputAreaLines = 0; // Track how many lines the input area took

function renderEditor(editor: MultilineEditor, clearScreen?: boolean) {
	// Get terminal size
	const termWidth = process.stdout.columns || 80;
	const separator = "─".repeat(termWidth - 1);
	const lineNumberWidth = 5; // " 1: " takes about 4-5 chars
	const availableWidth = termWidth - lineNumberWidth;

	const isFirstRender = !editor.startRow;

	if (clearScreen === true) {
		// Full screen clear (standalone mode)
		stdout.write("\x1b[2J\x1b[H");
	}

	if (isFirstRender) {
		// First render: just show input area (no header)
		// Mark that we've rendered once
		editor.startRow = 1;

		// Render input area and track how many lines it took
		lastInputAreaLines = renderInputArea(editor, termWidth, availableWidth);
	} else {
		// Subsequent renders: move up to start of input area, clear down, re-render
		if (editor.chatMode && lastInputAreaLines > 0) {
			// Move cursor up to start of input area (relative positioning)
			stdout.write(`\x1b[${lastInputAreaLines}A`);
			// Clear from cursor down
			stdout.write("\x1b[0J");
		}

		// Re-render input area and track new line count
		lastInputAreaLines = renderInputArea(editor, termWidth, availableWidth);
	}
}

interface LayoutLine {
	text: string;
	hasCursor: boolean;
	cursorPos?: number;
}

function layoutText(editor: MultilineEditor, contentWidth: number): LayoutLine[] {
	const layoutLines: LayoutLine[] = [];

	if (editor.lines.length === 0 || (editor.lines.length === 1 && editor.lines[0] === "")) {
		// Empty editor
		layoutLines.push({
			text: "> ",
			hasCursor: true,
			cursorPos: 2,
		});
		return layoutLines;
	}

	// Process each logical line
	for (let i = 0; i < editor.lines.length; i++) {
		const line = editor.lines[i] || "";
		const isCurrentLine = i === editor.cursorLine;
		const prefix = i === 0 ? "> " : "  ";
		const prefixedLine = prefix + line;
		const maxLineLength = contentWidth;

		if (prefixedLine.length <= maxLineLength) {
			// Line fits in one layout line
			if (isCurrentLine) {
				layoutLines.push({
					text: prefixedLine,
					hasCursor: true,
					cursorPos: prefix.length + editor.cursorCol,
				});
			} else {
				layoutLines.push({
					text: prefixedLine,
					hasCursor: false,
				});
			}
		} else {
			// Line needs wrapping
			const chunks = [];
			for (let pos = 0; pos < prefixedLine.length; pos += maxLineLength) {
				chunks.push(prefixedLine.slice(pos, pos + maxLineLength));
			}

			for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
				const chunk = chunks[chunkIndex];
				if (!chunk) continue;

				const chunkStart = chunkIndex * maxLineLength;
				const chunkEnd = chunkStart + chunk.length;
				const cursorPos = prefix.length + editor.cursorCol;
				const hasCursorInChunk = isCurrentLine && cursorPos >= chunkStart && cursorPos < chunkEnd;

				if (hasCursorInChunk) {
					layoutLines.push({
						text: chunk,
						hasCursor: true,
						cursorPos: cursorPos - chunkStart,
					});
				} else {
					layoutLines.push({
						text: chunk,
						hasCursor: false,
					});
				}
			}
		}
	}

	return layoutLines;
}

function renderInputArea(editor: MultilineEditor, termWidth: number, availableWidth: number): number {
	let lineCount = 0;

	// Box drawing characters
	const topLeft = "╭";
	const topRight = "╮";
	const bottomLeft = "╰";
	const bottomRight = "╯";
	const horizontal = "─";
	const vertical = "│";

	// Calculate box width (leave some margin)
	const boxWidth = Math.min(termWidth - 2, 80);
	const contentWidth = boxWidth - 4; // Account for "│ " and " │"

	// Layout the text
	const layoutLines = layoutText(editor, contentWidth);

	// Render top border
	console.log(topLeft + horizontal.repeat(boxWidth - 2) + topRight);
	lineCount++;

	// Render each layout line
	for (const layoutLine of layoutLines) {
		let displayText = layoutLine.text;
		let visibleLength = layoutLine.text.length;

		// Add cursor if this line has it
		if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {
			const before = displayText.slice(0, layoutLine.cursorPos);
			const after = displayText.slice(layoutLine.cursorPos);

			if (after.length > 0) {
				// Cursor is on a character - replace it with highlighted version
				const cursor = `\x1b[7m${after[0]}\x1b[0m`;
				const restAfter = after.slice(1);
				displayText = before + cursor + restAfter;
				// visibleLength stays the same - we're replacing, not adding
			} else {
				// Cursor is at the end - add highlighted space
				const cursor = "\x1b[7m \x1b[0m";
				displayText = before + cursor;
				// visibleLength increases by 1 - we're adding a space
				visibleLength = layoutLine.text.length + 1;
			}
		}

		// Calculate padding based on actual visible length
		const padding = " ".repeat(Math.max(0, contentWidth - visibleLength));

		// Render the line
		console.log(`${vertical} ${displayText}${padding} ${vertical}`);
		lineCount++;
	}

	// Render bottom border
	console.log(bottomLeft + horizontal.repeat(boxWidth - 2) + bottomRight);
	lineCount++;

	return lineCount;
}

// Demo runner - Chat-like interface
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log("🚀 Multiline Chat Demo");
	console.log("Type messages and press Enter to send. Ctrl+C to exit.\n");

	const chatHistory: string[] = [];

	async function runChatLoop() {
		while (true) {
			try {
				const message = await startMultilineDemo(true); // Enable chat mode

				if (message.trim()) {
					// Add message to history
					chatHistory.push(message);

					// Simply output the new message (editor was already cleared)
					console.log(`💬 Message ${chatHistory.length}:`);
					console.log(message);
					console.log(); // Empty line

					// Continue to next message (new editor will appear)
				}
			} catch (error) {
				console.log(`\n👋 Chat ended: ${error instanceof Error ? error.message : String(error)}`);
				process.exit(0);
			}
		}
	}

	runChatLoop();
}
