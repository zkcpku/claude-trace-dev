import { readdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { logger } from "./logger.js";

export interface AutocompleteItem {
	value: string;
	label: string;
	description?: string;
}

export interface AutocompleteProvider {
	// Get autocomplete suggestions for current text/cursor position
	// Returns null if no suggestions available
	getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): {
		items: AutocompleteItem[];
		prefix: string; // What we're matching against (e.g., "/" or "src/")
	} | null;

	// Apply the selected item
	// Returns the new text and cursor position
	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: AutocompleteItem,
		prefix: string,
	): {
		lines: string[];
		cursorLine: number;
		cursorCol: number;
	};
}

// Combined provider that handles both slash commands and file paths
export class CombinedAutocompleteProvider implements AutocompleteProvider {
	private commands: AutocompleteItem[];
	private basePath: string;

	constructor(commands: AutocompleteItem[] = [], basePath: string = process.cwd()) {
		this.commands = commands;
		this.basePath = basePath;
	}

	getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): { items: AutocompleteItem[]; prefix: string } | null {
		logger.debug("CombinedAutocompleteProvider", "getSuggestions called", {
			lines,
			cursorLine,
			cursorCol,
		});

		const currentLine = lines[cursorLine] || "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);

		// Check for slash commands at start of line
		if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
			const prefix = textBeforeCursor.slice(1); // Remove the "/"
			const filtered = this.commands.filter((cmd) => cmd.value.toLowerCase().startsWith(prefix.toLowerCase()));

			if (filtered.length === 0) return null;

			return {
				items: filtered,
				prefix: textBeforeCursor,
			};
		}

		// Check for file paths - triggered by Tab or if we detect a path pattern
		const pathMatch = this.extractPathPrefix(textBeforeCursor);
		logger.debug("CombinedAutocompleteProvider", "Path match check", {
			textBeforeCursor,
			pathMatch,
		});

		if (pathMatch !== null) {
			const suggestions = this.getFileSuggestions(pathMatch);
			if (suggestions.length === 0) return null;

			return {
				items: suggestions,
				prefix: pathMatch,
			};
		}

		return null;
	}

	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: AutocompleteItem,
		prefix: string,
	): { lines: string[]; cursorLine: number; cursorCol: number } {
		const currentLine = lines[cursorLine] || "";
		const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
		const afterCursor = currentLine.slice(cursorCol);

		// For commands, replace the entire command
		if (prefix.startsWith("/")) {
			const newLine = beforePrefix + "/" + item.value + " " + afterCursor;
			const newLines = [...lines];
			newLines[cursorLine] = newLine;

			return {
				lines: newLines,
				cursorLine,
				cursorCol: beforePrefix.length + item.value.length + 2, // +2 for "/" and space
			};
		}

		// For file paths, complete the path
		const newLine = beforePrefix + item.value + afterCursor;
		const newLines = [...lines];
		newLines[cursorLine] = newLine;

		return {
			lines: newLines,
			cursorLine,
			cursorCol: beforePrefix.length + item.value.length,
		};
	}

	// Extract a path-like prefix from the text before cursor
	private extractPathPrefix(text: string): string | null {
		// Match paths - including those ending with /
		// This regex captures:
		// - Paths starting from beginning of line or after space/quote/equals
		// - Optional ./ or ../ prefix
		// - The path itself (can include / in the middle)
		const matches = text.match(/(?:^|[\s"'=])((?:\.{0,2}\/)?(?:[^\s"'=]*\/)*[^\s"'=]*)$/);
		if (!matches) return null;

		const pathPrefix = matches[1] || "";

		// Return if it looks like a path, ends with /, or is empty (for Tab trigger)
		if (pathPrefix.includes("/") || pathPrefix.startsWith(".") || pathPrefix === "") {
			return pathPrefix;
		}

		return null;
	}

	// Get file/directory suggestions for a given path prefix
	private getFileSuggestions(prefix: string): AutocompleteItem[] {
		logger.debug("CombinedAutocompleteProvider", "getFileSuggestions called", {
			prefix,
			basePath: this.basePath,
		});

		try {
			let searchDir: string;
			let searchPrefix: string;

			if (prefix === "" || prefix === "./" || prefix === "../") {
				// Complete from current position
				searchDir = join(this.basePath, prefix);
				searchPrefix = "";
			} else if (prefix.endsWith("/")) {
				// If prefix ends with /, show contents of that directory
				searchDir = join(this.basePath, prefix);
				searchPrefix = "";
			} else {
				// Split into directory and file prefix
				const dir = dirname(prefix);
				const file = basename(prefix);
				searchDir = join(this.basePath, dir);
				searchPrefix = file;
			}

			logger.debug("CombinedAutocompleteProvider", "Searching directory", {
				searchDir,
				searchPrefix,
			});

			const entries = readdirSync(searchDir);
			const suggestions: AutocompleteItem[] = [];

			for (const entry of entries) {
				if (!entry.toLowerCase().startsWith(searchPrefix.toLowerCase())) {
					continue;
				}

				const fullPath = join(searchDir, entry);
				const isDirectory = statSync(fullPath).isDirectory();
				let relativePath: string;

				if (prefix.endsWith("/")) {
					// If prefix ends with /, append entry to the prefix
					relativePath = prefix + entry;
				} else if (prefix.includes("/")) {
					// Otherwise use dirname
					relativePath = join(dirname(prefix), entry);
				} else {
					relativePath = entry;
				}

				suggestions.push({
					value: isDirectory ? relativePath + "/" : relativePath,
					label: entry,
					description: isDirectory ? "directory" : "file",
				});
			}

			// Sort directories first, then alphabetically
			suggestions.sort((a, b) => {
				const aIsDir = a.description === "directory";
				const bIsDir = b.description === "directory";
				if (aIsDir && !bIsDir) return -1;
				if (!aIsDir && bIsDir) return 1;
				return a.label.localeCompare(b.label);
			});

			logger.debug("CombinedAutocompleteProvider", "Returning suggestions", {
				count: suggestions.length,
				firstFew: suggestions.slice(0, 3).map((s) => s.label),
			});

			return suggestions.slice(0, 10); // Limit to 10 suggestions
		} catch (e) {
			// Directory doesn't exist or not accessible
			logger.error("CombinedAutocompleteProvider", "Error reading directory", {
				error: e instanceof Error ? e.message : String(e),
			});
			return [];
		}
	}

	// Check if we should trigger file completion (called on Tab key)
	shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
		const currentLine = lines[cursorLine] || "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);

		// Don't trigger if we're in a slash command
		if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
			return false;
		}

		return true;
	}
}
