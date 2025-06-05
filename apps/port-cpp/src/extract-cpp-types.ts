#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";

export interface CppType {
	name: string;
	type: "class" | "enum" | "struct" | "typedef";
	file: string;
	isForwardDecl?: boolean;
	isFriend?: boolean;
	baseClass?: string;
}

export function extractCppTypesFromHeader(headerPath: string): CppType[] {
	const types: CppType[] = [];
	const content = fs.readFileSync(headerPath, "utf8");
	const lines = content.split("\n");
	const fileName = path.basename(headerPath);

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip comments and empty lines
		if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || !trimmed) {
			continue;
		}

		// Class declarations: class SP_API ClassName : public BaseClass
		const classMatch = trimmed.match(/^class\s+(?:SP_API\s+)?(\w+)(?:\s*:\s*public\s+(\w+))?/);
		if (classMatch) {
			types.push({
				name: classMatch[1],
				type: "class",
				file: fileName,
				baseClass: classMatch[2] || undefined,
				isForwardDecl: trimmed.endsWith(";"),
			});
			continue;
		}

		// Friend class declarations: friend class ClassName;
		const friendMatch = trimmed.match(/^friend\s+class\s+(\w+);/);
		if (friendMatch) {
			types.push({
				name: friendMatch[1],
				type: "class",
				file: fileName,
				isFriend: true,
			});
			continue;
		}

		// Enum declarations: enum ClassName or enum class ClassName
		const enumMatch = trimmed.match(/^enum(?:\s+class)?\s+(\w+)/);
		if (enumMatch) {
			types.push({
				name: enumMatch[1],
				type: "enum",
				file: fileName,
			});
			continue;
		}

		// Struct declarations: struct ClassName
		const structMatch = trimmed.match(/^struct\s+(?:SP_API\s+)?(\w+)/);
		if (structMatch) {
			types.push({
				name: structMatch[1],
				type: "struct",
				file: fileName,
			});
			continue;
		}

		// Typedef declarations: typedef ... ClassName;
		const typedefMatch = trimmed.match(/^typedef\s+.*\s+(\w+);$/);
		if (typedefMatch) {
			types.push({
				name: typedefMatch[1],
				type: "typedef",
				file: fileName,
			});
			continue;
		}
	}

	return types;
}

export function extractAllCppTypes(includeDir: string): Map<string, CppType[]> {
	const typeMap = new Map<string, CppType[]>();

	if (!fs.existsSync(includeDir)) {
		return typeMap;
	}

	const headerFiles = fs.readdirSync(includeDir).filter((f) => f.endsWith(".h"));

	for (const headerFile of headerFiles) {
		const headerPath = path.join(includeDir, headerFile);
		const types = extractCppTypesFromHeader(headerPath);

		for (const type of types) {
			if (!typeMap.has(type.name)) {
				typeMap.set(type.name, []);
			}
			typeMap.get(type.name)!.push(type);
		}
	}

	// Filter out types that only have friend/forward declarations
	for (const [typeName, types] of typeMap.entries()) {
		const hasRealDeclaration = types.some((t) => !t.isForwardDecl && !t.isFriend);
		if (!hasRealDeclaration) {
			typeMap.delete(typeName);
		}
	}

	return typeMap;
}

export function createTypeIndex(spineRuntimesDir: string): Map<string, CppType[]> {
	const includeDir = path.join(spineRuntimesDir, "spine-cpp", "spine-cpp", "include", "spine");
	return extractAllCppTypes(includeDir);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.error("Usage: npx tsx extract-cpp-types.ts <spine-runtimes-dir> [type-name]");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx extract-cpp-types.ts /Users/badlogic/workspaces/spine-runtimes");
		console.error("  npx tsx extract-cpp-types.ts /Users/badlogic/workspaces/spine-runtimes Animation");
		process.exit(1);
	}

	const [spineRuntimesDir, typeName] = args;
	const typeIndex = createTypeIndex(spineRuntimesDir);

	if (typeName) {
		// Show specific type
		const matches = typeIndex.get(typeName);
		if (matches) {
			console.log(`Found ${matches.length} matches for "${typeName}":`);
			matches.forEach((match) => {
				console.log(
					`  ${match.type} ${match.name} in ${match.file}${match.baseClass ? ` : ${match.baseClass}` : ""}${match.isForwardDecl ? " (forward decl)" : ""}${match.isFriend ? " (friend)" : ""}`,
				);
			});
		} else {
			console.log(`No matches found for "${typeName}"`);
		}
	} else {
		// Show all types
		console.log(
			`Found ${typeIndex.size} unique type names across ${Array.from(typeIndex.values()).flat().length} declarations:`,
		);

		const sortedTypes = Array.from(typeIndex.entries()).sort(([a], [b]) => a.localeCompare(b));

		for (const [typeName, types] of sortedTypes) {
			const mainDecl = types.find((t) => !t.isForwardDecl && !t.isFriend) || types[0];
			const forwardCount = types.filter((t) => t.isForwardDecl || t.isFriend).length;
			console.log(
				`  ${mainDecl.type} ${typeName} (${mainDecl.file})${forwardCount > 0 ? ` +${forwardCount} refs` : ""}`,
			);
		}
	}
}

export default { extractCppTypesFromHeader, extractAllCppTypes, createTypeIndex };
