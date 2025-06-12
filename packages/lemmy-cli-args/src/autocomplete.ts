import { z } from "zod";
import type { Provider, ModelData } from "@mariozechner/lemmy";
import { getCapableModels, getValidProviders } from "./provider-validation.js";
import { getAllFields, getEnumValues, getFieldType } from "./schema-introspection.js";
import type { ModelValidationConfig } from "./provider-validation.js";

/**
 * Autocomplete suggestion item
 */
export interface CompletionItem {
	value: string;
	label: string;
	description?: string;
	type: "provider" | "model" | "option" | "enum_value";
}

/**
 * Configuration for autocomplete generation
 */
export interface AutocompleteConfig {
	/** Model validation configuration */
	modelConfig: ModelValidationConfig;
	/** Schema configuration for option completion */
	schemas: Record<string, z.ZodTypeAny>;
	/** Whether to include unknown models in completions */
	includeUnknownModels?: boolean;
	/** Maximum number of suggestions to return */
	maxSuggestions?: number;
}

/**
 * Generate provider completions
 */
export function generateProviderCompletions(config: AutocompleteConfig): CompletionItem[] {
	const providers = getValidProviders();

	return providers.map((provider) => ({
		value: provider,
		label: provider,
		description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} provider`,
		type: "provider" as const,
	}));
}

/**
 * Generate model completions for a specific provider
 */
export function generateModelCompletions(
	provider: Provider,
	config: AutocompleteConfig,
	filter?: string,
): CompletionItem[] {
	const capableModels = getCapableModels(config.modelConfig, provider);
	const models = capableModels[provider] || [];

	let filteredModels = models;

	// Apply filter if provided
	if (filter) {
		filteredModels = models.filter((model) => model.toLowerCase().includes(filter.toLowerCase()));
	}

	// Limit results
	if (config.maxSuggestions) {
		filteredModels = filteredModels.slice(0, config.maxSuggestions);
	}

	return filteredModels.map((model) => {
		// Get model data for description
		const modelData = Object.values(config.modelConfig.modelRegistries)
			.map((registry) => registry[model])
			.find(Boolean);

		let description = `${provider} model`;
		if (modelData) {
			const capabilities: string[] = [];
			if (modelData.supportsTools) capabilities.push("🔧 tools");
			if (modelData.supportsImageInput) capabilities.push("🖼️ images");
			if (capabilities.length > 0) {
				description += ` (${capabilities.join(", ")})`;
			}
		}

		return {
			value: model,
			label: model,
			description,
			type: "model" as const,
		};
	});
}

/**
 * Generate option completions for a provider
 */
export function generateOptionCompletions(
	provider: string,
	config: AutocompleteConfig,
	filter?: string,
): CompletionItem[] {
	const fields = getAllFields(config.schemas, provider);

	let filteredFields = fields;

	// Apply filter if provided
	if (filter) {
		filteredFields = fields.filter((field) => field.toLowerCase().includes(filter.toLowerCase()));
	}

	// Limit results
	if (config.maxSuggestions) {
		filteredFields = filteredFields.slice(0, config.maxSuggestions);
	}

	return filteredFields.map((field) => {
		const fieldType = getFieldType(config.schemas, provider, field);

		return {
			value: `--${field}`,
			label: `--${field}`,
			description: `${fieldType || "string"} option`,
			type: "option" as const,
		};
	});
}

/**
 * Generate enum value completions for a specific option
 */
export function generateEnumCompletions(
	provider: string,
	field: string,
	config: AutocompleteConfig,
	filter?: string,
): CompletionItem[] {
	const enumValues = getEnumValues(config.schemas, provider, field);

	if (!enumValues) {
		return [];
	}

	let filteredValues = enumValues;

	// Apply filter if provided
	if (filter) {
		filteredValues = enumValues.filter((value) => value.toLowerCase().includes(filter.toLowerCase()));
	}

	// Limit results
	if (config.maxSuggestions) {
		filteredValues = filteredValues.slice(0, config.maxSuggestions);
	}

	return filteredValues.map((value) => ({
		value,
		label: value,
		description: `${field} option`,
		type: "enum_value" as const,
	}));
}

/**
 * Context-aware completion generation
 */
export interface CompletionContext {
	/** Current command line arguments */
	args: string[];
	/** Current cursor position in args */
	cursorPosition: number;
	/** Partial text being completed */
	partial: string;
}

/**
 * Generate context-aware completions
 */
export function generateContextualCompletions(
	context: CompletionContext,
	config: AutocompleteConfig,
): CompletionItem[] {
	const { args, cursorPosition, partial } = context;

	// Determine what we're completing based on context

	// If no args or first arg, complete providers
	if (args.length === 0 || cursorPosition === 0) {
		return generateProviderCompletions(config);
	}

	// Get the provider from first argument
	const provider = args[0];
	if (!provider) {
		return generateProviderCompletions(config);
	}

	// Validate provider
	const validProviders = getValidProviders();
	if (!validProviders.includes(provider as Provider)) {
		return generateProviderCompletions(config);
	}

	// If second argument and no dashes, complete models
	if (cursorPosition === 1 && !partial.startsWith("-")) {
		return generateModelCompletions(provider as Provider, config, partial);
	}

	// If we see option flags, complete options or enum values
	if (partial.startsWith("--")) {
		const optionName = partial.slice(2);
		return generateOptionCompletions(provider, config, optionName);
	}

	// Check if previous arg was an enum option
	if (cursorPosition > 0) {
		const prevArg = args[cursorPosition - 1];
		if (prevArg?.startsWith("--")) {
			const fieldName = prevArg.slice(2);
			const enumCompletions = generateEnumCompletions(provider, fieldName, config, partial);
			if (enumCompletions.length > 0) {
				return enumCompletions;
			}
		}
	}

	// Default to option completions
	return generateOptionCompletions(provider, config, partial);
}

/**
 * Format completions for shell completion scripts
 */
export function formatForShell(completions: CompletionItem[], format: "bash" | "zsh" | "fish" = "bash"): string {
	switch (format) {
		case "bash":
			return completions.map((item) => item.value).join(" ");

		case "zsh":
			return completions.map((item) => `${item.value}:${item.description || item.label}`).join("\n");

		case "fish":
			return completions.map((item) => `${item.value}\t${item.description || item.label}`).join("\n");

		default:
			return completions.map((item) => item.value).join(" ");
	}
}

/**
 * Generate completion suggestions for a partial command line
 */
export function generateCompletions(commandLine: string, config: AutocompleteConfig): CompletionItem[] {
	// Parse command line into args
	const args = commandLine.trim().split(/\s+/).filter(Boolean);
	const partial = commandLine.endsWith(" ") ? "" : args.pop() || "";
	const cursorPosition = args.length;

	const context: CompletionContext = {
		args,
		cursorPosition,
		partial,
	};

	return generateContextualCompletions(context, config);
}

/**
 * Create a completion function for use with CLI libraries
 */
export function createCompletionFunction(config: AutocompleteConfig) {
	return (commandLine: string): string[] => {
		const completions = generateCompletions(commandLine, config);
		return completions.map((item) => item.value);
	};
}

/**
 * Create provider-specific model completions
 */
export function createProviderModelCompletions(
	providers: Provider[],
	config: AutocompleteConfig,
): Record<Provider, CompletionItem[]> {
	const result = {} as Record<Provider, CompletionItem[]>;

	for (const provider of providers) {
		result[provider] = generateModelCompletions(provider, config);
	}

	return result;
}

/**
 * Get model suggestions with capability filtering
 */
export function getModelSuggestions(
	provider: Provider,
	config: AutocompleteConfig,
	capabilities?: {
		tools?: boolean;
		images?: boolean;
		minContextWindow?: number;
	},
): CompletionItem[] {
	// Create filtered config if capabilities specified
	let filterConfig = config;
	if (capabilities) {
		filterConfig = {
			...config,
			modelConfig: {
				...config.modelConfig,
				requiredCapabilities: capabilities,
			},
		};
	}

	return generateModelCompletions(provider, filterConfig);
}
