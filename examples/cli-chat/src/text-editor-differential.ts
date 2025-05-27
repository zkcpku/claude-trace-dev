import { Component, RenderResult } from "./tui-differential.js";

// Debug logging
import { writeFileSync, appendFileSync } from "fs";
const logFile = "/tmp/tui-debug.log";
function debugLog(message: string) {
	try {
		appendFileSync(logFile, `${new Date().toISOString()}: ${message}\n`);
	} catch (e) {
		// Ignore if can't write to /tmp
	}
}

interface EditorState {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
}

interface LayoutLine {
	text: string;
	hasCursor: boolean;
	cursorPos?: number;
}

export class TextEditor implements Component {
	private state: EditorState = {
		lines: [""],
		cursorLine: 0,
		cursorCol: 0,
	};

	public onSubmit?: (text: string) => void;

	render(width: number): RenderResult {
		// Box drawing characters
		const topLeft = "╭";
		const topRight = "╮";
		const bottomLeft = "╰";
		const bottomRight = "╯";
		const horizontal = "─";
		const vertical = "│";

		// Calculate box width (leave some margin)
		const boxWidth = Math.min(width - 2, 80);
		const contentWidth = boxWidth - 4; // Account for "│ " and " │"

		// Layout the text
		const layoutLines = this.layoutText(contentWidth);

		const result: string[] = [];

		// Render top border
		result.push(topLeft + horizontal.repeat(boxWidth - 2) + topRight);

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
			result.push(`${vertical} ${displayText}${padding} ${vertical}`);
		}

		// Render bottom border
		result.push(bottomLeft + horizontal.repeat(boxWidth - 2) + bottomRight);

		// For interactive components like text editors, always do full re-render
		// Simple approach: always report keepLines=0 to force complete re-render
		debugLog(`TextEditor: Always re-rendering (simple approach)`);

