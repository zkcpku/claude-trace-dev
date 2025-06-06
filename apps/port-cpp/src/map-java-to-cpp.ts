#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { ChangeSet, CppTypeMapping } from "./types.js";

function generateSuggestedPaths(typeName: string, type: "class" | "interface" | "enum", spineCppDir: string): string[] {
	const headerPath = path.join(spineCppDir, "spine-cpp", "include", "spine", `${typeName}.h`);

	if (type === "enum") {
		// Header-only types
		return [headerPath];
	} else {
		// Class and interface both need header + source (interfaces need .cpp for RTTI_IMPL)
		const sourcePath = path.join(spineCppDir, "spine-cpp", "src", "spine", `${typeName}.cpp`);
		return [headerPath, sourcePath];
	}
}

export function mapJavaTypesToCpp(changeSet: ChangeSet, cppTypeMapping: CppTypeMapping): ChangeSet {
	const updatedFiles = changeSet.files.map((file) => {
		const updatedTypes = file.javaTypes.map((javaType) => {
			// Check if C++ type exists using mapping
			const mappedHeaderPath = cppTypeMapping[javaType.name];

			if (mappedHeaderPath) {
				// Header file exists (mapping only contains existing files) - update existing files
				const targetFiles = [mappedHeaderPath];

				// Add corresponding source file if it's a class or interface (interfaces need .cpp for RTTI_IMPL)
				if (javaType.type === "class" || javaType.type === "interface") {
					const headerDir = path.dirname(mappedHeaderPath);
					const sourceDir = headerDir.replace("/include/spine", "/src/spine");
					const sourcePath = path.join(sourceDir, `${javaType.name}.cpp`);

					// Touch .cpp file if it doesn't exist (since .h exists, filesExist stays true)
					if (!fs.existsSync(sourcePath)) {
						fs.writeFileSync(sourcePath, "");
					}
					targetFiles.push(sourcePath);
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
