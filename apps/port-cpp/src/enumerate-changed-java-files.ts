#!/usr/bin/env npx tsx

import { execSync } from "child_process";
import { PortingMatrix, JavaFile } from "./types.js";

export function enumerateChangedJavaFiles(
	prevBranch: string,
	currentBranch: string,
	workingDir: string,
): PortingMatrix {
	const lines = execSync(`git diff --name-status ${prevBranch}..${currentBranch} -- spine-libgdx/spine-libgdx/src`, {
		encoding: "utf8",
		cwd: workingDir,
	})
		.trim()
		.split("\n")
		.filter((line) => line.includes(".java") && !line.includes("/utils/"));

	const files: JavaFile[] = lines.map((line) => {
		const [status, filePath] = line.split("\t");

		// Map git status to simple change type
		const changeType = (() => {
			switch (status) {
				case "A":
					return "added" as const;
				case "D":
					return "deleted" as const;
				default:
					return "modified" as const; // M, R, C, U, T all treated as modified
			}
		})();

		return {
			filePath,
			changeType,
			javaTypes: [], // Will be populated by extract-java-types
		};
	});

	return {
		metadata: {
			prevBranch,
			currentBranch,
			generated: new Date().toISOString(),
			spineRuntimesDir: workingDir,
		},
		files,
	};
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.error("Usage: npx tsx enumerate-changed-java-files.ts <prev-branch> <current-branch> <working-dir>");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx enumerate-changed-java-files.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes");
		console.error(
			"  npx tsx enumerate-changed-java-files.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes > porting_matrix.json",
		);
		process.exit(1);
	}

	const [prevBranch, currentBranch, workingDir] = args;

	try {
		const result = enumerateChangedJavaFiles(prevBranch, currentBranch, workingDir);
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

export default { enumerateChangedJavaFiles };
