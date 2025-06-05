#!/usr/bin/env npx tsx

import fs from "fs";
import { callClaudeMultiple } from "./call-claude.ts";
import { JavaType } from "./types.js";

function createJavaTypeAnalysisPrompt(
	filePath: string,
	typeName: string,
	startLine: number,
	endLine: number,
	context: string,
): string {
	return `Analyze this Java type declaration and provide a brief description (1-2 sentences) of what it does/represents.

File: ${filePath}
Type: ${typeName}
Lines: ${startLine}-${endLine}

Source code:
\`\`\`java
${context}
\`\`\`

Respond with only the description, no additional formatting or explanation.`;
}

interface ParsedJavaType {
	name: string;
	type: "class" | "interface" | "enum";
	startLine: number;
	endLine: number | null;
	level: number;
}

export interface ExtractionResult {
	filePath: string;
	status: "success" | "deleted" | "no_types" | "error";
	types: JavaType[];
	error?: string;
}

export interface ExtractionOptions {
	onTypeExtracted?: (filePath: string, type: JavaType, index: number, total: number) => void;
}

function findTypeBoundaries(types: ParsedJavaType[], lines: string[]): void {
	// Calculate end lines by finding matching braces
	for (const type of types) {
		let braceCount = 0;
		let foundStart = false;

		for (let lineIdx = type.startLine - 1; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];

			// Count braces
			for (const char of line) {
				if (char === "{") {
					braceCount++;
					foundStart = true;
				} else if (char === "}") {
					braceCount--;
					if (foundStart && braceCount === 0) {
						type.endLine = lineIdx + 1;
						break;
					}
				}
			}

			if (type.endLine) break;
		}

		// Fallback if no closing brace found
		if (type.endLine === null) {
			type.endLine = lines.length;
		}
	}

	// Find Javadoc for each type by scanning upwards to extend startLine
	for (const type of types) {
		// Scan upwards from type declaration to find Javadoc start
		for (let lineIdx = type.startLine - 2; lineIdx >= 0; lineIdx--) {
			const line = lines[lineIdx].trim();

			if (line.startsWith("/**") || line.startsWith("//")) {
				// Found comment start, extend the type's startLine to include it
				type.startLine = lineIdx + 1;
				break;
			} else if (line === "" || line.startsWith("@") || line === "*/") {
				// Empty line, annotation, or comment continuation - keep scanning
				continue;
			} else {
				// Hit non-comment/annotation code, stop scanning
				break;
			}
		}
	}
}

function cleanTypeContext(typeLines: string[], typeName: string): string {
	const cleanedLines: string[] = [];
	let skipInner = false;
	let innerBraceCount = 0;

	for (let i = 0; i < typeLines.length; i++) {
		const line = typeLines[i];

		// Check if this line starts a public inner type (but not the first type declaration)
		const isInnerType =
			i > 0 && line.match(/public\s+(?:static\s+|final\s+|abstract\s+)*(?:class|interface|enum)\s+\w+/);

		if (isInnerType && !skipInner) {
			// Check if this inner type is different from our current type
			const match = line.match(/(?:class|interface|enum)\s+(\w+)/);
			if (match && match[1] !== typeName) {
				skipInner = true;
				innerBraceCount = 0;
				cleanedLines.push("    // ... inner types removed ...");
			} else {
				cleanedLines.push(line);
			}
		} else if (skipInner) {
			// Count braces to know when inner type ends
			for (const char of line) {
				if (char === "{") innerBraceCount++;
				else if (char === "}") innerBraceCount--;
			}

			// If we've closed all braces for this inner type, stop skipping
			if (innerBraceCount <= 0) {
				skipInner = false;
			}
			// Skip this line (it's part of the inner type we're removing)
		} else {
			cleanedLines.push(line);
		}
	}

	return cleanedLines.join("\n");
}

