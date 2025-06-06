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

	// Extract package name from file content
	let packageName = "";
	for (const line of lines) {
		const packageMatch = line.match(/^package\s+([\w.]+);/);
		if (packageMatch) {
			packageName = packageMatch[1];
			break;
		}
	}
	const types: ParsedJavaType[] = [];

	// Find all public type declarations (including indented inner classes)
	lines.forEach((line, i) => {
		const match = line.match(
			/(?:public\s+static|static\s+public|public)\s+(?:final\s+|abstract\s+)*(class|interface|enum)\s+(\w+)/,
		);
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

	// Build fully qualified names for all types based on nesting level
	const results: JavaType[] = types.map((type, currentIndex) => {
		let fullName: string;

		if (type.level === 0) {
			// Top-level type: packageName.typeName
			fullName = `${packageName}.${type.name}`;
		} else {
			// Inner type: find immediate parent and build name
			let parentType: ParsedJavaType | undefined;
			for (let i = currentIndex - 1; i >= 0; i--) {
				if (types[i].level === type.level - 1) {
					parentType = types[i];
					break;
				}
			}

			if (parentType) {
				const parentFullName = `${packageName}.${parentType.name}`;
				fullName = `${parentFullName}$${type.name}`;
			} else {
				// Fallback
				fullName = `${packageName}.${type.name}`;
			}
		}

		return {
			name: type.name,
			fullName,
			type: type.type,
			startLine: type.startLine,
			endLine: type.endLine || lines.length,
			targetFiles: [], // Will be filled by mapping phase
			filesExist: false, // Will be filled by mapping phase
		};
	});

	return results;
}
