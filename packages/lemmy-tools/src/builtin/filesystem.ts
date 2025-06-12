import { z } from "zod";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { defineTool } from "@mariozechner/lemmy";
import type { LemmyTool } from "../types.js";

/**
 * Read tool for reading files
 */
export const readTool: LemmyTool = defineTool({
	name: "Read",
	description: `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- For Jupyter notebooks (.ipynb files), use the NotebookRead instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.`,
	category: "filesystem",
	schema: z.object({
		file_path: z.string().describe("The absolute path to the file to read"),
		offset: z
			.number()
			.optional()
			.describe("The line number to start reading from. Only provide if the file is too large to read at once"),
		limit: z
			.number()
			.optional()
			.describe("The number of lines to read. Only provide if the file is too large to read at once."),
	}),
	execute: async (args, signal) => {
		const { file_path, offset = 0, limit } = args;

		try {
			// Check if cancelled
			if (signal?.aborted) {
				throw new Error("File read was cancelled");
			}

			// Read file content
			const content = await readFile(file_path, "utf-8");

			// Split into lines
			const lines = content.split("\n");

			// Apply offset and limit
			const startLine = Math.max(0, offset);
			const endLine = limit ? Math.min(lines.length, startLine + limit) : lines.length;
			const selectedLines = lines.slice(startLine, endLine);

			// Format with line numbers (cat -n style)
			const numberedLines = selectedLines
				.map((line, index) => {
					const lineNumber = startLine + index + 1;
					const truncatedLine = line.length > 2000 ? line.slice(0, 2000) + "[truncated]" : line;
					return `${lineNumber.toString().padStart(6, " ")}\t${truncatedLine}`;
				})
				.join("\n");

			const result = {
				file_path,
				total_lines: lines.length,
				lines_read: selectedLines.length,
				start_line: startLine + 1,
				end_line: startLine + selectedLines.length,
				content: numberedLines,
			};

			// Add warning for empty files
			if (content.trim() === "") {
				result.content = "[File exists but has empty contents]";
			}

			return result;
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`File not found: ${file_path}`);
			}
			if (error.code === "EACCES") {
				throw new Error(`Permission denied: ${file_path}`);
			}
			if (error.code === "EISDIR") {
				throw new Error(`Path is a directory, not a file: ${file_path}`);
			}
			throw new Error(`Failed to read file: ${error.message}`);
		}
	},
}) as LemmyTool;

/**
 * Write tool for writing files
 */
export const writeTool: LemmyTool = defineTool({
	name: "Write",
	description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
	category: "filesystem",
	schema: z.object({
		file_path: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
		content: z.string().describe("The content to write to the file"),
	}),
	execute: async (args, signal) => {
		const { file_path, content } = args;

		try {
			if (signal?.aborted) {
				throw new Error("File write was cancelled");
			}

			// Ensure directory exists
			const dir = dirname(file_path);
			try {
				await stat(dir);
			} catch (error) {
				throw new Error(`Directory does not exist: ${dir}`);
			}

			// Write file
			await writeFile(file_path, content, "utf-8");

			// Get file stats
			const stats = await stat(file_path);

			return {
				file_path,
				bytes_written: Buffer.byteLength(content, "utf-8"),
				lines_written: content.split("\n").length,
				created: new Date(stats.birthtime).toISOString(),
				modified: new Date(stats.mtime).toISOString(),
			};
		} catch (error) {
			if (error.code === "EACCES") {
				throw new Error(`Permission denied: ${file_path}`);
			}
			if (error.code === "ENOTDIR") {
				throw new Error(`Parent path is not a directory: ${dirname(file_path)}`);
			}
			throw new Error(`Failed to write file: ${error.message}`);
		}
	},
}) as LemmyTool;

/**
 * Edit tool for editing files
 */
