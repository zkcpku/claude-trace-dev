#!/usr/bin/env npx tsx

import fs from "fs";
import { ChangeSet, JavaType } from "./types.js";

interface ParsedJavaType {
	name: string;
	type: "class" | "interface" | "enum";
	startLine: number;
	endLine: number | null;
	level: number;
}

export function extractJavaTypesFromChangeSet(changeSet: ChangeSet): ChangeSet {
	const updatedFiles = changeSet.files.map((file) => {
		try {
			const extractedTypes = extractJavaTypesFromFile(file.filePath);

			return {
				...file,
				javaTypes: extractedTypes,
			};
		} catch (error) {
			console.error(`Error extracting types from ${file.filePath}:`, error);
			return {
				...file,
				javaTypes: [],
			};
		}
	});

	return {
		...changeSet,
		files: updatedFiles,
	};
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

function extractJavaTypesFromFile(javaFilePath: string): JavaType[] {
	// Check if file exists
	if (!fs.existsSync(javaFilePath)) {
		throw new Error(`File does not exist: ${javaFilePath}`);
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
		return [];
	}

	// Extract types
	const results: JavaType[] = types.map((type) => {
		return {
			name: type.name,
			type: type.type,
			startLine: type.startLine,
			endLine: type.endLine || lines.length,
			targetFiles: [], // Will be filled by mapping phase
			filesExist: false, // Will be filled by mapping phase
		};
	});

	return results;
}
