import { Component, RenderResult } from "./tui-differential.js";

export class TextComponent implements Component {
	private lastRenderedLines: string[] = [];
	private changed = true;

	constructor(private text: string) {}

	render(width: number): RenderResult {
		if (!this.changed) {
			return { keepLines: this.lastRenderedLines.length, newLines: [] };
		}

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

		this.lastRenderedLines = lines.length > 0 ? lines : [""];
		this.changed = false;
		return {
			keepLines: 0,
			newLines: this.lastRenderedLines,
		};
	}

	setText(text: string): void {
		this.text = text;
		this.changed = true;
	}
}
