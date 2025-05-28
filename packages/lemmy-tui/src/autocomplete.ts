import { readdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { logger } from "./logger.js";

export interface AutocompleteItem {
	value: string;
	label: string;
	description?: string;
}

export interface SlashCommand {
	name: string;
	description?: string;
	// Function to get argument completions for this command
	// Returns null if no argument completion is available
	getArgumentCompletions?(argumentPrefix: string): AutocompleteItem[] | null;
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
	private commands: (SlashCommand | AutocompleteItem)[];
	private basePath: string;

	constructor(commands: (SlashCommand | AutocompleteItem)[] = [], basePath: string = process.cwd()) {
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

		// Check for slash commands
		if (textBeforeCursor.startsWith("/")) {
			const spaceIndex = textBeforeCursor.indexOf(" ");

			if (spaceIndex === -1) {
				// No space yet - complete command names
				const prefix = textBeforeCursor.slice(1); // Remove the "/"
				const filtered = this.commands
					.filter((cmd) => {
						const name = "name" in cmd ? cmd.name : cmd.value; // Check if SlashCommand or AutocompleteItem
						return name && name.toLowerCase().startsWith(prefix.toLowerCase());
					})
					.map((cmd) => ({
						value: "name" in cmd ? cmd.name : cmd.value,
						label: "name" in cmd ? cmd.name : cmd.label,
						...(cmd.description && { description: cmd.description }),
					}));

				if (filtered.length === 0) return null;

				return {
					items: filtered,
					prefix: textBeforeCursor,
				};
			} else {
				// Space found - complete command arguments
				const commandName = textBeforeCursor.slice(1, spaceIndex); // Command without "/"
				const argumentText = textBeforeCursor.slice(spaceIndex + 1); // Text after space

				const command = this.commands.find((cmd) => {
					const name = "name" in cmd ? cmd.name : cmd.value;
					return name === commandName;
				});
				if (!command || !("getArgumentCompletions" in command) || !command.getArgumentCompletions) {
					return null; // No argument completion for this command
				}

				const argumentSuggestions = command.getArgumentCompletions(argumentText);
				if (!argumentSuggestions || argumentSuggestions.length === 0) {
					return null;
				}

				return {
					items: argumentSuggestions,
					prefix: argumentText,
				};
			}
		}

		// Check for file paths - triggered by Tab or if we detect a path pattern
		const pathMatch = this.extractPathPrefix(textBeforeCursor, false);
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

		// Check if we're completing a slash command (prefix starts with "/")
		if (prefix.startsWith("/")) {
			// This is a command name completion
			const newLine = beforePrefix + "/" + item.value + " " + afterCursor;
			const newLines = [...lines];
			newLines[cursorLine] = newLine;

			return {
				lines: newLines,
				cursorLine,
				cursorCol: beforePrefix.length + item.value.length + 2, // +2 for "/" and space
			};
		}

		// Check if we're in a slash command context (beforePrefix contains "/command ")
		const textBeforeCursor = currentLine.slice(0, cursorCol);
		if (textBeforeCursor.includes("/") && textBeforeCursor.includes(" ")) {
			// This is likely a command argument completion
			const newLine = beforePrefix + item.value + afterCursor;
			const newLines = [...lines];
			newLines[cursorLine] = newLine;

			return {
				lines: newLines,
				cursorLine,
				cursorCol: beforePrefix.length + item.value.length,
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
	private extractPathPrefix(text: string, forceExtract: boolean = false): string | null {
		// Match paths - including those ending with /, ~/, or any word at end for forced extraction
		// This regex captures:
		// - Paths starting from beginning of line or after space/quote/equals
		// - Optional ./ or ../ or ~/ prefix (including the trailing slash for ~/)
		// - The path itself (can include / in the middle)
		// - For forced extraction, capture any word at the end
		const matches = text.match(/(?:^|[\s"'=])((?:~\/|\.{0,2}\/?)?(?:[^\s"'=]*\/?)*[^\s"'=]*)$/);
		if (!matches) {
			// If forced extraction and no matches, return empty string to trigger from current dir
			return forceExtract ? "" : null;
		}

		const pathPrefix = matches[1] || "";

		// For forced extraction (Tab key), always return something
		if (forceExtract) {
			return pathPrefix;
		}

		// For natural triggers, return if it looks like a path, ends with /, starts with ~/, .
		// Only return empty string if the text looks like it's starting a path context
		if (pathPrefix.includes("/") || pathPrefix.startsWith(".") || pathPrefix.startsWith("~/")) {
			return pathPrefix;
		}

		// Return empty string only if we're at the beginning of the line or after a space
		// (not after quotes or other delimiters that don't suggest file paths)
		if (pathPrefix === "" && (text === "" || text.endsWith(" "))) {
			return pathPrefix;
		}

		return null;
	}

	// Expand home directory (~/) to actual home path
	private expandHomePath(path: string): string {
		if (path.startsWith("~/")) {
			return join(homedir(), path.slice(2));
		} else if (path === "~") {
			return homedir();
		}
		return path;
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
			let expandedPrefix = prefix;

			// Handle home directory expansion
			if (prefix.startsWith("~")) {
				expandedPrefix = this.expandHomePath(prefix);
			}

			if (prefix === "" || prefix === "./" || prefix === "../" || prefix === "~" || prefix === "~/") {
				// Complete from specified position
				if (prefix.startsWith("~")) {
					searchDir = expandedPrefix;
				} else {
					searchDir = join(this.basePath, prefix);
				}
				searchPrefix = "";
			} else if (expandedPrefix.endsWith("/")) {
				// If prefix ends with /, show contents of that directory
				if (prefix.startsWith("~")) {
					searchDir = expandedPrefix;
				} else {
					searchDir = join(this.basePath, expandedPrefix);
				}
				searchPrefix = "";
			} else {
				// Split into directory and file prefix
				const dir = dirname(expandedPrefix);
				const file = basename(expandedPrefix);
				if (prefix.startsWith("~")) {
					searchDir = dir;
				} else {
					searchDir = join(this.basePath, dir);
				}
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
					// Preserve ~/ format for home directory paths
					if (prefix.startsWith("~/")) {
						const homeRelativeDir = prefix.slice(2); // Remove ~/
						const dir = dirname(homeRelativeDir);
						relativePath = "~/" + (dir === "." ? entry : join(dir, entry));
					} else {
						relativePath = join(dirname(prefix), entry);
					}
				} else {
					// For standalone entries, preserve ~/ if original prefix was ~/
					if (prefix.startsWith("~")) {
						relativePath = "~/" + entry;
					} else {
						relativePath = entry;
					}
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

	// Force file completion (called on Tab key) - always returns suggestions
	getForceFileSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): { items: AutocompleteItem[]; prefix: string } | null {
		logger.debug("CombinedAutocompleteProvider", "getForceFileSuggestions called", {
			lines,
			cursorLine,
			cursorCol,
		});

		const currentLine = lines[cursorLine] || "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);

		// Don't trigger if we're in a slash command
		if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
			return null;
		}

		// Force extract path prefix - this will always return something
		const pathMatch = this.extractPathPrefix(textBeforeCursor, true);
		logger.debug("CombinedAutocompleteProvider", "Forced path match", {
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
