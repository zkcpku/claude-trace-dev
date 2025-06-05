#!/usr/bin/env npx tsx

import path from "path";
import { callClaude } from "./call-claude.ts";
import { JavaType } from "./types.js";
import { createTypeIndex, CppType } from "./extract-cpp-types.js";

function createFuzzyMatchPrompt(
	typeName: string,
	typeDescription: string,
	javaFilePath: string,
	cppTypes: Map<string, CppType[]>,
): string {
	// Create a summary of available C++ header files for Claude to work with
	const headerList = Array.from(cppTypes.entries())
		.map(([typeName, types]) => {
			const mainType = types.find((t) => !t.isForwardDecl && !t.isFriend) || types[0];
			return mainType.file;
		})
		.filter((file, index, arr) => arr.indexOf(file) === index) // remove duplicates
		.sort()
		.join(", ");

	return `TASK: Find if Java type "${typeName}" was renamed in C++.

Java Type: ${typeName}
Description: ${typeDescription}
File: ${javaFilePath}

Available C++ headers: ${headerList}

STEP-BY-STEP PROCESS:

STEP 1: Look for exact name variations of "${typeName}"
- Check for: ${typeName}.h, ${typeName}Impl.h, Abstract${typeName}.h, ${typeName}Base.h
- Check for: shortened versions (e.g., "Updatable" → "Update.h")
- Check for: expanded versions (e.g., "Update" → "Updatable.h") 
- Check for: case variations

STEP 2: If no name variations found, look for semantic equivalents
- Read the description: "${typeDescription}"
- Find C++ headers that would serve the same purpose
- Focus on functional equivalence, not name similarity

STEP 3: Make decision
- If you found a C++ type that represents the same concept (either name variation or semantic equivalent): respond with that header filename
- If no equivalent exists: respond "NO_MATCH"

CRITICAL: RESPOND WITH ONLY ONE WORD
- If match found: just the header filename (e.g., "Timeline.h")  
- If no match: just "NO_MATCH"
- NO explanations, NO reasoning, NO extra text

VALID RESPONSES: "Timeline.h", "AttachmentTimeline.h", "NO_MATCH"
INVALID RESPONSES: "Looking for...", "STEP 1:", "The answer is Timeline.h"`;
}