		return {
			keepLines: 0,
			newLines: result,
		};
	}

	handleInput(data: string): void {
		// Handle special key combinations first

		// Ctrl+C - Exit (let parent handle this)
		if (data.charCodeAt(0) === 3) {
			return;
		}

		// Handle paste - detect when we get a lot of text at once
		if (data.length > 10 || (data.length > 2 && data.includes("\n"))) {
			this.handlePaste(data);
		}
		// Ctrl+K - Delete current line
		else if (data.charCodeAt(0) === 11) {
			this.deleteCurrentLine();
		}
		// Ctrl+A - Move to start of line
		else if (data.charCodeAt(0) === 1) {
			this.moveToLineStart();
		}
		// Ctrl+E - Move to end of line
		else if (data.charCodeAt(0) === 5) {
			this.moveToLineEnd();
		}
		// New line shortcuts
		else if (
			data.charCodeAt(0) === 10 || // Ctrl+Enter
			data === "\x1b\r" || // Option+Enter in some terminals
			data === "\x1b[13;2~" || // Shift+Enter in some terminals
			(data.length > 1 && data.includes("\x1b") && data.includes("\r"))
		) {
			// Modifier + Enter = new line
			this.addNewLine();
		}
		// Plain Enter (char code 13)
		else if (data.charCodeAt(0) === 13 && data.length === 1) {
			// Plain Enter = submit
			const result = this.state.lines.join("\n").trim();

			// Reset editor
			this.state = {
				lines: [""],
				cursorLine: 0,
				cursorCol: 0,
			};

			if (this.onSubmit) {
				this.onSubmit(result);
			}
		}
		// Backspace
		else if (data.charCodeAt(0) === 127 || data.charCodeAt(0) === 8) {
			this.handleBackspace();
		}
		// Line navigation shortcuts (Home/End keys)
		else if (data === "\x1b[H" || data === "\x1b[1~" || data === "\x1b[7~") {
			// Home key
			this.moveToLineStart();
		} else if (data === "\x1b[F" || data === "\x1b[4~" || data === "\x1b[8~") {
			// End key
			this.moveToLineEnd();
		}
		// Forward delete (Fn+Backspace or Delete key)
		else if (data === "\x1b[3~") {
			// Delete key
			this.handleForwardDelete();
		}
		// Arrow keys
		else if (data === "\x1b[A") {
			// Up
			this.moveCursor(-1, 0);
		} else if (data === "\x1b[B") {
			// Down
			this.moveCursor(1, 0);
		} else if (data === "\x1b[C") {
			// Right
			this.moveCursor(0, 1);
		} else if (data === "\x1b[D") {
			// Left
			this.moveCursor(0, -1);
		}
		// Regular characters (printable ASCII)
		else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
			this.insertCharacter(data);
		}
	}

	private layoutText(contentWidth: number): LayoutLine[] {
		const layoutLines: LayoutLine[] = [];

		if (this.state.lines.length === 0 || (this.state.lines.length === 1 && this.state.lines[0] === "")) {
			// Empty editor
			layoutLines.push({
				text: "> ",
				hasCursor: true,
				cursorPos: 2,
			});
			return layoutLines;
		}

		// Process each logical line
		for (let i = 0; i < this.state.lines.length; i++) {
			const line = this.state.lines[i] || "";
			const isCurrentLine = i === this.state.cursorLine;
			const prefix = i === 0 ? "> " : "  ";
			const prefixedLine = prefix + line;
			const maxLineLength = contentWidth;

			if (prefixedLine.length <= maxLineLength) {
				// Line fits in one layout line
				if (isCurrentLine) {
					layoutLines.push({
						text: prefixedLine,
						hasCursor: true,
						cursorPos: prefix.length + this.state.cursorCol,
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
					const cursorPos = prefix.length + this.state.cursorCol;
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

	// All the editor methods from before...
	private insertCharacter(char: string): void {
		const line = this.state.lines[this.state.cursorLine] || "";

		const before = line.slice(0, this.state.cursorCol);
		const after = line.slice(this.state.cursorCol);

		this.state.lines[this.state.cursorLine] = before + char + after;
		this.state.cursorCol++;
	}

	private handlePaste(pastedText: string): void {
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
				this.insertCharacter(char);
			}
			return;
		}

		// Multi-line paste - be very careful with array manipulation
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		const beforeCursor = currentLine.slice(0, this.state.cursorCol);
		const afterCursor = currentLine.slice(this.state.cursorCol);

		// Build the new lines array step by step
		const newLines: string[] = [];

		// Add all lines before current line
		for (let i = 0; i < this.state.cursorLine; i++) {
			newLines.push(this.state.lines[i] || "");
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
		for (let i = this.state.cursorLine + 1; i < this.state.lines.length; i++) {
			newLines.push(this.state.lines[i] || "");
		}

		// Replace the entire lines array
		this.state.lines = newLines;

		// Update cursor position to end of pasted content
		this.state.cursorLine += pastedLines.length - 1;
		this.state.cursorCol = (pastedLines[pastedLines.length - 1] || "").length;
	}

	private addNewLine(): void {
		const currentLine = this.state.lines[this.state.cursorLine] || "";

		const before = currentLine.slice(0, this.state.cursorCol);
		const after = currentLine.slice(this.state.cursorCol);

		// Split current line
		this.state.lines[this.state.cursorLine] = before;
		this.state.lines.splice(this.state.cursorLine + 1, 0, after);

		// Move cursor to start of new line
		this.state.cursorLine++;
		this.state.cursorCol = 0;
	}

	private handleBackspace(): void {
		if (this.state.cursorCol > 0) {
			// Delete character in current line
			const line = this.state.lines[this.state.cursorLine] || "";

			const before = line.slice(0, this.state.cursorCol - 1);
			const after = line.slice(this.state.cursorCol);

			this.state.lines[this.state.cursorLine] = before + after;
			this.state.cursorCol--;
		} else if (this.state.cursorLine > 0) {
			// Merge with previous line
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const previousLine = this.state.lines[this.state.cursorLine - 1] || "";

			this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine;
			this.state.lines.splice(this.state.cursorLine, 1);

			this.state.cursorLine--;
			this.state.cursorCol = previousLine.length;
		}
	}

	private moveToLineStart(): void {
		this.state.cursorCol = 0;
	}

	private moveToLineEnd(): void {
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		this.state.cursorCol = currentLine.length;
	}

	private handleForwardDelete(): void {
		const currentLine = this.state.lines[this.state.cursorLine] || "";

		if (this.state.cursorCol < currentLine.length) {
			// Delete character at cursor position (forward delete)
			const before = currentLine.slice(0, this.state.cursorCol);
			const after = currentLine.slice(this.state.cursorCol + 1);
			this.state.lines[this.state.cursorLine] = before + after;
		} else if (this.state.cursorLine < this.state.lines.length - 1) {
			// At end of line - merge with next line
			const nextLine = this.state.lines[this.state.cursorLine + 1] || "";
			this.state.lines[this.state.cursorLine] = currentLine + nextLine;
			this.state.lines.splice(this.state.cursorLine + 1, 1);
		}
	}

	private deleteCurrentLine(): void {
		if (this.state.lines.length === 1) {
			// Only one line - just clear it
			this.state.lines[0] = "";
			this.state.cursorCol = 0;
		} else {
			// Multiple lines - remove current line
			this.state.lines.splice(this.state.cursorLine, 1);

			// Adjust cursor position
			if (this.state.cursorLine >= this.state.lines.length) {
				// Was on last line, move to new last line
				this.state.cursorLine = this.state.lines.length - 1;
			}

			// Clamp cursor column to new line length
			const newLine = this.state.lines[this.state.cursorLine] || "";
			this.state.cursorCol = Math.min(this.state.cursorCol, newLine.length);
		}
	}

	private moveCursor(deltaLine: number, deltaCol: number): void {
		if (deltaLine !== 0) {
			const newLine = this.state.cursorLine + deltaLine;
			if (newLine >= 0 && newLine < this.state.lines.length) {
				this.state.cursorLine = newLine;
				// Clamp cursor column to new line length
				const line = this.state.lines[this.state.cursorLine] || "";
				this.state.cursorCol = Math.min(this.state.cursorCol, line.length);
			}
		}

		if (deltaCol !== 0) {
			// Move column
			const newCol = this.state.cursorCol + deltaCol;
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const maxCol = currentLine.length;
			this.state.cursorCol = Math.max(0, Math.min(maxCol, newCol));
		}
	}
}
