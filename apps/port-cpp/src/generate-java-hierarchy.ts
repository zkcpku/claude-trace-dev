#!/usr/bin/env tsx

import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";

// Default spine-runtimes path
const DEFAULT_SPINE_RUNTIMES_PATH = "/Users/badlogic/workspaces/spine-runtimes";

// Get spine-runtimes path from CLI arg or use default
const spineRuntimesPath = process.argv[2] || DEFAULT_SPINE_RUNTIMES_PATH;
const SPINE_LIBGDX_PATH = `${spineRuntimesPath}/spine-libgdx`;
const BUILD_CLASSES_PATH = `${spineRuntimesPath}/spine-libgdx/spine-libgdx/build/classes/java/main`;

interface ClassInfo {
	name: string;
	fullName: string;
	extends?: string;
	implements: string[];
	isInterface: boolean;
	isAbstract: boolean;
	isGeneric: boolean;
}

function runCommand(command: string, cwd?: string): string {
	try {
		return execSync(command, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error: any) {
		console.error(`Command failed: ${command}`);
		console.error(error.message);
		throw error;
	}
}

function buildProject(): void {
	console.log("🔨 Building spine-libgdx project...");
	runCommand("./gradlew compileJava", SPINE_LIBGDX_PATH);
	console.log("✅ Build completed");
}

function findClassFiles(): string[] {
	console.log("🔍 Finding compiled class files...");

	const findOutput = runCommand(`find "${BUILD_CLASSES_PATH}" -name "*.class"`);
	const classFiles = findOutput
		.trim()
		.split("\n")
		.filter((line) => line.length > 0);

	const classNames = classFiles
		.map((file) => {
			const relativePath = file.replace(BUILD_CLASSES_PATH + "/", "");
			return relativePath
				.replace(/\.class$/, "")
				.replace(/\$/g, ".")
				.replace(/\//g, ".");
		})
		.filter((name) => name.startsWith("com.esotericsoftware.spine"))
		.filter((name) => !name.includes("$"))
		.sort();

	console.log(`📦 Found ${classNames.length} classes`);
	return classNames;
}

function parseJavapOutput(className: string): ClassInfo | null {
	try {
		const output = runCommand(`javap -cp "${BUILD_CLASSES_PATH}" "${className}"`);

		const lines = output
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) return null;

		const classDeclarationLine = lines.find(
			(line) => line.includes("class ") || line.includes("interface ") || line.includes("enum "),
		);

		if (!classDeclarationLine) return null;

		const isInterface = classDeclarationLine.includes("interface ");
		const isAbstract = classDeclarationLine.includes("abstract ");
		const name = className.split(".").pop() || className;

		// Regular format: [modifiers] [class|interface] [full.class.Name]<generic> [extends Something] [implements A, B] {

		// Check if generic by looking for < after the class name
		const isGeneric = classDeclarationLine.includes(`${className}<`);

		// Parse extends - find "extends" keyword and get the next word
		let extendsClass: string | undefined;
		const extendsMatch = classDeclarationLine.match(/extends\s+([^\s<{,]+)/);
		if (extendsMatch) {
			extendsClass = extendsMatch[1];
		}

		// Parse implements - find "implements" keyword and get everything until {
		const implementsClasses: string[] = [];
		const implementsMatch = classDeclarationLine.match(/implements\s+([^{]+)/);
		if (implementsMatch) {
			const implementsList = implementsMatch[1]
				.split(",")
				.map((s) => s.trim().replace(/<.*?>/, ""))
				.filter((s) => s.length > 0);
			implementsClasses.push(...implementsList);
		}

		return {
			name,
			fullName: className,
			extends: extendsClass,
			implements: implementsClasses,
			isInterface,
			isAbstract: isAbstract || isInterface,
			isGeneric,
		};
	} catch (error) {
		console.warn(`⚠️  Failed to parse class ${className}: ${error}`);
		return null;
	}
}

function generateHierarchy(classes: ClassInfo[]): string {
	const md: string[] = [];

	md.push("# Spine Java Class Hierarchy\n");
	md.push(`*Generated on ${new Date().toISOString()}*\n`);
	md.push("```");

	// Filter out anonymous classes
	const filteredClasses = classes.filter((cls) => !cls.name.match(/^\d+$/));

	// Helper function to get simple type name (last part after . or $)
	function getSimpleTypeName(fullName: string): string {
		return fullName.split(/[.$]/).pop() || fullName;
	}

	// Group classes
	const interfaces = filteredClasses.filter((cls) => cls.isInterface).sort((a, b) => a.name.localeCompare(b.name));
	const abstractClasses = filteredClasses
		.filter((cls) => !cls.isInterface && cls.isAbstract)
		.sort((a, b) => a.name.localeCompare(b.name));
	const concreteClasses = filteredClasses
		.filter((cls) => !cls.isInterface && !cls.isAbstract)
		.sort((a, b) => a.name.localeCompare(b.name));

	// Function to find what implements an interface
	function findImplementers(interfaceName: string, visited: Set<string> = new Set()): string[] {
		if (visited.has(interfaceName)) return [`  ├── ${interfaceName} (cycle detected)`];

		const newVisited = new Set(visited);
		newVisited.add(interfaceName);

		const result: string[] = [];

		// Find direct implementers - compare simple type names
		const implementers = filteredClasses.filter((cls) => {
			return cls.implements.some((iface) => getSimpleTypeName(iface) === interfaceName);
		});

		implementers.sort((a, b) => a.name.localeCompare(b.name));

		for (const implementer of implementers) {
			let displayName = implementer.name;
			const annotations: string[] = [];

			if (implementer.isAbstract && !implementer.isInterface) {
				annotations.push("abstract");
			}
			if (implementer.isGeneric) {
				annotations.push("generic");
			}

			if (annotations.length > 0) {
				displayName += ` (${annotations.join(", ")})`;
			}

			result.push(`  ├── ${displayName}`);

			// For classes that implement this interface, show their extenders
			if (!implementer.isInterface) {
				const extenders = findExtenders(implementer.name, newVisited);
				for (const extender of extenders) {
					result.push(`  ${extender}`);
				}
			}
		}

		return result;
	}

	// Function to find what extends a class
	function findExtenders(className: string, visited: Set<string> = new Set()): string[] {
		if (visited.has(className)) return [`  ├── ${className} (cycle detected)`];

		const newVisited = new Set(visited);
		newVisited.add(className);

		const result: string[] = [];

		// Find direct extenders - compare simple type names
		const extenders = filteredClasses.filter((cls) => {
			return cls.extends && getSimpleTypeName(cls.extends) === className;
		});

		extenders.sort((a, b) => a.name.localeCompare(b.name));

		for (const extender of extenders) {
			let displayName = extender.name;
			const annotations: string[] = [];

			if (extender.isAbstract && !extender.isInterface) {
				annotations.push("abstract");
			}
			if (extender.isGeneric) {
				annotations.push("generic");
			}

			if (annotations.length > 0) {
				displayName += ` (${annotations.join(", ")})`;
			}

			result.push(`  ├── ${displayName}`);

			// Recursively find extenders of this extender
			const subExtenders = findExtenders(extender.name, newVisited);
			for (const subExtender of subExtenders) {
				result.push(`  ${subExtender}`);
			}
		}

		return result;
	}

	// Process interfaces - only show root interfaces (those that don't extend other interfaces)
	md.push("\n=== INTERFACES ===");
	const rootInterfaces = interfaces.filter((iface) => !iface.extends || iface.extends === "java.lang.Object");

	for (const iface of rootInterfaces) {
		let line = `${iface.name} (interface`;
		if (iface.isGeneric) {
			line += ", generic";
		}
		line += ")";

		md.push(line);

		const implementers = findImplementers(iface.name);
		if (implementers.length > 0) {
			md.push(...implementers);
			md.push("");
		}
	}

	// Process abstract classes - only show root abstract classes (those that don't extend other abstract classes)
	md.push("\n=== ABSTRACT CLASSES ===");
	const rootAbstractClasses = abstractClasses.filter((abs) => {
		if (!abs.extends || abs.extends === "java.lang.Object") return true;

		// Check if the extended class is also an abstract class in our list
		const extendedClassName = getSimpleTypeName(abs.extends);
		const extendsAbstractClass = abstractClasses.some((otherAbs) => otherAbs.name === extendedClassName);

		return !extendsAbstractClass;
	});

	for (const abs of rootAbstractClasses) {
		let line = `${abs.name} (abstract`;
		if (abs.isGeneric) {
			line += ", generic";
		}
		line += ")";

		if (abs.extends && abs.extends !== "java.lang.Object") {
			const superName = getSimpleTypeName(abs.extends);
			line += ` extends ${superName}`;
		}

		if (abs.implements.length > 0) {
			const interfaces = abs.implements.map((iface) => getSimpleTypeName(iface));
			line += ` implements ${interfaces.join(", ")}`;
		}

		md.push(line);

		const extenders = findExtenders(abs.name);
		if (extenders.length > 0) {
			md.push(...extenders);
			md.push("");
		}
	}

	// Process concrete classes (just list them)
	md.push("\n=== CONCRETE CLASSES ===");
	for (const concrete of concreteClasses) {
		let line = concrete.name;

		if (concrete.isGeneric) {
			line += " (generic)";
		}

		if (concrete.extends && concrete.extends !== "java.lang.Object") {
			const superName = getSimpleTypeName(concrete.extends);
			line += ` extends ${superName}`;
		}

		if (concrete.implements.length > 0) {
			const interfaces = concrete.implements.map((iface) => getSimpleTypeName(iface));
			line += ` implements ${interfaces.join(", ")}`;
		}

		md.push(line);
	}

	md.push("```");

	return md.join("\n");
}

function main(): void {
	console.log("🚀 Starting Java class analysis...\n");
	console.log(`📂 Using spine-runtimes path: ${spineRuntimesPath}`);

	try {
		if (!existsSync(SPINE_LIBGDX_PATH)) {
			throw new Error(`spine-libgdx directory not found at: ${SPINE_LIBGDX_PATH}`);
		}

		buildProject();
		const classNames = findClassFiles();

		console.log("📖 Parsing class information...");
		const classes: ClassInfo[] = [];

		for (let i = 0; i < classNames.length; i++) {
			const className = classNames[i];
			process.stdout.write(`\r   ${i + 1}/${classNames.length}: ${className.split(".").pop()}`);

			const classInfo = parseJavapOutput(className);
			if (classInfo) {
				classes.push(classInfo);
			}
		}

		console.log(`\n✅ Parsed ${classes.length} classes successfully\n`);

		console.log("📝 Generating hierarchy...");
		const markdown = generateHierarchy(classes);

		const outputFile = `${spineRuntimesPath}/spine-java-hierarchy.md`;
		writeFileSync(outputFile, markdown);

		console.log(`🎉 Generated class list!`);
		console.log(`📄 Output: ${outputFile}`);
	} catch (error: any) {
		console.error("\n❌ Error:", error.message);
		process.exit(1);
	}
}

main();
