import { lemmy } from "./index.js";
import {
	AllModels,
	AnthropicModelData,
	GoogleModelData,
	ModelToProvider,
	OpenAIModelData,
} from "./generated/models.js";
import { AnthropicConfig, ChatClient, GoogleConfig, OpenAIConfig, TokenUsage } from "./types.js";
import { CONFIG_SCHEMA } from "./generated/config-schema.js";

// Re-export model types and data
export * from "./generated/models.js";

// Provider utilities for CLI usage
export function getProviderForModel(model: AllModels): "anthropic" | "openai" | "google" {
	return ModelToProvider[model as keyof typeof ModelToProvider];
}

export function getDefaultApiKeyEnvVar(provider: "anthropic" | "openai" | "google"): string {
	switch (provider) {
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "openai":
			return "OPENAI_API_KEY";
		case "google":
			return "GOOGLE_API_KEY";
		default:
			throw new Error(`Unknown provider: ${provider}`);
	}
}

// Type-safe factory function for CLI usage
export function createClientForModel(
	model: AllModels,
	config: AnthropicConfig | OpenAIConfig | GoogleConfig,
): ChatClient {
	const provider = ModelToProvider[model as keyof typeof ModelToProvider];

	if (provider === "anthropic") {
		return lemmy.anthropic({ ...config, model } as AnthropicConfig);
	} else if (provider === "openai") {
		return lemmy.openai({ ...config, model } as OpenAIConfig);
	} else if (provider === "google") {
		return lemmy.google({ ...config, model } as GoogleConfig);
	} else {
		throw new Error(`Unsupported model: ${model}`);
	}
}

// Helper functions for model lookup
export function findModelData(model: string): ModelData | undefined {
	if (AnthropicModelData[model as keyof typeof AnthropicModelData]) {
		return AnthropicModelData[model as keyof typeof AnthropicModelData] as ModelData;
	}
	if (OpenAIModelData[model as keyof typeof OpenAIModelData]) {
		return OpenAIModelData[model as keyof typeof OpenAIModelData] as ModelData;
	}
	if (GoogleModelData[model as keyof typeof GoogleModelData]) {
		return GoogleModelData[model as keyof typeof GoogleModelData] as ModelData;
	}
	return undefined;
}

export function calculateTokenCost(model: string, tokens: TokenUsage): number {
	const modelData = findModelData(model);
	if (!modelData?.pricing) {
		return 0;
	}

	const inputCost = (tokens.input * modelData.pricing.inputPerMillion) / 1_000_000;
	const outputCost = (tokens.output * modelData.pricing.outputPerMillion) / 1_000_000;

	return inputCost + outputCost;
}

export interface ModelData {
	contextWindow: number;
	maxOutputTokens: number;
	supportsTools: boolean;
	supportsImageInput: boolean;
	pricing: {
		inputPerMillion: number;
		outputPerMillion: number;
	} | null;
}

// Helper functions for CLI parsing using the generated schema
export function getFieldType(provider: string, field: string): string | undefined {
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA];
	if (!providerSchema) return undefined;

	if (field in providerSchema) {
		const fieldSchema = providerSchema[field as keyof typeof providerSchema];
		return (fieldSchema as any)?.type;
	}

	// Check base config if not found in provider-specific config
	if (field in CONFIG_SCHEMA.base) {
		const baseSchema = CONFIG_SCHEMA.base[field as keyof typeof CONFIG_SCHEMA.base];
		return (baseSchema as any)?.type;
	}

	return undefined;
}

export function isRequired(provider: string, field: string): boolean {
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA];
	if (!providerSchema) return false;

	if (field in providerSchema) {
		const fieldSchema = providerSchema[field as keyof typeof providerSchema];
		return (fieldSchema as any)?.required ?? false;
	}

	// Check base config if not found in provider-specific config
	if (field in CONFIG_SCHEMA.base) {
		const baseSchema = CONFIG_SCHEMA.base[field as keyof typeof CONFIG_SCHEMA.base];
		return (baseSchema as any)?.required ?? false;
	}

	return false;
}

export function getFieldDoc(provider: string, field: string): string | undefined {
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA];
	if (!providerSchema) return undefined;

	if (field in providerSchema) {
		const fieldSchema = providerSchema[field as keyof typeof providerSchema];
		return (fieldSchema as any)?.doc;
	}

	// Check base config if not found in provider-specific config
	if (field in CONFIG_SCHEMA.base) {
		const baseSchema = CONFIG_SCHEMA.base[field as keyof typeof CONFIG_SCHEMA.base];
		return (baseSchema as any)?.doc;
	}

	return undefined;
}

export function getEnumValues(provider: string, field: string): string[] | undefined {
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA];
	if (!providerSchema) return undefined;

	if (field in providerSchema) {
		const fieldSchema = providerSchema[field as keyof typeof providerSchema];
		return (fieldSchema as any)?.values as string[] | undefined;
	}

	// Check base config if not found in provider-specific config
	if (field in CONFIG_SCHEMA.base) {
		const baseSchema = CONFIG_SCHEMA.base[field as keyof typeof CONFIG_SCHEMA.base];
		return (baseSchema as any)?.values as string[] | undefined;
	}

	return undefined;
}

// Additional helper function to get all fields for a provider (including base fields)
export function getAllFields(provider: string): string[] {
	const baseFields = Object.keys(CONFIG_SCHEMA.base);
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA];

	if (!providerSchema || provider === "base") {
		return baseFields;
	}

	const providerFields = Object.keys(providerSchema);
	return [...baseFields, ...providerFields];
}

// Helper function to validate provider name
export function isValidProvider(provider: string): boolean {
	return provider in CONFIG_SCHEMA && provider !== "base";
}

// Get all valid provider names
export function getProviders(): string[] {
	return Object.keys(CONFIG_SCHEMA).filter((key) => key !== "base");
}
