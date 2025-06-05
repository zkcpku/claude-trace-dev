#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { ChangeSet, CppTypeMapping } from "./types.js";

function generateSuggestedPaths(typeName: string, type: "class" | "interface" | "enum", spineCppDir: string): string[] {
	const headerPath = path.join(spineCppDir, "spine-cpp", "include", "spine", `${typeName}.h`);

	if (type === "enum" || type === "interface") {
		// Header-only types
		return [headerPath];
	} else {
		// Class with header + source
		const sourcePath = path.join(spineCppDir, "spine-cpp", "src", "spine", `${typeName}.cpp`);
		return [headerPath, sourcePath];
	}
}

export function mapJavaTypesToCpp(changeSet: ChangeSet, cppTypeMapping: CppTypeMapping): ChangeSet {
	const updatedFiles = changeSet.files.map((file) => {
		const updatedTypes = file.javaTypes.map((javaType) => {
			// Check if C++ type exists using mapping
			const existingHeaderPath = cppTypeMapping[javaType.name];

			if (existingHeaderPath) {
				// Type exists - update existing files
				const targetFiles = [existingHeaderPath];

				// Add corresponding source file if it's a class
				if (javaType.type === "class") {
					const headerDir = path.dirname(existingHeaderPath);
					const sourceDir = headerDir.replace("/include/spine", "/src/spine");
					const sourcePath = path.join(sourceDir, `${javaType.name}.cpp`);

					// Check if source file actually exists
					if (fs.existsSync(sourcePath)) {
						targetFiles.push(sourcePath);
					}
				}

				return {
					...javaType,
					targetFiles,
					filesExist: true,
				};
			} else {
				// Type doesn't exist - suggest new file paths
				const targetFiles = generateSuggestedPaths(javaType.name, javaType.type, changeSet.metadata.spineCppDir);

				return {
					...javaType,
					targetFiles,
					filesExist: false,
				};
			}
		});

		return {
			...file,
			javaTypes: updatedTypes,
		};
	});

	return {
		...changeSet,
		files: updatedFiles,
	};
}

export default { mapJavaTypesToCpp };
