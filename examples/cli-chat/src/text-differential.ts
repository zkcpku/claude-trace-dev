import { Component, RenderResult } from "./tui-differential.js";

export class TextComponent implements Component {
	private text: string;
	private lastRenderedLines: string[] = [];

	constructor(text: string) {
		this.text = text;
	}

	render(width: number): RenderResult {
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
		if (this.arraysEqual(newLines, this.lastRenderedLines)) {
			// No change - keep all lines
			return {
				keepLines: this.lastRenderedLines.length,
				newLines: [],
			};
		}

		// Content changed - replace all lines
		this.lastRenderedLines = [...newLines];
		return {
			keepLines: 0,
			newLines: newLines,
		};
	}

	setText(text: string): void {
		this.text = text;
	}

	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}
}
