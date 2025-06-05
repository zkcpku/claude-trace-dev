#!/usr/bin/env tsx

import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
import path from "path";

// Helper function to convert fully qualified type name to simple name
function getSimpleTypeName(fullyQualifiedName: string): string {
	// Remove package prefix
	const withoutPackage = fullyQualifiedName.replace("com.esotericsoftware.spine.", "");

	// Handle inner classes - remove outer class prefix for inner classes
	// e.g. "Animation$Timeline" -> "Timeline"
	const parts = withoutPackage.split("$");
	return parts[parts.length - 1];
}

interface Dependency {
	from: string;
	to: string;
	packageLevel: boolean;
}

interface TypeDependencies {
	type: string;
	simpleName: string; // Just the class name without package
	dependsOn: string[];
	dependsOnSimple: string[]; // Simple names of dependencies
	dependencyCount: number;
	portingStatus?: "pending" | "skipped" | "incomplete" | "done";
}

interface AnalysisOptions {
	spineLibGdxPath?: string;
	buildClassesPath?: string;
}

function analyzeSpineLibGDXDependencies(options: AnalysisOptions = {}) {
	// Default to Gradle structure in spine-libgdx/spine-libgdx
	const spineLibGdxPath =
		options.spineLibGdxPath || "/Users/badlogic/workspaces/spine-runtimes/spine-libgdx/spine-libgdx";
	const buildClassesPath = options.buildClassesPath || path.join(spineLibGdxPath, "build/classes/java/main");

	console.log("Analyzing SpineLibGDX dependencies (Gradle)...");
	console.log(`  Source path: ${spineLibGdxPath}`);
	console.log(`  Classes path: ${buildClassesPath}`);

	try {
		// Check if classes exist, if not try to build with Gradle
		if (!existsSync(buildClassesPath)) {
			console.log(`Classes not found at ${buildClassesPath}, running Gradle build...`);

			// Use Gradle wrapper
			const gradleCmd = "./gradlew";
			execSync(`${gradleCmd} compileJava -q`, {
				cwd: spineLibGdxPath,
				encoding: "utf8",
				stdio: "inherit",
			});

			if (!existsSync(buildClassesPath)) {
				throw new Error(`Gradle build completed but classes still not found at ${buildClassesPath}`);
			}
			console.log("Gradle build completed successfully");
		}

		// Use jdeps to analyze dependencies
		// -verbose:class shows class-level dependencies
		// -filter:none shows all dependencies
		const jdepsOutput = execSync(`jdeps -verbose:class -filter:none "${buildClassesPath}"`, {
			encoding: "utf8",
			maxBuffer: 1024 * 1024 * 10,
		});

		const dependencies: Dependency[] = [];
		const lines = jdepsOutput.split("\n");

		for (const line of lines) {
			// Parse jdeps output format: "   from.class -> to.class"
			const match = line.match(/^\s+(.+?)\s+->\s+(.+?)$/);
			if (match) {
				const [, from, to] = match;

				// Only include dependencies within com.esotericsoftware.spine
				if (from.startsWith("com.esotericsoftware.spine") && to.startsWith("com.esotericsoftware.spine")) {
					// Clean up class names - remove everything after the first space (including "main")
					const cleanFrom = from.trim().split(/\s+/)[0];
					const cleanTo = to.trim().split(/\s+/)[0];

					// Skip anonymous classes (containing $[0-9])
					if (cleanFrom.match(/\$\d+/) || cleanTo.match(/\$\d+/)) {
						continue;
					}

					dependencies.push({
						from: cleanFrom,
						to: cleanTo,
						packageLevel: false,
					});
				}
			}
		}

		// Remove duplicates
		const uniqueDeps = dependencies.filter(
			(dep, index, arr) => arr.findIndex((d) => d.from === dep.from && d.to === dep.to) === index,
		);

		console.log(`Found ${uniqueDeps.length} internal dependencies`);

		// Get all types in the source tree (Gradle structure)
		const sourcePath = path.join(spineLibGdxPath, "src/com/esotericsoftware/spine");

		const allTypesOutput = execSync(`find "${sourcePath}" -name "*.java" -exec basename {} .java \\; | sort`, {
			encoding: "utf8",
		});
		const allSourceTypes = allTypesOutput
			.trim()
			.split("\n")
			.map((name) => `com.esotericsoftware.spine.${name}`)
			.filter((name) => !name.includes("$")); // Exclude inner classes from file names

		// Also get types from compiled classes to catch inner classes
		const compiledTypesOutput = execSync(
			`find "${buildClassesPath}" -name "*.class" -exec basename {} .class \\; | grep -v '\\$[0-9]' | sort -u`,
			{ encoding: "utf8" },
		);
		const compiledTypes = compiledTypesOutput
			.trim()
			.split("\n")
			.map((name) => `com.esotericsoftware.spine.${name}`)
			.filter((name) => name.startsWith("com.esotericsoftware.spine"));

		// Combine and deduplicate all types
		const allTypes = new Set([...allSourceTypes, ...compiledTypes]);

		// Group dependencies by source type
		const dependenciesByType = new Map<string, Set<string>>();

		// Initialize all types with empty dependency sets
		for (const type of allTypes) {
			dependenciesByType.set(type, new Set());
		}

		// Add actual dependencies
		for (const dep of uniqueDeps) {
			// Ensure both from and to types exist in our map
			if (!dependenciesByType.has(dep.from)) {
				dependenciesByType.set(dep.from, new Set());
			}
			if (!dependenciesByType.has(dep.to)) {
				dependenciesByType.set(dep.to, new Set());
			}
			dependenciesByType.get(dep.from)!.add(dep.to);
		}

		// Convert to TypeDependencies format
		const typeDependencies: TypeDependencies[] = Array.from(dependenciesByType.entries())
			.map(([type, dependsOnSet]) => {
				const dependsOnArray = Array.from(dependsOnSet).sort();
				return {
					type,
					simpleName: getSimpleTypeName(type),
					dependsOn: dependsOnArray,
					dependsOnSimple: dependsOnArray.map((dep) => getSimpleTypeName(dep)),
					dependencyCount: dependsOnSet.size,
					portingStatus: "pending" as const,
				};
			})
			.sort((a, b) => b.dependencyCount - a.dependencyCount); // Sort by dependency count descending

		// Write results
		const output = {
			timestamp: new Date().toISOString(),
			buildTool: "gradle",
			sourceDirectory: spineLibGdxPath,
			classesDirectory: buildClassesPath,
			totalTypes: typeDependencies.length,
			totalDependencies: uniqueDeps.length,
			typeDependencies,
		};

		writeFileSync("spine-libgdx-dependencies.json", JSON.stringify(output, null, 2));
		console.log("Dependencies written to spine-libgdx-dependencies.json");

		// Print summary
		const typesWithDeps = typeDependencies.filter((td) => td.dependencyCount > 0).length;
		const typesWithoutDeps = typeDependencies.filter((td) => td.dependencyCount === 0).length;

		console.log(`\nSummary:`);
		console.log(`- Types with dependencies: ${typesWithDeps}`);
		console.log(`- Types without dependencies: ${typesWithoutDeps}`);
		console.log(`- Total types: ${typeDependencies.length}`);
		console.log(`- Average dependencies per type: ${(uniqueDeps.length / typesWithDeps).toFixed(1)}`);

		// Show top 10 most dependent types
		console.log(`\nTop 10 types with most dependencies:`);
		typeDependencies.slice(0, 10).forEach((td, i) => {
			console.log(`${i + 1}. ${td.type} (${td.dependencyCount} dependencies)`);
		});

		// Show types with no dependencies
		const rootTypes = typeDependencies.filter((td) => td.dependencyCount === 0);
		console.log(`\nTypes with no dependencies (${rootTypes.length}):`);
		rootTypes.slice(0, 10).forEach((td) => {
			console.log(`- ${td.type}`);
		});
		if (rootTypes.length > 10) {
			console.log(`... and ${rootTypes.length - 10} more`);
		}
	} catch (error) {
		console.error("Error analyzing dependencies:", error);
		process.exit(1);
	}
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	const options: AnalysisOptions = {};

	// Parse command line arguments
	for (let i = 0; i < args.length; i += 2) {
		const flag = args[i];
		const value = args[i + 1];

		switch (flag) {
			case "--spine-path":
				options.spineLibGdxPath = value;
				break;
			case "--classes-path":
				options.buildClassesPath = value;
				break;
			case "--help":
				console.log("Usage: npx tsx analyze-dependencies.ts [options]");
				console.log("");
				console.log("Options:");
				console.log("  --spine-path <path>           Path to spine-libgdx directory");
				console.log("  --classes-path <path>         Path to compiled classes directory");
				console.log("  --help                        Show this help message");
				console.log("");
				console.log("Example:");
				console.log(
					"  npx tsx analyze-dependencies.ts --spine-path /path/to/spine-runtimes/spine-libgdx/spine-libgdx",
				);
				process.exit(0);
		}
	}

	analyzeSpineLibGDXDependencies(options);
}

export { analyzeSpineLibGDXDependencies, AnalysisOptions };