export const editTool: LemmyTool = defineTool({
	name: "Edit",
	description: `Performs exact string replacements in files. 

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. 
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`. 
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
	category: "filesystem",
	schema: z.object({
		file_path: z.string().describe("The absolute path to the file to modify"),
		old_string: z.string().describe("The text to replace"),
		new_string: z.string().describe("The text to replace it with (must be different from old_string)"),
		replace_all: z.boolean().default(false).describe("Replace all occurences of old_string (default false)"),
	}),
	execute: async (args, signal) => {
		const { file_path, old_string, new_string, replace_all } = args;

		if (old_string === new_string) {
			throw new Error("old_string and new_string cannot be the same");
		}

		try {
			if (signal?.aborted) {
				throw new Error("File edit was cancelled");
			}

			// Read current content
			const content = await readFile(file_path, "utf-8");

			// Check if old_string exists
			if (!content.includes(old_string)) {
				throw new Error(`String not found in file: "${old_string.slice(0, 100)}..."`);
			}

			let newContent: string;
			let replacements: number;

			if (replace_all) {
				// Replace all occurrences
				const regex = new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
				newContent = content.replace(regex, new_string);
				replacements = (content.match(regex) || []).length;
			} else {
				// Replace first occurrence only
				const occurrences = content.split(old_string).length - 1;
				if (occurrences > 1) {
					throw new Error(
						`String "${old_string.slice(0, 50)}..." appears ${occurrences} times. Use replace_all=true or provide more context to make it unique.`,
					);
				}
				newContent = content.replace(old_string, new_string);
				replacements = 1;
			}

			// Write the modified content
			await writeFile(file_path, newContent, "utf-8");

			return {
				file_path,
				replacements_made: replacements,
				old_string_length: old_string.length,
				new_string_length: new_string.length,
				size_change: new_string.length - old_string.length,
			};
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`File not found: ${file_path}`);
			}
			throw new Error(`Failed to edit file: ${error.message}`);
		}
	},
}) as LemmyTool;

/**
 * MultiEdit tool for multiple edits
 */
export const multiEditTool: LemmyTool = defineTool({
	name: "MultiEdit",
	description: `This is a tool for making multiple edits to a single file in one operation. It is built on top of the Edit tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the Edit tool when you need to make multiple edits to the same file.

Before using this tool:

1. Use the Read tool to understand the file's contents and context
2. Verify the directory path is correct

To make multiple file edits, provide the following:
1. file_path: The absolute path to the file to modify (must be absolute, not relative)
2. edits: An array of edit operations to perform, where each edit contains:
   - old_string: The text to replace (must match the file contents exactly, including all whitespace and indentation)
   - new_string: The edited text to replace the old_string
   - replace_all: Replace all occurences of old_string. This parameter is optional and defaults to false.

IMPORTANT:
- All edits are applied in sequence, in the order they are provided
- Each edit operates on the result of the previous edit
- All edits must be valid for the operation to succeed - if any edit fails, none will be applied
- This tool is ideal when you need to make several changes to different parts of the same file
- For Jupyter notebooks (.ipynb files), use the NotebookEdit instead`,
	category: "filesystem",
	schema: z.object({
		file_path: z.string().describe("The absolute path to the file to modify"),
		edits: z
			.array(
				z.object({
					old_string: z.string().describe("The text to replace"),
					new_string: z.string().describe("The text to replace it with"),
					replace_all: z
						.boolean()
						.default(false)
						.describe("Replace all occurences of old_string (default false)."),
				}),
			)
			.min(1)
			.describe("Array of edit operations to perform sequentially on the file"),
	}),
	execute: async (args, signal) => {
		const { file_path, edits } = args;

		try {
			if (signal?.aborted) {
				throw new Error("Multi-edit was cancelled");
			}

			// Read current content
			let content = await readFile(file_path, "utf-8");
			const originalContent = content;

			const results = [];

			// Apply each edit in sequence
			for (let i = 0; i < edits.length; i++) {
				const edit = edits[i];
				const { old_string, new_string, replace_all } = edit;

				if (old_string === new_string) {
					throw new Error(`Edit ${i + 1}: old_string and new_string cannot be the same`);
				}

				// Check if old_string exists
				if (!content.includes(old_string)) {
					throw new Error(`Edit ${i + 1}: String not found in file: "${old_string.slice(0, 100)}..."`);
				}

				let replacements: number;

				if (replace_all) {
					// Replace all occurrences
					const regex = new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
					const matches = content.match(regex) || [];
					content = content.replace(regex, new_string);
					replacements = matches.length;
				} else {
					// Replace first occurrence only
					const occurrences = content.split(old_string).length - 1;
					if (occurrences > 1) {
						throw new Error(
							`Edit ${i + 1}: String "${old_string.slice(0, 50)}..." appears ${occurrences} times. Use replace_all=true or provide more context to make it unique.`,
						);
					}
					content = content.replace(old_string, new_string);
					replacements = 1;
				}

				results.push({
					edit_number: i + 1,
					replacements_made: replacements,
					old_string_length: old_string.length,
					new_string_length: new_string.length,
				});

				if (signal?.aborted) {
					throw new Error("Multi-edit was cancelled");
				}
			}

			// Write the final content
			await writeFile(file_path, content, "utf-8");

			return {
				file_path,
				total_edits: edits.length,
				total_replacements: results.reduce((sum, r) => sum + r.replacements_made, 0),
				original_size: originalContent.length,
				final_size: content.length,
				size_change: content.length - originalContent.length,
				edit_results: results,
			};
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`File not found: ${file_path}`);
			}
			throw new Error(`Failed to perform multi-edit: ${error.message}`);
		}
	},
}) as LemmyTool;

