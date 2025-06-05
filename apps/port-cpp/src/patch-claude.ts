#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function patchClaudeBinary(claudePath: string, logDir: string): string {
	// Ensure log directory exists
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}

	const claudeFilename = path.basename(claudePath);
	const backupPath = path.join(logDir, `${claudeFilename}.backup`);

	// Create backup if it doesn't exist
	if (!fs.existsSync(backupPath)) {
		fs.copyFileSync(claudePath, backupPath);
		console.log(`📁 Created backup at ${backupPath}`);
	}

	// Read the Claude binary
	const content = fs.readFileSync(claudePath, "utf8");

	// Multiple patterns to match different variations of anti-debugging checks
	const patterns = [
		// Standard pattern: if(PF5())process.exit(1);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(1\);/g,
		// With spaces: if (PF5()) process.exit(1);
		/if\s*\([A-Za-z0-9_$]+\(\)\)\s*process\.exit\(1\);/g,
		// Different exit codes: if(PF5())process.exit(2);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(\d+\);/g,
	];

	let patchedContent = content;
	let patched = false;

	for (const pattern of patterns) {
		const newContent = patchedContent.replace(pattern, "if(false)process.exit(1);");
		if (newContent !== patchedContent) {
			patchedContent = newContent;
			patched = true;
			console.log(`🔧 Applied patch for pattern: ${pattern}`);
		}
	}

	if (!patched) {
		console.log("⚠️  No anti-debugging pattern found - Claude binary may have changed");
		return claudePath;
	}

	// Write patched version directly over the original
	fs.writeFileSync(claudePath, patchedContent);

	console.log(`🔧 Patched Claude binary (backup saved to ${backupPath})`);
	return claudePath;
}

function findClaudeBinary(): string {
	try {
		// Try to find claude in PATH
		const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
		return claudePath;
	} catch (error) {
		throw new Error("Claude binary not found in PATH. Please install Claude CLI first.");
	}
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		// Auto-detect Claude binary
		try {
			const claudePath = findClaudeBinary();
			const logDir = path.join(process.cwd(), ".claude-logs");

			console.log(`🔍 Found Claude binary: ${claudePath}`);
			patchClaudeBinary(claudePath, logDir);
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	} else if (args.length === 2) {
		// Manual paths
		const [claudePath, logDir] = args;

		if (!fs.existsSync(claudePath)) {
			console.error(`❌ Claude binary not found: ${claudePath}`);
			process.exit(1);
		}

		patchClaudeBinary(claudePath, logDir);
	} else {
		console.error("Usage: npx tsx patch-claude.ts [claude-path] [log-dir]");
		console.error("");
		console.error("Examples:");
		console.error("  npx tsx patch-claude.ts                                    # Auto-detect Claude");
		console.error("  npx tsx patch-claude.ts /usr/local/bin/claude ./logs      # Manual paths");
		process.exit(1);
	}
}

export default { patchClaudeBinary, findClaudeBinary };
