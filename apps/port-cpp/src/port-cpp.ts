#!/usr/bin/env npx tsx

import chalk from "chalk";
import path from "path";
import fs from "fs";
import { createInterface } from "readline";
import { enumerateChangedJavaFiles } from "./enumerate-changed-java-files.js";
import { extractJavaTypes } from "./extract-java-types.js";
import { mapJavaTypeToCpp } from "./map-java-to-cpp.js";
import { patchClaudeBinary } from "./patch-claude.js";
import { analyzeSpineLibGDXDependencies, AnalysisOptions } from "./analyze-dependencies.js";
import { execSync } from "child_process";
import { PortingMatrix, PortingOrderItem } from "./types.js";

function log(message: string, type: "info" | "success" | "error" | "warn" = "info") {
	const timestamp = new Date().toLocaleTimeString();
	const prefix = chalk.gray(`[${timestamp}]`);

	switch (type) {
		case "success":
			console.log(`${prefix} ${chalk.green("✓")} ${message}`);
			break;
		case "error":
			console.log(`${prefix} ${chalk.red("✗")} ${message}`);
			break;
		case "warn":
			console.log(`${prefix} ${chalk.yellow("⚠")} ${message}`);
			break;
		default:
			console.log(`${prefix} ${chalk.blue("ℹ")} ${message}`);
	}
}

interface TypeDependencies {
	type: string;
	simpleName: string;
	dependsOn: string[];
	dependsOnSimple: string[];
	dependencyCount: number;
	portingStatus?: "pending" | "skipped" | "incomplete" | "done";
}

function topologicalSort(dependencies: TypeDependencies[]): string[] {
	// Create a map for faster lookup using simple names
	const depMap = new Map<string, string[]>();
	const allTypes = new Set<string>();

	for (const dep of dependencies) {
		depMap.set(dep.simpleName, dep.dependsOnSimple);
		allTypes.add(dep.simpleName);
		dep.dependsOnSimple.forEach((d) => allTypes.add(d));
	}

	// Kahn's algorithm for topological sorting
	const result: string[] = [];
	const inDegree = new Map<string, number>();

	// Initialize in-degree count for all types
	for (const type of allTypes) {
		inDegree.set(type, 0);
	}

	// Calculate in-degrees
	for (const [type, deps] of depMap) {
		for (const dep of deps) {
			inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
		}
	}

	// Find all types with no dependencies (in-degree 0)
	const queue: string[] = [];
	for (const [type, degree] of inDegree) {
		if (degree === 0) {
			queue.push(type);
		}
	}

	// Sort the queue to ensure consistent ordering
	queue.sort();

	// Process types in dependency order
	while (queue.length > 0) {
		const current = queue.shift()!;
		result.push(current);

		// For each type that depends on current type
		const dependents = depMap.get(current) || [];
		for (const dependent of dependents) {
			const newDegree = (inDegree.get(dependent) || 0) - 1;
			inDegree.set(dependent, newDegree);

			if (newDegree === 0) {
				queue.push(dependent);
				queue.sort(); // Keep queue sorted for consistent ordering
			}
		}
	}

	// Check for cycles
	if (result.length !== allTypes.size) {
		log("Warning: Circular dependencies detected in type graph", "warn");
		// Add remaining types to the end
		for (const type of allTypes) {
			if (!result.includes(type)) {
				result.push(type);
			}
		}
	}

	return result;
}

function updatePortingStatusInDependencies(typeName: string, status: "pending" | "skipped" | "incomplete" | "done") {
	try {
		const depFile = path.join(process.cwd(), "spine-libgdx-dependencies.json");
		if (!fs.existsSync(depFile)) return;

		const depData = JSON.parse(fs.readFileSync(depFile, "utf8"));
		const dependencies: TypeDependencies[] = depData.typeDependencies;

		// Find and update the type by simple name
		const typeToUpdate = dependencies.find((dep) => dep.simpleName === typeName);
		if (typeToUpdate) {
			typeToUpdate.portingStatus = status;

			// Write back to file
			fs.writeFileSync(depFile, JSON.stringify(depData, null, 2));
		}
	} catch (error) {
		log(
			`Failed to update porting status for ${typeName}: ${error instanceof Error ? error.message : String(error)}`,
			"warn",
		);
	}
}

