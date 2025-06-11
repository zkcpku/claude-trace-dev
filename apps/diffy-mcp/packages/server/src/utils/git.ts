import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Simplified git utilities for diffy-mcp
 * Supports the simplified branch logic:
 * - No git repo: error
 * - No branch: diff between HEAD and working
 * - With branch: diff between branch and working
 */
export class GitUtils {
	/**
	 * Check if file is in a git repository
	 */
	isInGitRepo(filePath: string): boolean {
		try {
			const gitRoot = this.findGitRoot(filePath);
			return gitRoot !== null;
		} catch {
			return false;
		}
	}

	/**
	 * Find git repository root by walking up directory tree
	 */
	findGitRoot(filePath: string): string | null {
		let currentDir = path.dirname(filePath);

		while (currentDir !== path.dirname(currentDir)) {
			if (fs.existsSync(path.join(currentDir, ".git"))) {
				return currentDir;
			}
			currentDir = path.dirname(currentDir);
		}

		return null;
	}

	/**
	 * Get git diff for a file
	 * @param filePath Absolute path to file
	 * @param fromRef Branch/commit to compare from (or HEAD)
	 * @param toRef Branch/commit to compare to (null = working directory)
	 */
	getDiff(filePath: string, fromRef: string, toRef: string | null): string {
		try {
			const gitRoot = this.findGitRoot(filePath);
			if (!gitRoot) {
				throw new Error("File is not in a git repository");
			}

			const relativePath = path.relative(gitRoot, filePath);
			let command: string;

			if (toRef === null) {
				// Compare fromRef vs working directory
				command = `git diff ${fromRef} -- "${relativePath}"`;
			} else {
				// Compare fromRef vs toRef
				command = `git diff ${fromRef}..${toRef} -- "${relativePath}"`;
			}

			console.error(`Running git command: ${command} in ${gitRoot}`);
			return execSync(command, { cwd: gitRoot, encoding: "utf8" });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`Git diff error: ${errorMsg}`);
			return `# Git diff error: ${errorMsg}`;
		}
	}

	/**
	 * Get file content from a specific branch/commit
	 * @param filePath Absolute path to file
	 * @param ref Branch/commit reference
	 */
	getFileContent(filePath: string, ref: string): string {
		try {
			const gitRoot = this.findGitRoot(filePath);
			if (!gitRoot) {
				throw new Error("File is not in a git repository");
			}

			const relativePath = path.relative(gitRoot, filePath);
			const command = `git show ${ref}:${relativePath}`;

			console.error(`Getting file content: ${command} in ${gitRoot}`);
			return execSync(command, { cwd: gitRoot, encoding: "utf8" });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`Git show error for ${ref}: ${errorMsg}`);
			return "";
		}
	}

	/**
	 * Check if a branch/commit/tag exists
	 */
	refExists(filePath: string, ref: string): boolean {
		try {
			const gitRoot = this.findGitRoot(filePath);
			if (!gitRoot) {
				return false;
			}

			execSync(`git rev-parse --verify ${ref}`, {
				cwd: gitRoot,
				stdio: "pipe",
			});
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get current branch name
	 */
	getCurrentBranch(filePath: string): string | null {
		try {
			const gitRoot = this.findGitRoot(filePath);
			if (!gitRoot) {
				return null;
			}

			const branch = execSync("git rev-parse --abbrev-ref HEAD", {
				cwd: gitRoot,
				encoding: "utf8",
			}).trim();

			return branch === "HEAD" ? null : branch;
		} catch {
			return null;
		}
	}

	/**
	 * Get git status for file
	 */
	getFileStatus(filePath: string): string | null {
		try {
			const gitRoot = this.findGitRoot(filePath);
			if (!gitRoot) {
				return null;
			}

			const relativePath = path.relative(gitRoot, filePath);
			const status = execSync(`git status --porcelain "${relativePath}"`, {
				cwd: gitRoot,
				encoding: "utf8",
			}).trim();

			return status || null;
		} catch {
			return null;
		}
	}
}
