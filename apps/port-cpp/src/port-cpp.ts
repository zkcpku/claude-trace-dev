#!/usr/bin/env npx tsx

import fs from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { ChangeSet, PortingPlan, PortingOrderItem } from "./types.js";
import { analyzeSpineLibGDXDependencies, getSimpleTypeName } from "./analyze-dependencies.js";
import { enumerateChangedJavaFiles } from "./enumerate-changed-java-files.js";
import { extractJavaTypesFromChangeSet } from "./extract-java-types.js";
import { createCppTypeMapping } from "./extract-cpp-types.js";
import { mapJavaTypesToCpp } from "./map-java-to-cpp.js";

interface TypeDependencies {
	type: string;
	simpleName: string;
	dependsOn: string[];
	dependsOnSimple: string[];
	dependencyCount: number;
}

function topologicalSort(dependencies: TypeDependencies[]): string[] {
	// Create a map for faster lookup using simple names
	const depMap = new Map<string, string[]>();
	const allTypes = new Set<string>();

	for (const dep of dependencies) {
		depMap.set(dep.simpleName, dep.dependsOnSimple);
		allTypes.add(dep.simpleName);
		// Also add dependencies to all types (they might not have their own entries)
		dep.dependsOnSimple.forEach((dep) => allTypes.add(dep));
	}

	// Kahn's algorithm for topological sorting
	const inDegree = new Map<string, number>();
	const adjList = new Map<string, string[]>();

	// Initialize
	for (const type of allTypes) {
		inDegree.set(type, 0);
		adjList.set(type, []);
	}

	// Build graph and calculate in-degrees
	for (const [type, deps] of depMap) {
		for (const dep of deps) {
			if (allTypes.has(dep)) {
				adjList.get(dep)!.push(type);
				inDegree.set(type, inDegree.get(type)! + 1);
			}
		}
	}

	const queue: string[] = [];
	const result: string[] = [];

	// Find all types with no dependencies
	for (const [type, degree] of inDegree) {
		if (degree === 0) {
			queue.push(type);
		}
	}

	while (queue.length > 0) {
		const current = queue.shift()!;
		result.push(current);

		// Process neighbors
		for (const neighbor of adjList.get(current)!) {
			const newDegree = inDegree.get(neighbor)! - 1;
			inDegree.set(neighbor, newDegree);
			if (newDegree === 0) {
				queue.push(neighbor);
			}
		}
	}

	return result;
}

async function calculatePortingOrder(changeSet: ChangeSet): Promise<PortingOrderItem[]> {
	const spineRuntimesDir = changeSet.metadata.spineRuntimesDir;

	// Get dependency analysis
	const dependencyAnalysisResult = await analyzeSpineLibGDXDependencies({
		spineLibGdxPath: `${spineRuntimesDir}/spine-libgdx/spine-libgdx`,
	});

	// Create mapping from simple names to full info for quick lookup
	const typeMap = new Map<string, { fullName: string; javaSourcePath: string }>();

	for (const file of changeSet.files) {
		for (const javaType of file.javaTypes) {
			// Determine full name - this is a simplified approach
			// In reality, you'd need to parse the package from the file path
			const packagePath = file.filePath
				.replace(resolve(spineRuntimesDir, "spine-libgdx/spine-libgdx/src"), "")
				.replace(/^\//, "")
				.replace(/\.java$/, "")
				.replace(/\//g, ".");

			typeMap.set(javaType.name, {
				fullName: packagePath,
				javaSourcePath: file.filePath,
			});
		}
	}

	// Convert dependency analysis to TypeDependencies format
	const typeDependencies: TypeDependencies[] = dependencyAnalysisResult.typeDependencies.map((dep) => ({
		type: dep.type,
		simpleName: getSimpleTypeName(dep.type),
		dependsOn: dep.dependsOn,
		dependsOnSimple: dep.dependsOn.map(getSimpleTypeName),
		dependencyCount: dep.dependsOn.length,
	}));

	// Perform topological sort
	const sortedTypeNames = topologicalSort(typeDependencies);

	// Create PortingOrderItems with denormalized data
	const portingOrderItems: PortingOrderItem[] = [];

	for (const simpleName of sortedTypeNames) {
		const typeInfo = typeMap.get(simpleName);
		if (!typeInfo) continue; // Skip types not in our change set

		// Find the corresponding JavaType for complete info
		let javaType = null;
		for (const file of changeSet.files) {
			javaType = file.javaTypes.find((t) => t.name === simpleName);
			if (javaType) break;
		}

		// Find dependency count from the analysis
		const typeDependency = typeDependencies.find((td) => td.simpleName === simpleName);
		const dependencyCount = typeDependency ? typeDependency.dependencyCount : 0;

		if (javaType) {
			portingOrderItems.push({
				simpleName,
				fullName: typeInfo.fullName,
				type: javaType.type,
				javaSourcePath: typeInfo.javaSourcePath,
				startLine: javaType.startLine,
				endLine: javaType.endLine,
				dependencyCount,
				targetFiles: javaType.targetFiles,
				filesExist: javaType.filesExist,
				portingState: "pending",
			});
		}
	}

	return portingOrderItems;
}

export async function createPortingPlan(
	prevBranch: string,
	currentBranch: string,
	spineRuntimesDir: string,
	outputFile?: string,
): Promise<PortingPlan> {
	console.log("Phase 1: Enumerating changed Java files...");
	const changeSet = enumerateChangedJavaFiles(prevBranch, currentBranch, spineRuntimesDir);

	console.log("Phase 2: Extracting Java types...");
	const changeSetWithTypes = extractJavaTypesFromChangeSet(changeSet);

	console.log("Phase 3a: Creating C++ type mapping...");
	const cppTypeMapping = createCppTypeMapping(changeSet.metadata.spineCppDir);

	console.log("Phase 3b: Mapping Java types to C++ files...");
	const changeSetMapped = mapJavaTypesToCpp(changeSetWithTypes, cppTypeMapping);

	console.log("Phase 4: Calculating porting order...");
	const portingOrder = await calculatePortingOrder(changeSetMapped);

	const portingPlan: PortingPlan = {
		metadata: changeSetMapped.metadata,
		deletedFiles: changeSetMapped.deletedFiles,
		portingOrder,
	};

	if (outputFile) {
		fs.writeFileSync(outputFile, JSON.stringify(portingPlan, null, 2));
		console.log(`Porting plan saved to: ${outputFile}`);
	}

	return portingPlan;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.error("Usage: npx tsx port-cpp.ts <prev-branch> <current-branch> <spine-runtimes-dir> [output-file]");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx port-cpp.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes");
		console.error("  npx tsx port-cpp.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes porting-plan.json");
		process.exit(1);
	}

	const [prevBranch, currentBranch, spineRuntimesDir, outputFile] = args;

	try {
		const portingPlan = await createPortingPlan(prevBranch, currentBranch, spineRuntimesDir, outputFile);

		if (!outputFile) {
			console.log(JSON.stringify(portingPlan, null, 2));
		}
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

export default { createPortingPlan };