export async function mapJavaTypeToCpp(
	spineRuntimesDir: string,
	javaType: JavaType,
	changeStatus: string,
	javaFilePath: string,
): Promise<JavaType> {
	try {
		let typeName = javaType.name;

		// Handle special case: deleted files
		if (typeName === "DELETED_FILE") {
			return { ...javaType, action: "no_action_needed" };
		}

		// If Java file was added, all types in it are new - create C++ files immediately
		if (changeStatus === "added") {
			const headerPath = `spine-cpp/spine-cpp/include/spine/${typeName}.h`;
			const sourcePath = javaType.type === "enum" ? null : `spine-cpp/spine-cpp/src/spine/${typeName}.cpp`;

			console.log(
				`      ✓ New ${javaType.type}: ${typeName} → ${headerPath}${sourcePath ? ` + ${sourcePath}` : " (header-only)"}`,
			);

			return {
				...javaType,
				cppHeader: headerPath,
				cppSource: sourcePath,
				filesExist: false,
				action: "create_new_files",
			};
		}

		// Create C++ type index
		const cppTypes = createTypeIndex(spineRuntimesDir);

		// Check for exact match first
		const exactMatch = cppTypes.get(typeName);
		if (exactMatch) {
			const mainType = exactMatch.find((t) => !t.isForwardDecl && !t.isFriend) || exactMatch[0];
			const baseName = path.basename(mainType.file, ".h");
			const headerPath = `spine-cpp/spine-cpp/include/spine/${mainType.file}`;
			const sourcePath = `spine-cpp/spine-cpp/src/spine/${baseName}.cpp`;

			console.log(`      ✓ Exact match found: ${typeName} → ${mainType.file}`);

			return {
				...javaType,
				cppHeader: headerPath,
				cppSource: sourcePath,
				filesExist: true,
				action: changeStatus === "deleted" ? "delete_files" : "update_existing",
			};
		}

		// Try case-insensitive exact match
		const caseInsensitiveMatch = Array.from(cppTypes.entries()).find(
			([name]) => name.toLowerCase() === typeName.toLowerCase(),
		);

		if (caseInsensitiveMatch) {
			const [matchedName, types] = caseInsensitiveMatch;
			const mainType = types.find((t) => !t.isForwardDecl && !t.isFriend) || types[0];
			const baseName = path.basename(mainType.file, ".h");
			const headerPath = `spine-cpp/spine-cpp/include/spine/${mainType.file}`;
			const sourcePath = `spine-cpp/spine-cpp/src/spine/${baseName}.cpp`;

			console.log(`      ✓ Case-insensitive match: ${typeName} → ${matchedName} (${mainType.file})`);

			return {
				...javaType,
				cppHeader: headerPath,
				cppSource: sourcePath,
				filesExist: true,
				action: changeStatus === "deleted" ? "delete_files" : "rename_and_update",
			};
		}

		// Use Claude for intelligent fuzzy matching with the type index
		if (cppTypes.size > 0) {
			try {
				let attempts = 0;
				const maxAttempts = 3;
				const previousSuggestions: string[] = [];
				let fuzzyMatchName: string | null = null;

				while (attempts < maxAttempts && !fuzzyMatchName) {
					attempts++;
					console.log(`      [Attempt ${attempts}/${maxAttempts}] Asking Claude for fuzzy match...`);

					let prompt = createFuzzyMatchPrompt(typeName, javaType.description, javaFilePath, cppTypes);

					// Add feedback about previous wrong suggestions
					if (previousSuggestions.length > 0) {
						prompt += `\n\nNOTE: Your previous suggestions were not found: ${previousSuggestions.map((s) => `"${s}"`).join(", ")}. Please check the exact type name from the list above.`;
					}

					const claudeResponse = await callClaude(prompt, { timeout: 300000 }); // 5 minute timeout
					let response = claudeResponse.trim();
					console.log(`      Claude suggested: "${response}"`);

					// If Claude mentioned NO_MATCH anywhere, respect that decision
					if (claudeResponse.includes("NO_MATCH")) {
						response = "NO_MATCH";
						console.log(`      Claude indicated NO_MATCH - respecting decision`);
					}

					if (response === "NO_MATCH") {
						break;
					}

					// Extract type name from header filename (e.g., "Timeline.h" → "Timeline")
					let matchedTypeName: string = response;
					if (response.endsWith(".h")) {
						matchedTypeName = path.basename(response, ".h");
					} else {
						// Try to extract from verbose response
						const lines = response.split("\n");
						const lastLine = lines[lines.length - 1].trim();
						if (lastLine.endsWith(".h")) {
							matchedTypeName = path.basename(lastLine, ".h");
							console.log(`      Extracted header from response: "${lastLine}" → "${matchedTypeName}"`);
						} else {
							// Try to find any valid header filename in the response
							const allTypeNames = Array.from(cppTypes.keys());
							let found = false;
							for (const typeName of allTypeNames) {
								if (claudeResponse.includes(`${typeName}.h`)) {
									matchedTypeName = typeName;
									console.log(`      Found header in response: "${typeName}.h"`);
									found = true;
									break;
								}
							}
							if (!found) {
								matchedTypeName = response;
							}
						}
					}

					if (cppTypes.has(matchedTypeName)) {
						fuzzyMatchName = matchedTypeName;
						break;
					}

					console.log(`      Type "${matchedTypeName}" not found in C++ types`);
					previousSuggestions.push(response);
				}

				if (fuzzyMatchName) {
					const matchedTypes = cppTypes.get(fuzzyMatchName)!;
					const mainType = matchedTypes.find((t) => !t.isForwardDecl && !t.isFriend) || matchedTypes[0];
					const baseName = path.basename(mainType.file, ".h");
					const headerPath = `spine-cpp/spine-cpp/include/spine/${mainType.file}`;
					const sourcePath = `spine-cpp/spine-cpp/src/spine/${baseName}.cpp`;

					console.log(`      ✓ Fuzzy match: ${typeName} → ${fuzzyMatchName} (${mainType.file})`);

					return {
						...javaType,
						cppHeader: headerPath,
						cppSource: sourcePath,
						filesExist: true,
						action: changeStatus === "deleted" ? "delete_files" : "rename_and_update",
					};
				}
			} catch (error) {
				console.log(`      ⚠ Claude matching failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// No match found - new files needed
		if (changeStatus === "deleted") {
			// This is unusual - deleted Java file but no C++ files found
			return {
				...javaType,
				cppHeader: `spine-cpp/spine-cpp/include/spine/${typeName}.h`,
				cppSource: `spine-cpp/spine-cpp/src/spine/${typeName}.cpp`,
				filesExist: false,
				action: "no_action_needed",
				portingResult: "success",
				portingNotes: "No corresponding C++ files found for deleted Java file",
			};
		} else {
			return {
				...javaType,
				cppHeader: `spine-cpp/spine-cpp/include/spine/${typeName}.h`,
				cppSource: `spine-cpp/spine-cpp/src/spine/${typeName}.cpp`,
				filesExist: false,
				action: "create_new_files",
			};
		}
	} catch (error) {
		throw new Error(
			`Failed to map Java type ${javaType.name}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 7) {
		console.error(
			"Usage: npx tsx map-java-to-cpp.ts <spine-runtimes-dir> <type-name> <type-kind> <type-description> <start-line> <change-status> <java-file-path>",
		);
		console.error("");
		console.error("Parameters:");
		console.error("  spine-runtimes-dir: Path to spine-runtimes directory");
		console.error("  type-name: Name of the Java type");
		console.error("  type-kind: class, interface, or enum");
		console.error("  type-description: Brief description of what the type does");
		console.error("  start-line: Start line number of the type");
		console.error("  change-status: added, modified, or deleted");
		console.error("  java-file-path: Path to the Java file containing the type");
		console.error("");
		console.error("Examples:");
		console.error(
			'  npx tsx map-java-to-cpp.ts /Users/badlogic/workspaces/spine-runtimes Animation class "Main class that manages skeletal animation data" 45 modified src/Animation.java',
		);
		console.error(
			'  npx tsx map-java-to-cpp.ts /Users/badlogic/workspaces/spine-runtimes MixBlend enum "Blend modes for animations" 10 added src/MixBlend.java',
		);
		process.exit(1);
	}

	const [spineRuntimesDir, typeName, typeKind, typeDescription, startLine, changeStatus, javaFilePath] = args;

	const javaType: JavaType = {
		name: typeName,
		type: typeKind as "class" | "interface" | "enum",
		description: typeDescription,
		startLine: parseInt(startLine),
		endLine: parseInt(startLine) + 10, // dummy
		cppHeader: "",
		cppSource: null,
		filesExist: false,
		action: "update_existing",
	};

	mapJavaTypeToCpp(spineRuntimesDir, javaType, changeStatus, javaFilePath)
		.then((result) => {
			// Output as JSON
			console.log(JSON.stringify(result, null, 2));
		})
		.catch((error) => {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}

export default { mapJavaTypeToCpp };