/**
 * LS tool for listing directories
 */
export const lsTool: LemmyTool = defineTool({
	name: "LS",
	description:
		"Lists files and directories in a given path. The path parameter must be an absolute path, not a relative path. You can optionally provide an array of glob patterns to ignore with the ignore parameter. You should generally prefer the Glob and Grep tools, if you know which directories to search.",
	category: "filesystem",
	schema: z.object({
		path: z.string().describe("The absolute path to the directory to list (must be absolute, not relative)"),
		ignore: z.array(z.string()).optional().describe("List of glob patterns to ignore"),
	}),
	execute: async (args, signal) => {
		const { path, ignore = [] } = args;

		try {
			if (signal?.aborted) {
				throw new Error("Directory listing was cancelled");
			}

			// Check if path exists and is a directory
			const pathStat = await stat(path);
			if (!pathStat.isDirectory()) {
				throw new Error(`Path is not a directory: ${path}`);
			}

			// Read directory contents
			const entries = await readdir(path);

			const items = [];

			for (const entry of entries) {
				if (signal?.aborted) {
					throw new Error("Directory listing was cancelled");
				}

				// Check if entry should be ignored
				const shouldIgnore = ignore.some((pattern) => {
					// Simple glob pattern matching (could be enhanced)
					const regex = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
					return new RegExp(`^${regex}$`).test(entry);
				});

				if (shouldIgnore) {
					continue;
				}

				try {
					const entryPath = join(path, entry);
					const entryStat = await stat(entryPath);

					items.push({
						name: entry,
						type: entryStat.isDirectory() ? "directory" : "file",
						size: entryStat.size,
						modified: entryStat.mtime.toISOString(),
						permissions: entryStat.mode.toString(8),
					});
				} catch (error) {
					// Skip entries we can't stat (permission issues, etc.)
					items.push({
						name: entry,
						type: "unknown",
						error: error.message,
					});
				}
			}

			// Sort by type (directories first) then by name
			items.sort((a, b) => {
				if (a.type === "directory" && b.type !== "directory") return -1;
				if (b.type === "directory" && a.type !== "directory") return 1;
				return a.name.localeCompare(b.name);
			});

			return {
				path,
				total_items: items.length,
				ignored_patterns: ignore,
				items,
			};
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`Directory not found: ${path}`);
			}
			if (error.code === "EACCES") {
				throw new Error(`Permission denied: ${path}`);
			}
			throw new Error(`Failed to list directory: ${error.message}`);
		}
	},
}) as LemmyTool;