async function calculatePortingOrder(spineRuntimesDir: string, matrix: PortingMatrix): Promise<PortingOrderItem[]> {
	log("Analyzing type dependencies for porting order...");

	try {
		// Read dependency analysis from the generated file
		const depFile = path.join(process.cwd(), "spine-libgdx-dependencies.json");

		if (!fs.existsSync(depFile)) {
			log("No dependency analysis found, generating...", "info");
			const spineLibGdxPath = path.join(spineRuntimesDir, "spine-libgdx/spine-libgdx");
			await analyzeSpineLibGDXDependencies({ spineLibGdxPath });
		}

		const depData = JSON.parse(fs.readFileSync(depFile, "utf8"));
		const dependencies: TypeDependencies[] = depData.typeDependencies;

		log(`Found ${dependencies.length} types in dependency analysis`, "success");

		// Perform topological sort
		const sortedTypeNames = topologicalSort(dependencies);

		// Create a lookup map for type dependencies
		const typeDependencyMap = new Map<string, TypeDependencies>();
		for (const dep of dependencies) {
			typeDependencyMap.set(dep.simpleName, dep);
		}

		// Create a lookup map for Java source paths
		const typeToSourceMap = new Map<string, string>();
		for (const file of matrix.files) {
			for (const javaType of file.javaTypes) {
				if (javaType.name !== "DELETED_FILE") {
					typeToSourceMap.set(javaType.name, file.filePath);
				}
			}
		}

		// Convert to PortingOrderItems with cross-references
		const portingOrderItems: PortingOrderItem[] = sortedTypeNames.map((simpleName) => {
			const dependency = typeDependencyMap.get(simpleName);
			const fullName = dependency?.type || `com.esotericsoftware.spine.${simpleName}`;
			const javaSourcePath = typeToSourceMap.get(simpleName) || "unknown";

			return {
				simpleName,
				fullName,
				javaSourcePath,
				portingState: "pending",
			};
		});

		log(`Generated porting order for ${portingOrderItems.length} types`, "success");
		log(
			`First 10 types to port: ${portingOrderItems
				.slice(0, 10)
				.map((item) => item.simpleName)
				.join(", ")}`,
			"info",
		);

		return portingOrderItems;
	} catch (error) {
		log(`Failed to calculate porting order: ${error instanceof Error ? error.message : String(error)}`, "error");
		return [];
	}
}

async function askUser(question: string): Promise<boolean> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${question} (y/n): `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase().startsWith("y"));
		});
	});
}

function loadExistingMatrix(outputFile: string): PortingMatrix | null {
	try {
		if (fs.existsSync(outputFile)) {
			const content = fs.readFileSync(outputFile, "utf8");
			return JSON.parse(content);
		}
	} catch (error) {
		log(`Failed to load existing matrix: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
	return null;
}

