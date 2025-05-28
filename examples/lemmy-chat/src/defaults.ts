import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const DEFAULTS_DIR = join(homedir(), ".lemmy-chat");
export const DEFAULTS_FILE = join(DEFAULTS_DIR, "defaults.json");

// Provider-specific configuration types that match the core types
interface AnthropicProviderDefaults {
	model?: string;
	defaults?: {
		thinkingEnabled?: boolean;
		maxThinkingTokens?: number;
		temperature?: number;
		maxOutputTokens?: number;
		context?: any; // Context type
		onChunk?: any; // Function type
		onThinkingChunk?: any; // Function type
	};
}

interface OpenAIProviderDefaults {
	model?: string;
	organization?: string;
	defaults?: {
		reasoningEffort?: "low" | "medium" | "high";
		temperature?: number;
		topP?: number;
		presencePenalty?: number;
		frequencyPenalty?: number;
		maxOutputTokens?: number;
		context?: any; // Context type
		onChunk?: any; // Function type
		onThinkingChunk?: any; // Function type
	};
}

interface GoogleProviderDefaults {
	model?: string;
	projectId?: string;
	defaults?: {
		includeThoughts?: boolean;
		temperature?: number;
		topP?: number;
		topK?: number;
		maxOutputTokens?: number;
		context?: any; // Context type
		onChunk?: any; // Function type
		onThinkingChunk?: any; // Function type
	};
}

export type ProviderDefaults = AnthropicProviderDefaults | OpenAIProviderDefaults | GoogleProviderDefaults;

// For backward compatibility, also export a generic interface
export interface GenericProviderDefaults {
	model?: string;
	[key: string]: any; // Provider-specific options
}

export interface DefaultsConfig {
	defaultProvider?: string;
	providers: {
		[provider: string]: GenericProviderDefaults;
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

	// Parse legacy defaults into new structured format
	const legacyParams: GenericProviderDefaults = {};

	// Parse legacy args
	for (let i = 1; i < legacyDefaults.length; i++) {
		const arg = legacyDefaults[i];
		if (!arg) continue;

		if (arg === "-m" && i + 1 < legacyDefaults.length) {
			const model = legacyDefaults[i + 1];
			if (model) {
				legacyParams.model = model;
			}
			i++; // Skip the value
		} else if (arg.startsWith("--")) {
			const optName = arg.slice(2);

			if (i + 1 < legacyDefaults.length && !legacyDefaults[i + 1]?.startsWith("-")) {
				// Has a value
				const value = legacyDefaults[i + 1];
				if (value) {
					legacyParams[optName] = value;
				}
				i++; // Skip the value
			} else {
				// Boolean flag
				legacyParams[optName] = true;
			}
		}
	}

	// Use saveProviderDefaults to properly structure the data
	const config: DefaultsConfig = {
		defaultProvider: provider,
		providers: {},
	};

	// Create a temporary config and use our structured save function
	const originalFile = existsSync(DEFAULTS_FILE) ? readFileSync(DEFAULTS_FILE, "utf8") : null;

	// Save empty config first
	writeFileSync(DEFAULTS_FILE, JSON.stringify(config, null, 2));

	// Use our structured save function
	try {
		saveProviderDefaults(provider, legacyParams);
		const result = loadDefaultsConfig();
		return result;
	} catch (error) {
		// Restore original file if something went wrong
		if (originalFile) {
			writeFileSync(DEFAULTS_FILE, originalFile);
		}
		throw error;
	}
}

export function saveDefaultsConfig(config: DefaultsConfig): void {
	ensureDefaultsDir();
	writeFileSync(DEFAULTS_FILE, JSON.stringify(config, null, 2));
}

export function saveProviderDefaults(provider: string, defaults: GenericProviderDefaults): void {
	const config = loadDefaultsConfig();

	if (!config.providers) {
		config.providers = {};
	}

	// Separate client creation fields from ask defaults
	const providerConfig: GenericProviderDefaults = {};

	if (defaults.model) {
		providerConfig.model = defaults.model;
	}

	const askDefaults: any = {};

	// Client-specific fields (kept at top level)
	if (provider === "openai" && defaults["organization"]) {
		providerConfig["organization"] = defaults["organization"];
	}
	if (provider === "google" && defaults["projectId"]) {
		providerConfig["projectId"] = defaults["projectId"];
	}

	// Move ask options to defaults field
	for (const [key, value] of Object.entries(defaults)) {
		if (key === "model" || key === "organization" || key === "projectId") continue;
		askDefaults[key] = value;
	}

	// Only add defaults field if we have ask options
	if (Object.keys(askDefaults).length > 0) {
		providerConfig["defaults"] = askDefaults;
	}

	config.providers[provider] = providerConfig;

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

export function getProviderDefaults(provider: string): GenericProviderDefaults {
	const config = loadDefaultsConfig();
	return config.providers[provider] || {};
}

export function getProviderConfig(provider: string, apiKey: string): any {
	const defaults = getProviderDefaults(provider);

	// Build the client config in the new structured format
	const clientConfig: any = {
		apiKey,
		model: defaults.model,
	};

	// Add provider-specific client fields
	if (provider === "openai" && defaults["organization"]) {
		clientConfig.organization = defaults["organization"];
	}
	if (provider === "google" && defaults["projectId"]) {
		clientConfig.projectId = defaults["projectId"];
	}

	// Add the ask defaults if they exist
	if (defaults["defaults"]) {
		clientConfig.defaults = defaults["defaults"];
	}

	return clientConfig;
}

// Legacy function to maintain compatibility
export function saveDefaults(args: string[]): void {
	if (args.length === 0) return;

	const provider = args[0];
	if (!provider) return;

	const defaults: GenericProviderDefaults = {};

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
