#!/usr/bin/env npx tsx

import { execSync } from "child_process";
import { enumerateChangedJavaFiles } from "./enumerate-changed-java-files.js";
import { extractJavaTypesFromChangeSet } from "./extract-java-types.js";
import { PortingPlan } from "./types.js";

interface CoverageReport {
	gitFiles: number;
	enumeratedFiles: number;
	extractedTypes: number;
	portingPlanTypes: number;
	filesWithZeroTypes: number;
	missingFromPortingPlan: number;
	extraInPortingPlan: number;
	perfectCoverage: boolean;
}

export function verifyCoverage(
	prevBranch: string,
	currentBranch: string,
	spineRuntimesDir: string,
	portingPlan?: PortingPlan,
	verbose: boolean = false,
): CoverageReport {
	if (verbose) {
		console.log("=== File Coverage Verification ===\n");
	}

	// 1. Get files from git diff
	if (verbose) console.log("1. Files from git diff:");
	const gitOutput = execSync(
		`git diff --name-status ${prevBranch}..${currentBranch} -- spine-libgdx/spine-libgdx/src`,
		{
			encoding: "utf8",
			cwd: spineRuntimesDir,
		},
	)
		.trim()
		.split("\n")
		.filter((line) => line.includes(".java") && !line.includes("/utils/"));

	const gitFiles = new Set<string>();
	gitOutput.forEach((line) => {
		const parts = line.split("\t");
		const status = parts[0];
		let filePath: string;

		if (status.startsWith("R")) {
			// For renames, use the new file path (parts[2])
			filePath = parts[2];
		} else {
			// For other changes, use the file path (parts[1])
			filePath = parts[1];
		}

		// Extract just the filename without .java
		const fileName = filePath.split("/").pop()?.replace(".java", "") || "";
		if (fileName) {
			gitFiles.add(fileName);
		}
	});

	if (verbose) {
		console.log(`   Found ${gitFiles.size} files in git diff`);
		console.log(`   Files: [${Array.from(gitFiles).slice(0, 10).join(", ")}${gitFiles.size > 10 ? "..." : ""}]`);
	}

	// 2. Get files from our enumerate function
	if (verbose) console.log("\n2. Files from enumerate function:");
	const changeSet = enumerateChangedJavaFiles(prevBranch, currentBranch, spineRuntimesDir);
	if (verbose) console.log(`   Found ${changeSet.files.length} files`);

	const enumeratedFiles = new Set<string>();
	changeSet.files.forEach((file) => {
		const fileName = file.filePath.split("/").pop()?.replace(".java", "") || "";
		if (fileName) {
			enumeratedFiles.add(fileName);
		}
	});

	// 3. Extract types and count them
	if (verbose) console.log("\n3. Type extraction:");
	const changeSetWithTypes = extractJavaTypesFromChangeSet(changeSet);
	const totalTypes = changeSetWithTypes.files.reduce((sum, file) => sum + file.javaTypes.length, 0);
	if (verbose) console.log(`   Extracted ${totalTypes} types total`);

	// Show files and their type counts (only in verbose mode)
	if (verbose) {
		console.log("\n4. Types per file:");
		changeSetWithTypes.files.forEach((file) => {
			const fileName = file.filePath.split("/").pop()?.replace(".java", "") || "";
			if (file.javaTypes.length > 0) {
				console.log(
					`   ${fileName}: ${file.javaTypes.length} types [${file.javaTypes.map((t) => `${t.name}(${t.type})`).join(", ")}]`,
				);
			} else {
				console.log(`   ${fileName}: 0 types ⚠️`);
			}
		});
	}

	// 4. Compare git vs enumerate
	const missingFromEnumerate = Array.from(gitFiles).filter((f) => !enumeratedFiles.has(f));
	const extraInEnumerate = Array.from(enumeratedFiles).filter((f) => !gitFiles.has(f));

	if (verbose) {
		console.log("\n5. Coverage comparison:");
		console.log(`   Files in git but missing from enumerate: ${missingFromEnumerate.length}`);
		if (missingFromEnumerate.length > 0) {
			console.log(`   Missing: [${missingFromEnumerate.join(", ")}]`);
		}

		console.log(`   Files in enumerate but not in git: ${extraInEnumerate.length}`);
		if (extraInEnumerate.length > 0) {
			console.log(`   Extra: [${extraInEnumerate.join(", ")}]`);
		}
	}

	// 5. Check for files with zero types
	const filesWithZeroTypes = changeSetWithTypes.files.filter((f) => f.javaTypes.length === 0);
	if (verbose) {
		console.log("\n6. Files with zero types (potential issues):");
		if (filesWithZeroTypes.length > 0) {
			filesWithZeroTypes.forEach((file) => {
				const fileName = file.filePath.split("/").pop() || "";
				console.log(`   ⚠️  ${fileName} - no types extracted`);
			});
		} else {
			console.log("   ✅ All files have at least one type");
		}
	}

	// 6. Check porting plan if provided
	let portingPlanTypes = 0;
	let missingFromPortingPlan: string[] = [];
	let extraInPortingPlan: string[] = [];

	if (portingPlan) {
		portingPlanTypes = portingPlan.portingOrder.length;

		// Get all extracted type names
		const extractedTypeNames = new Set<string>();
		changeSetWithTypes.files.forEach((file) => {
			file.javaTypes.forEach((type) => {
				extractedTypeNames.add(type.name);
			});
		});

		// Get all porting plan type names
		const portingPlanTypeNames = new Set<string>();
		portingPlan.portingOrder.forEach((item) => {
			portingPlanTypeNames.add(item.simpleName);
		});

		// Find missing and extra types
		missingFromPortingPlan = Array.from(extractedTypeNames).filter((name) => !portingPlanTypeNames.has(name));
		extraInPortingPlan = Array.from(portingPlanTypeNames).filter((name) => !extractedTypeNames.has(name));

		if (verbose && (missingFromPortingPlan.length > 0 || extraInPortingPlan.length > 0)) {
			console.log("\n7. Porting plan type coverage:");
			console.log(`   Types extracted but missing from porting plan: ${missingFromPortingPlan.length}`);
			if (missingFromPortingPlan.length > 0) {
				console.log(`   Missing: [${missingFromPortingPlan.join(", ")}]`);
			}
			console.log(`   Types in porting plan but not extracted: ${extraInPortingPlan.length}`);
			if (extraInPortingPlan.length > 0) {
				console.log(`   Extra: [${extraInPortingPlan.join(", ")}]`);
			}
		}
	}

	const perfectCoverage =
		missingFromEnumerate.length === 0 &&
		extraInEnumerate.length === 0 &&
		filesWithZeroTypes.length === 0 &&
		missingFromPortingPlan.length === 0 &&
		extraInPortingPlan.length === 0;

	// 7. Summary
	if (verbose) {
		console.log("\n=== SUMMARY ===");
		console.log(`Git diff files: ${gitFiles.size}`);
		console.log(`Enumerated files: ${enumeratedFiles.size}`);
		console.log(`Total types extracted: ${totalTypes}`);
		if (portingPlan) {
			console.log(`Porting plan types: ${portingPlanTypes}`);
		}
		console.log(`Files with zero types: ${filesWithZeroTypes.length}`);
		console.log(`Coverage match: ${perfectCoverage ? "✅ PERFECT" : "❌ MISMATCH"}`);

		if (portingPlan && totalTypes === portingPlanTypes) {
			console.log("Type count: ✅ MATCHES porting plan");
		} else if (portingPlan) {
			console.log(`Type count: ❌ Expected ${totalTypes}, porting plan has ${portingPlanTypes}`);
		}

		if (portingPlan) {
			if (missingFromPortingPlan.length === 0 && extraInPortingPlan.length === 0) {
				console.log("Porting plan coverage: ✅ ALL TYPES INCLUDED");
			} else {
				console.log(
					`Porting plan coverage: ❌ ${missingFromPortingPlan.length} missing, ${extraInPortingPlan.length} extra`,
				);
			}
		}
	}

	return {
		gitFiles: gitFiles.size,
		enumeratedFiles: enumeratedFiles.size,
		extractedTypes: totalTypes,
		portingPlanTypes,
		filesWithZeroTypes: filesWithZeroTypes.length,
		missingFromPortingPlan: missingFromPortingPlan.length,
		extraInPortingPlan: extraInPortingPlan.length,
		perfectCoverage,
	};
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.error("Usage: npx tsx verify-coverage.ts <prev-branch> <current-branch> <spine-runtimes-dir>");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx verify-coverage.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes");
		process.exit(1);
	}

	const [prevBranch, currentBranch, spineRuntimesDir] = args;

	try {
		const report = verifyCoverage(prevBranch, currentBranch, spineRuntimesDir, undefined, true);

		if (report.perfectCoverage) {
			console.log("\n🎉 Coverage verification PASSED!");
			process.exit(0);
		} else {
			console.log("\n❌ Coverage verification FAILED!");
			process.exit(1);
		}
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