async function portCpp(
	prevBranch: string,
	currentBranch: string,
	spineRuntimesDir: string,
	outputFile: string,
): Promise<PortingMatrix> {
	log(`Starting Java-to-C++ porting: ${prevBranch} → ${currentBranch}`);

	// Patch Claude binary to remove anti-debugging
	try {
		log("Patching Claude binary to remove anti-debugging...");
		const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
		const logDir = path.join(process.cwd(), ".claude-logs");
		patchClaudeBinary(claudePath, logDir);
		log("Claude binary patched successfully", "success");
	} catch (error) {
		log(`Warning: Failed to patch Claude binary: ${error instanceof Error ? error.message : String(error)}`, "warn");
		log("Continuing anyway - this may cause issues with multiple Claude calls", "warn");
	}

	// Check for existing output file
	const existing = loadExistingMatrix(outputFile);
	let matrix: PortingMatrix;

	if (existing) {
		log(`Found existing porting matrix: ${outputFile}`, "warn");
		const shouldContinue = await askUser("Continue from existing progress?");

		if (shouldContinue) {
			log("Continuing from existing matrix...", "info");
			matrix = existing;
		} else {
			log("Starting fresh...", "info");
			matrix = enumerateChangedJavaFiles(prevBranch, currentBranch, spineRuntimesDir);
		}
	} else {
		// Phase 1: Enumerate changed Java files
		log("Phase 1: Enumerating changed Java files...");
		matrix = enumerateChangedJavaFiles(prevBranch, currentBranch, spineRuntimesDir);
	}

	if (matrix.files.length === 0) {
		log("No Java files changed between branches", "warn");
		return matrix;
	}

	log(`Found ${matrix.files.length} changed Java files`, "success");

	// Save progress after enumeration
	fs.writeFileSync(outputFile, JSON.stringify(matrix, null, 2));

	// Phase 2: Extract Java types from each file
	log("Phase 2: Extracting Java types...");

	for (const file of matrix.files) {
		// Skip if file already has types extracted
		if (file.javaTypes.length > 0) {
			log(`  Skipping ${file.filePath} (already extracted ${file.javaTypes.length} types)`, "info");
			continue;
		}

		const fullPath = path.join(spineRuntimesDir, file.filePath);
		log(`  Extracting types from: ${file.filePath}`);

		try {
			const result = await extractJavaTypes(fullPath, {
				onTypeExtracted: (filePath, javaType, index, total) => {
					// Add type to file immediately when processed
					file.javaTypes.push(javaType);
					log(`      Extracted ${javaType.name} (${index + 1}/${total})`, "success");
					// Don't save here - wait until all types are extracted
				},
			});

			if (result.status === "success") {
				log(`    Found ${result.types.length} types`, "success");
			} else if (result.status === "deleted") {
				file.javaTypes = result.types; // Contains DELETED_FILE marker
				log(`    File deleted`, "warn");
			} else if (result.status === "no_types") {
				log(`    No types found`, "warn");
			} else {
				log(`    Error: ${result.error}`, "error");
			}

			// Save progress after entire file is processed
			fs.writeFileSync(outputFile, JSON.stringify(matrix, null, 2));
		} catch (error) {
			log(`    Failed to extract types: ${error instanceof Error ? error.message : String(error)}`, "error");
		}
	}

	const totalTypes = matrix.files.reduce((sum, file) => sum + file.javaTypes.length, 0);
	log(`Extracted ${totalTypes} total types`, "success");

	// Phase 3: Calculate porting order based on dependencies
	log("Phase 3: Calculating porting order based on dependencies...");

	if (!matrix.portingOrder || matrix.portingOrder.length === 0) {
		const portingOrder = await calculatePortingOrder(spineRuntimesDir, matrix);
		matrix.portingOrder = portingOrder;

		// Save matrix with porting order
		fs.writeFileSync(outputFile, JSON.stringify(matrix, null, 2));
		log(`Porting order established for ${portingOrder.length} types`, "success");
	} else {
		log(`Using existing porting order (${matrix.portingOrder.length} types)`, "info");
	}

	// Phase 4: Map Java types to C++ files
	log("Phase 4: Mapping Java types to C++ files...");

	for (const file of matrix.files) {
		if (file.javaTypes.length === 0) continue;

		// Check if all types in this file are already mapped
		const unmappedTypes = file.javaTypes.filter((type) => type.name !== "DELETED_FILE" && !type.cppHeader);

		if (unmappedTypes.length === 0) {
			log(`  Skipping ${file.filePath} (all ${file.javaTypes.length} types already mapped)`, "info");
			continue;
		}

		log(`  Mapping types from: ${file.filePath} (${unmappedTypes.length} remaining)`);

		for (let i = 0; i < file.javaTypes.length; i++) {
			const javaType = file.javaTypes[i];

			if (javaType.name === "DELETED_FILE") {
				continue; // Skip deleted file markers
			}

			// Skip if already mapped
			if (javaType.cppHeader) {
				log(`    Skipping ${javaType.name} (already mapped)`, "info");
				continue;
			}

			try {
				log(`    Mapping: ${javaType.name}`);
				const mappedType = await mapJavaTypeToCpp(spineRuntimesDir, javaType, file.changeType, file.filePath);
				file.javaTypes[i] = mappedType;

				const actionColor =
					mappedType.action === "create_new_files"
						? "yellow"
						: mappedType.action === "update_existing"
							? "blue"
							: "gray";
				log(`      → ${chalk[actionColor](mappedType.cppHeader)} (${mappedType.action})`, "success");

				// Save progress after each type mapping
				fs.writeFileSync(outputFile, JSON.stringify(matrix, null, 2));
			} catch (error) {
				log(`      Failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		}
	}

	log("Porting matrix complete!", "success");
	return matrix;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 4) {
		console.error(
			chalk.red("Usage: npx tsx port-cpp.ts <prev-branch> <current-branch> <spine-runtimes-dir> <output-file>"),
		);
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx port-cpp.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes porting_matrix.json");
		process.exit(1);
	}

	const [prevBranch, currentBranch, spineRuntimesDir, outputFile] = args;

	portCpp(prevBranch, currentBranch, spineRuntimesDir, outputFile)
		.then((matrix) => {
			// Final write to output file (already saved incrementally)
			fs.writeFileSync(outputFile, JSON.stringify(matrix, null, 2));
			log(`Porting matrix complete: ${outputFile}`, "success");
		})
		.catch((error) => {
			log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`, "error");
			process.exit(1);
		});
}

export default { portCpp };
