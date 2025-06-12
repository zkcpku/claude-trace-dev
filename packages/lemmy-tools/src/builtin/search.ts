import { z } from "zod";
import { readFile } from "fs/promises";
import fastGlob from "fast-glob";
import { defineTool } from "@mariozechner/lemmy";
import type { LemmyTool } from "../types.js";

/**
 * Glob tool for file pattern matching
 */
export const globTool: LemmyTool = defineTool({
	name: "Glob",
	description: `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.`,
	category: "search",
	schema: z.object({
		pattern: z.string().describe("The glob pattern to match files against"),
		path: z
			.string()
			.optional()
			.describe(
				'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
			),
	}),
	execute: async (args, signal) => {
		const { pattern, path } = args;

		try {
			if (signal?.aborted) {
				throw new Error("Glob search was cancelled");
			}

			// Build search options
			const options: fastGlob.Options = {
				cwd: path || process.cwd(),
				absolute: true,
				stats: true,
				onlyFiles: true,
				ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**", "**/.cache/**"],
			};

			// Perform glob search
			const entries = await fastGlob(pattern, options);

			if (signal?.aborted) {
				throw new Error("Glob search was cancelled");
			}

			// Sort by modification time (newest first)
			const sortedEntries = entries
				.filter((entry) => entry.stats)
				.sort((a, b) => b.stats!.mtime.getTime() - a.stats!.mtime.getTime())
				.map((entry) => ({
					path: entry.path,
					size: entry.stats!.size,
					modified: entry.stats!.mtime.toISOString(),
					name: entry.name,
				}));

			return {
				pattern,
				search_path: path || process.cwd(),
				total_matches: sortedEntries.length,
				files: sortedEntries,
			};
		} catch (error) {
			throw new Error(`Glob search failed: ${error.message}`);
		}
	},
}) as LemmyTool;

/**
 * Grep tool for content search
 */
export const grepTool: LemmyTool = defineTool({
	name: "Grep",
	description: `\n- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Bash tool with \`rg\` (ripgrep) directly. Do NOT use \`grep\`.
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`,
	category: "search",
	schema: z.object({
		pattern: z.string().describe("The regular expression pattern to search for in file contents"),
		path: z.string().optional().describe("The directory to search in. Defaults to the current working directory."),
		include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
	}),
	execute: async (args, signal) => {
		const { pattern, path = process.cwd(), include } = args;

		try {
			if (signal?.aborted) {
				throw new Error("Grep search was cancelled");
			}

			// Create regex from pattern
			let regex: RegExp;
			try {
				regex = new RegExp(pattern, "gm");
			} catch (error) {
				throw new Error(`Invalid regex pattern: ${error.message}`);
			}

			// Get files to search
			let filePattern = "**/*";
			if (include) {
				filePattern = include.includes("/") ? include : `**/${include}`;
			}

			const globOptions: fastGlob.Options = {
				cwd: path,
				absolute: true,
				stats: true,
				onlyFiles: true,
				ignore: [
					"**/node_modules/**",
					"**/.git/**",
					"**/dist/**",
					"**/build/**",
					"**/.next/**",
					"**/.cache/**",
					"**/*.png",
					"**/*.jpg",
					"**/*.jpeg",
					"**/*.gif",
					"**/*.ico",
					"**/*.svg",
					"**/*.pdf",
					"**/*.zip",
					"**/*.tar.gz",
					"**/*.exe",
					"**/*.bin",
				],
			};

			const files = await fastGlob(filePattern, globOptions);

			if (signal?.aborted) {
				throw new Error("Grep search was cancelled");
			}

			const matches = [];

			// Search each file
			for (let i = 0; i < files.length; i++) {
				if (signal?.aborted) {
					throw new Error("Grep search was cancelled");
				}

				const file = files[i];

				try {
					// Read file content
					const content = await readFile(file.path, "utf-8");

					// Test if pattern matches
					if (regex.test(content)) {
						// Get match details
						const fileMatches = [];
						const lines = content.split("\n");

						for (let lineNum = 0; lineNum < lines.length; lineNum++) {
							const line = lines[lineNum];
							const lineMatches = [...line.matchAll(new RegExp(pattern, "g"))];

							if (lineMatches.length > 0) {
								fileMatches.push({
									line_number: lineNum + 1,
									line_content: line.trim(),
									matches: lineMatches.map((match) => ({
										text: match[0],
										start: match.index,
										end: match.index! + match[0].length,
									})),
								});
							}
						}

						matches.push({
							path: file.path,
							name: file.name,
							size: file.stats!.size,
							modified: file.stats!.mtime.toISOString(),
							match_count: fileMatches.length,
							matches: fileMatches.slice(0, 10), // Limit to first 10 matches per file
						});
					}
				} catch (error) {
					// Skip files we can't read (binary files, permission issues, etc.)
					continue;
				}
			}

			// Sort by modification time (newest first)
			matches.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

			return {
				pattern,
				search_path: path,
				include_pattern: include,
				total_files_searched: files.length,
				files_with_matches: matches.length,
				matches,
			};
		} catch (error) {
			throw new Error(`Grep search failed: ${error.message}`);
		}
	},
}) as LemmyTool;
