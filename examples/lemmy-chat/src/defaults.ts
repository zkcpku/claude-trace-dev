import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const DEFAULTS_DIR = join(homedir(), ".lemmy-chat");
export const DEFAULTS_FILE = join(DEFAULTS_DIR, "defaults.json");

export function ensureDefaultsDir(): void {
	if (!existsSync(DEFAULTS_DIR)) {
		mkdirSync(DEFAULTS_DIR, { recursive: true });
	}
}

export function saveDefaults(args: string[]): void {
	ensureDefaultsDir();
	writeFileSync(DEFAULTS_FILE, JSON.stringify(args, null, 2));
}

export function loadDefaults(): string[] {
	if (!existsSync(DEFAULTS_FILE)) {
		return [];
	}
	try {
		const content = readFileSync(DEFAULTS_FILE, "utf8");
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.warn(
			`Warning: Could not load defaults from ${DEFAULTS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}
