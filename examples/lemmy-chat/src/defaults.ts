import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const DEFAULTS_DIR = join(homedir(), ".lemmy-chat");
export const DEFAULTS_FILE = join(DEFAULTS_DIR, "defaults.json");

export interface ProviderDefaults {
	model?: string;
	[key: string]: any; // Provider-specific options
}

export interface DefaultsConfig {
	defaultProvider?: string;
	providers: {
		[provider: string]: ProviderDefaults;
	};
}

export function ensureDefaultsDir(): void {
	if (!existsSync(DEFAULTS_DIR)) {
		mkdirSync(DEFAULTS_DIR, { recursive: true });
	}
}

// Legacy function to maintain compatibility - converts old format to new format
export function loadDefaults(): string[] {
	const config = loadDefaultsConfig();
	if (!config.defaultProvider || !config.providers[config.defaultProvider]) {
		return [];
	}

	const providerDefaults = config.providers[config.defaultProvider];
	if (!providerDefaults) {
		return [];
	}

	const args: string[] = [config.defaultProvider];

	if (providerDefaults.model) {
		args.push("-m", providerDefaults.model);
	}

	// Add other options
	for (const [key, value] of Object.entries(providerDefaults)) {
		if (key === "model") continue; // Already handled

		if (typeof value === "boolean" && value) {
			args.push(`--${key}`);
		} else if (value !== undefined && value !== null) {
			args.push(`--${key}`, String(value));
		}
	}

	return args;
}

export function loadDefaultsConfig(): DefaultsConfig {
	if (!existsSync(DEFAULTS_FILE)) {
		return { providers: {} };
	}

	try {
		const content = readFileSync(DEFAULTS_FILE, "utf8");
		const parsed = JSON.parse(content);

		// Handle legacy format (array of strings)
		if (Array.isArray(parsed)) {
			return migrateLegacyDefaults(parsed);
		}

		// Ensure proper structure
		return {
			defaultProvider: parsed.defaultProvider,
			providers: parsed.providers || {},
		};
	} catch (error) {
		console.warn(
			`Warning: Could not load defaults from ${DEFAULTS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { providers: {} };
	}
}

function migrateLegacyDefaults(legacyDefaults: string[]): DefaultsConfig {
	if (legacyDefaults.length === 0) {
		return { providers: {} };
	}

	const provider = legacyDefaults[0];
	if (!provider) {
		return { providers: {} };
	}

	const config: DefaultsConfig = {
		defaultProvider: provider,
		providers: {
			[provider]: {},
		},
	};

	// Parse legacy args
	for (let i = 1; i < legacyDefaults.length; i++) {
		const arg = legacyDefaults[i];
		if (!arg) continue;

		if (arg === "-m" && i + 1 < legacyDefaults.length) {
			const model = legacyDefaults[i + 1];
			if (model && config.providers[provider]) {
				config.providers[provider].model = model;
			}
			i++; // Skip the value
		} else if (arg.startsWith("--")) {
			const optName = arg.slice(2);

			if (i + 1 < legacyDefaults.length && !legacyDefaults[i + 1]?.startsWith("-")) {
				// Has a value
				const value = legacyDefaults[i + 1];
				if (value && config.providers[provider]) {
					config.providers[provider][optName] = value;
				}
				i++; // Skip the value
			} else {
				// Boolean flag
				if (config.providers[provider]) {
					config.providers[provider][optName] = true;
				}
			}
		}
	}

	return config;
}

export function saveDefaultsConfig(config: DefaultsConfig): void {
	ensureDefaultsDir();
	writeFileSync(DEFAULTS_FILE, JSON.stringify(config, null, 2));
}

export function saveProviderDefaults(provider: string, defaults: ProviderDefaults): void {
	const config = loadDefaultsConfig();

	if (!config.providers) {
		config.providers = {};
	}

	config.providers[provider] = defaults;

	// Set as default provider if no default is set
	if (!config.defaultProvider) {
		config.defaultProvider = provider;
	}

	saveDefaultsConfig(config);
}

export function setDefaultProvider(provider: string): void {
	const config = loadDefaultsConfig();
	config.defaultProvider = provider;
	saveDefaultsConfig(config);
}

export function getProviderDefaults(provider: string): ProviderDefaults {
	const config = loadDefaultsConfig();
	return config.providers[provider] || {};
}

// Legacy function to maintain compatibility
export function saveDefaults(args: string[]): void {
	if (args.length === 0) return;

	const provider = args[0];
	if (!provider) return;

	const defaults: ProviderDefaults = {};

	// Parse args
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;

		if (arg === "-m" && i + 1 < args.length) {
			const model = args[i + 1];
			if (model) {
				defaults.model = model;
			}
			i++; // Skip the value
		} else if (arg.startsWith("--")) {
			const optName = arg.slice(2);

			if (i + 1 < args.length && !args[i + 1]?.startsWith("-")) {
				// Has a value
				const value = args[i + 1];
				if (value) {
					defaults[optName] = value;
				}
				i++; // Skip the value
			} else {
				// Boolean flag
				defaults[optName] = true;
			}
		}
	}

	saveProviderDefaults(provider, defaults);
}
