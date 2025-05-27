import { Component, ComponentRenderResult } from "./tui.js";

export class TextComponent implements Component {
	private text: string;
	private lastRenderedLines: string[] = [];

	constructor(text: string) {
		this.text = text;
	}

	render(width: number): ComponentRenderResult {
		// Simple text wrapping
		const lines: string[] = [];
		const words = this.text.split(" ");
		let currentLine = "";

		for (const word of words) {
			if (currentLine.length + word.length + 1 <= width) {
				currentLine += (currentLine ? " " : "") + word;
			} else {
				if (currentLine) {
					lines.push(currentLine);
				}
				currentLine = word;
			}
		}

		if (currentLine) {
			lines.push(currentLine);
		}

		const newLines = lines.length > 0 ? lines : [""];

		// Check if content changed
		const changed = !this.arraysEqual(newLines, this.lastRenderedLines);

		// Always cache the current rendered lines
		this.lastRenderedLines = [...newLines];

		return {
			lines: newLines,
			changed,
		};
	}

	setText(text: string): void {
		this.text = text;
	}

	getText(): string {
		return this.text;
	}

	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}
}
