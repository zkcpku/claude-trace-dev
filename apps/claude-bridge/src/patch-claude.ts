import fs from "fs";
import path from "path";

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
