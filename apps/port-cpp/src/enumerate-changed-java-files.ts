#!/usr/bin/env npx tsx

import { execSync } from "child_process";
import { resolve } from "path";
import { ChangeSet, JavaFile, DeletedJavaFile } from "./types.js";

export function enumerateChangedJavaFiles(
	prevBranch: string,
	currentBranch: string,
	spineRuntimesDir: string,
): ChangeSet {
	const javaSourceDir = resolve(spineRuntimesDir, "spine-libgdx/spine-libgdx/src");
	const spineCppDir = resolve(spineRuntimesDir, "spine-cpp");

	const lines = execSync(`git diff --name-status ${prevBranch}..${currentBranch} -- spine-libgdx/spine-libgdx/src`, {
		encoding: "utf8",
		cwd: spineRuntimesDir,
	})
		.trim()
		.split("\n")
		.filter((line) => line.includes(".java") && !line.includes("/utils/"));

	const files: JavaFile[] = [];
	const deletedFiles: DeletedJavaFile[] = [];

	lines.forEach((line) => {
		const parts = line.split("\t");
		const status = parts[0];

		// Handle renames which have format: R<percentage>\told/path\tnew/path
		let filePath: string;
		let changeType: "added" | "modified" | "deleted";

		if (status.startsWith("R")) {
			// For renames, use the new file path (parts[2])
			filePath = parts[2];
			changeType = "modified"; // Treat renames as modifications
		} else {
			// For other changes, use the file path (parts[1])
			filePath = parts[1];

			// Map git status to simple change type
			switch (status) {
				case "A":
					changeType = "added";
					break;
				case "D":
					changeType = "deleted";
					break;
				default:
					changeType = "modified"; // M, C, U, T all treated as modified
			}
		}

		if (changeType === "deleted") {
			// Add to deleted files list for manual cleanup tracking
			deletedFiles.push({
				filePath: resolve(javaSourceDir, filePath.replace("spine-libgdx/spine-libgdx/src/", "")),
				status: "pending",
			});
		} else {
			// Add to regular files list for processing
			files.push({
				filePath: resolve(javaSourceDir, filePath.replace("spine-libgdx/spine-libgdx/src/", "")),
				changeType,
				javaTypes: [], // Will be populated by extract-java-types
			});
		}
	});

	return {
		metadata: {
			prevBranch,
			currentBranch,
			generated: new Date().toISOString(),
			spineRuntimesDir,
			spineCppDir,
		},
		files,
		deletedFiles,
	};
}
