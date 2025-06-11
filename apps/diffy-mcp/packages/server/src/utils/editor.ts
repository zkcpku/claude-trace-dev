import { execSync } from "child_process";

/**
 * Editor detection utilities for opening files
 * Auto-detects Cursor, VS Code, or falls back to system default
 */

let detectedEditor: string | null = null;
let detectionAttempted = false;

/**
 * Get the best available editor command
 * Priority: DIFFY_EDITOR env var > cursor > code > null
 */
export async function getEditorCommand(): Promise<string | null> {
	// Check environment variable first
	const envEditor = process.env.DIFFY_EDITOR;
	if (envEditor && envEditor !== "auto") {
		if (await isEditorAvailable(envEditor)) {
			return envEditor;
		} else {
			console.error(`Warning: DIFFY_EDITOR=${envEditor} not found, falling back to auto-detection`);
		}
	}

	// Auto-detect if not already done
	if (!detectionAttempted) {
		detectedEditor = await detectEditor();
		detectionAttempted = true;
	}

	return detectedEditor;
}

/**
 * Detect available editor in priority order
 */
async function detectEditor(): Promise<string | null> {
	const editors = ["cursor", "code"];

	for (const editor of editors) {
		if (await isEditorAvailable(editor)) {
			console.error(`✅ Detected editor: ${editor}`);
			return editor;
		}
	}

	console.error("⚠️ No suitable editor found (cursor/code)");
	return null;
}

/**
 * Check if an editor command is available
 */
async function isEditorAvailable(command: string): Promise<boolean> {
	try {
		execSync(`${command} --version`, {
			stdio: "pipe",
			timeout: 5000,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Get editor info for debugging
 */
export async function getEditorInfo(): Promise<{
	configured: string | null;
	detected: string | null;
	available: string[];
}> {
	const available: string[] = [];
	const editors = ["cursor", "code"];

	for (const editor of editors) {
		if (await isEditorAvailable(editor)) {
			available.push(editor);
		}
	}

	return {
		configured: process.env.DIFFY_EDITOR || null,
		detected: await getEditorCommand(),
		available,
	};
}

/**
 * Force re-detection of editors (useful for testing)
 */
export function resetEditorDetection(): void {
	detectedEditor = null;
	detectionAttempted = false;
}
