#!/usr/bin/env tsx

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

// Helper function to convert fully qualified type name to simple name
function getSimpleTypeName(fullyQualifiedName: string): string {
	// Find the last dot to get the class name
	const lastDotIndex = fullyQualifiedName.lastIndexOf(".");
	const className = lastDotIndex >= 0 ? fullyQualifiedName.substring(lastDotIndex + 1) : fullyQualifiedName;

	// Handle inner classes - remove outer class prefix for inner classes
	// e.g. "Animation$Timeline" -> "Timeline"
	const parts = className.split("$");
	return parts[parts.length - 1];
}

interface Dependency {
	from: string;
	to: string;
}

interface TypeDependencies {
	type: string;
	simpleName: string; // Just the class name without package
	dependsOn: string[];
	dependsOnSimple: string[]; // Simple names of dependencies
	dependencyCount: number;
	portingStatus?: "pending" | "skipped" | "incomplete" | "done";
}

function analyzeSpineLibGDXDependencies(spineLibGdxPath: string) {
	const buildClassesPath = path.join(spineLibGdxPath, "build/classes/java/main");

	try {
		// Always do a clean build to ensure we start from a fresh state
		// Gradle wrapper is in the parent spine-libgdx directory
		const gradleCmd = "../gradlew";
		execSync(`${gradleCmd} :spine-libgdx:clean :spine-libgdx:compileJava -q`, {
			cwd: spineLibGdxPath,
			stdio: "ignore",
		});

		if (!existsSync(buildClassesPath)) {
			throw new Error(`Gradle build completed but classes still not found at ${buildClassesPath}`);
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
					});
				}
			}
		}

		// Remove duplicates
		const uniqueDeps = dependencies.filter(
			(dep, index, arr) => arr.findIndex((d) => d.from === dep.from && d.to === dep.to) === index,
		);

		// Get all types from compiled classes with full package paths
		const compiledTypesOutput = execSync(
			`find "${buildClassesPath}" -name "*.class" | sed 's|${buildClassesPath}/||' | sed 's|/|.|g' | sed 's|\\.class$||' | grep -v '\\$[0-9]' | sort -u`,
			{ encoding: "utf8" },
		);
		const allTypes = new Set(
			compiledTypesOutput
				.trim()
				.split("\n")
				.filter((name) => name.startsWith("com.esotericsoftware.spine")),
		);

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

		return output;
	} catch (error) {
		console.error("Error analyzing dependencies:", error);
		throw error;
	}
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.error("Usage: npx tsx analyze-dependencies.ts <spine-runtimes-dir>");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx analyze-dependencies.ts /Users/badlogic/workspaces/spine-runtimes");
		process.exit(1);
	}

	const [spineRuntimesDir] = args;
	const spineLibGdxPath = `${spineRuntimesDir}/spine-libgdx/spine-libgdx`;

	try {
		const result = analyzeSpineLibGDXDependencies(spineLibGdxPath);
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

export { analyzeSpineLibGDXDependencies, getSimpleTypeName };
