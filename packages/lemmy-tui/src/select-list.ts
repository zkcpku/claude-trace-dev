import { Component, ComponentRenderResult } from "./tui.js";
import chalk from "chalk";

export interface SelectItem {
	value: string;
	label: string;
	description?: string;
}

export class SelectList implements Component {
	private items: SelectItem[] = [];
	private filteredItems: SelectItem[] = [];
	private selectedIndex: number = 0;
	private filter: string = "";
	private maxVisible: number = 5;

	public onSelect?: (item: SelectItem) => void;
	public onCancel?: () => void;

	constructor(items: SelectItem[], maxVisible: number = 5) {
		this.items = items;
		this.filteredItems = items;
		this.maxVisible = maxVisible;
	}

	setFilter(filter: string): void {
		this.filter = filter;
		this.filteredItems = this.items.filter((item) => item.value.toLowerCase().startsWith(filter.toLowerCase()));
		// Reset selection when filter changes
		this.selectedIndex = 0;
	}

	render(width: number): ComponentRenderResult {
		const lines: string[] = [];

		// If no items match filter, show message
		if (this.filteredItems.length === 0) {
			lines.push(chalk.gray("  No matching commands"));
			return { lines, changed: true };
		}

		// Calculate visible range with scrolling
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

		// Render visible items
		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			if (!item) continue;

			const isSelected = i === this.selectedIndex;

			let line = "";
			if (isSelected) {
				// Calculate padding more carefully to avoid line wrap
				const prefix = " /";
				const suffix = " ";
				const availableWidth = width - prefix.length - suffix.length - 1; // -1 for safety
				const paddedValue = item.value.substring(0, availableWidth).padEnd(availableWidth);
				line = chalk.bgBlue.white(prefix + paddedValue + suffix);
			} else {
				line = chalk.gray("  /") + item.value;
				if (item.description && width > 40) {
					const spacing = " ".repeat(Math.max(1, 20 - item.value.length));
					line += chalk.gray(spacing + item.description);
				}
			}

			lines.push(line);
		}

		// Add scroll indicators if needed
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const scrollInfo = chalk.gray(`  (${this.selectedIndex + 1}/${this.filteredItems.length})`);
			lines.push(scrollInfo);
		}

		return { lines, changed: true };
	}

	handleInput(keyData: string): void {
		// Up arrow
		if (keyData === "\x1b[A") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		}
		// Down arrow
		else if (keyData === "\x1b[B") {
			this.selectedIndex = Math.min(this.filteredItems.length - 1, this.selectedIndex + 1);
		}
		// Enter
		else if (keyData === "\r") {
			const selectedItem = this.filteredItems[this.selectedIndex];
			if (selectedItem && this.onSelect) {
				this.onSelect(selectedItem);
			}
		}
		// Escape
		else if (keyData === "\x1b") {
			if (this.onCancel) {
				this.onCancel();
			}
		}
	}

	getSelectedItem(): SelectItem | null {
		const item = this.filteredItems[this.selectedIndex];
		return item || null;
	}
}