export async function extractJavaTypes(
	javaFilePath: string,
	options: ExtractionOptions = {},
): Promise<ExtractionResult> {
	try {
		// Check if file exists (handle deleted files)
		if (!fs.existsSync(javaFilePath)) {
			return {
				filePath: javaFilePath,
				status: "deleted",
				types: [
					{
						name: "DELETED_FILE",
						type: "class", // dummy value for deleted files
						description: "Cannot extract types from deleted file",
						startLine: 0,
						endLine: 0,
						cppHeader: "",
						cppSource: null,
						filesExist: false,
						action: "no_action_needed",
					},
				],
			};
		}

		// Find type declarations with start/end boundaries
		const content = fs.readFileSync(javaFilePath, "utf8");
		const lines = content.split("\n");
		const types: ParsedJavaType[] = [];

		// Find all public type declarations (including indented inner classes)
		lines.forEach((line, i) => {
			const match = line.match(/public\s+(?:static\s+|final\s+|abstract\s+)*(class|interface|enum)\s+(\w+)/);
			if (match) {
				const indentMatch = line.match(/^\s*/);
				types.push({
					name: match[2],
					type: match[1] as "class" | "interface" | "enum",
					startLine: i + 1,
					endLine: null,
					level: indentMatch ? indentMatch[0].length / 2 : 0, // Approximate nesting level
				});
			}
		});

		// Find type boundaries (end lines and extend start lines to include Javadoc)
		findTypeBoundaries(types, lines);

		if (types.length === 0) {
			return {
				filePath: javaFilePath,
				status: "no_types",
				types: [],
			};
		}

		// Prepare all prompts for parallel Claude calls
		const prompts = types.map((type): string => {
			// Extract type definition including Javadoc but removing OTHER inner types
			const typeLines = lines.slice(type.startLine - 1, type.endLine || lines.length);
			const context = cleanTypeContext(typeLines, type.name);

			// Limit context to 50 lines
			const contextLines = context.split("\n");
			const limitedContext =
				contextLines.length > 50
					? contextLines.slice(0, 50).join("\n") + "\n// ... truncated to 50 lines ..."
					: context;

			return createJavaTypeAnalysisPrompt(
				javaFilePath,
				type.name,
				type.startLine,
				type.endLine || lines.length,
				limitedContext,
			);
		});

		// Execute Claude calls in batches of 1 (can't get
		// Claude Code to run in parallel in headless mode)
		const batchSize = 10;
		const results: JavaType[] = [];

		for (let i = 0; i < prompts.length; i += batchSize) {
			const batch = prompts.slice(i, i + batchSize);
			const batchTypes = types.slice(i, i + batchSize);

			const batchResults = await callClaudeMultiple(batch);

			// Collect results for this batch
			for (let j = 0; j < batchResults.length; j++) {
				const type = batchTypes[j];
				const description = batchResults[j];

				const cleanDescription = description.trim().replace(/\n/g, " ");

				const javaType: JavaType = {
					name: type.name,
					type: type.type,
					description: cleanDescription,
					startLine: type.startLine,
					endLine: type.endLine || lines.length,
					cppHeader: "", // Will be filled by mapping phase
					cppSource: null, // Will be filled by mapping phase
					filesExist: false, // Will be filled by mapping phase
					action: "update_existing", // Will be determined by mapping phase
				};

				results.push(javaType);

				// Call callback immediately when type is processed
				if (options.onTypeExtracted) {
					options.onTypeExtracted(javaFilePath, javaType, results.length - 1, types.length);
				}
			}
		}

		return {
			filePath: javaFilePath,
			status: "success",
			types: results,
		};
	} catch (error) {
		return {
			filePath: javaFilePath,
			status: "error",
			error: error instanceof Error ? error.message : String(error),
			types: [],
		};
	}
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.error("Usage: npx tsx extract-java-types.ts <java-file-path>");
		console.error("");
		console.error("Examples:");
		console.error(
			"  npx tsx extract-java-types.ts /Users/badlogic/workspaces/spine-runtimes/spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/Animation.java",
		);
		console.error(
			"  npx tsx extract-java-types.ts ../spine-runtimes/spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/Animation.java",
		);
		process.exit(1);
	}

	const [javaFilePath] = args;

	extractJavaTypes(javaFilePath)
		.then((result) => {
			// Output as JSON
			console.log(JSON.stringify(result, null, 2));
		})
		.catch((error) => {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}

export default { extractJavaTypes };
