#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { CppTypeMapping } from "./types.js";

interface CppType {
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

export function createCppTypeMapping(spineCppDir: string): CppTypeMapping {
	const includeDir = path.join(spineCppDir, "spine-cpp", "include", "spine");
	const typeMap = extractAllCppTypes(includeDir);

	// Convert to simple mapping of type name -> absolute header path
	const mapping: CppTypeMapping = {};

	for (const [typeName, types] of typeMap.entries()) {
		// Find the main declaration (not forward/friend)
		const mainDecl = types.find((t) => !t.isForwardDecl && !t.isFriend);
		if (mainDecl) {
			mapping[typeName] = path.join(includeDir, mainDecl.file);
		}
	}

	return mapping;
}

export default { createCppTypeMapping };
