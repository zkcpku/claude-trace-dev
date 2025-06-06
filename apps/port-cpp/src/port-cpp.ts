#!/usr/bin/env npx tsx

import fs from "fs";
import { resolve } from "path";
import { ChangeSet, PortingPlan, PortingOrderItem } from "./types.js";
import { analyzeSpineLibGDXDependencies, getSimpleTypeName } from "./analyze-dependencies.js";
import { enumerateChangedJavaFiles } from "./enumerate-changed-java-files.js";
import { extractJavaTypesFromChangeSet } from "./extract-java-types.js";
import { createCppTypeMapping } from "./extract-cpp-types.js";
import { mapJavaTypesToCpp } from "./map-java-to-cpp.js";
import { verifyCoverage } from "./verify-coverage.js";

// Temporary interface for sorting that includes priorityScore
interface PortingOrderItemWithScore extends PortingOrderItem {
	priorityScore: number;
}

async function calculatePortingOrder(changeSet: ChangeSet): Promise<PortingOrderItem[]> {
	const spineRuntimesDir = changeSet.metadata.spineRuntimesDir;

	// Get dependency analysis
	const dependencyAnalysisResult = await analyzeSpineLibGDXDependencies(
		`${spineRuntimesDir}/spine-libgdx/spine-libgdx`,
	);

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

	// Create priority-based ordering instead of topological sort
	// Priority: zero dependencies first, then by adjusted dependency count, then alphabetical
	const allPortingOrderItems: PortingOrderItemWithScore[] = [];

	for (const file of changeSet.files) {
		for (const javaType of file.javaTypes) {
			const packagePath = file.filePath
				.replace(resolve(spineRuntimesDir, "spine-libgdx/spine-libgdx/src"), "")
				.replace(/^\//, "")
				.replace(/\.java$/, "")
				.replace(/\//g, ".");

			// Find dependency count from analysis
			const dependencyEntry = dependencyAnalysisResult.typeDependencies.find(
				(dep) => getSimpleTypeName(dep.type) === javaType.name,
			);
			const dependencyCount = dependencyEntry ? dependencyEntry.dependsOn.length : 0;

			// Calculate priority score
			let priorityScore = dependencyCount;
			if (file.changeType === "added") priorityScore -= 0.5; // Boost for new files
			if (javaType.type === "interface" || javaType.type === "enum") priorityScore -= 1.0; // Boost for interfaces/enums

			allPortingOrderItems.push({
				simpleName: javaType.name,
				fullName: javaType.fullName,
				type: javaType.type,
				javaSourcePath: file.filePath,
				startLine: javaType.startLine,
				endLine: javaType.endLine,
				dependencyCount,
				targetFiles: javaType.targetFiles,
				filesExist: javaType.filesExist,
				portingState: "pending",
				priorityScore, // Add this for sorting
			});
		}
	}

	// Sort by priority: zero dependencies first, then by priority score, then alphabetically
	allPortingOrderItems.sort((a, b) => {
		// Zero dependencies always come first
		if (a.dependencyCount === 0 && b.dependencyCount !== 0) return -1;
		if (b.dependencyCount === 0 && a.dependencyCount !== 0) return 1;

		// Then by priority score
		if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;

		// Finally alphabetically
		return a.simpleName.localeCompare(b.simpleName);
	});

	// Remove priorityScore from final items (it was just for sorting)
	const portingOrderItems = allPortingOrderItems.map((item) => {
		const { priorityScore, ...finalItem } = item;
		return finalItem;
	});

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

	// Verify coverage
	console.log("Phase 5: Verifying coverage...");
	const coverageReport = verifyCoverage(prevBranch, currentBranch, spineRuntimesDir, portingPlan);

	if (coverageReport.perfectCoverage) {
		console.log(
			`✅ Coverage verification passed: ${coverageReport.extractedTypes} types from ${coverageReport.gitFiles} files`,
		);
	} else {
		console.warn(`⚠️ Coverage issues detected: ${coverageReport.filesWithZeroTypes} files with zero types`);
	}

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
