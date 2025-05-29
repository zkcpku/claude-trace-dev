import { lemmy } from "./index.js";
import {
	AllModels,
	AnthropicModelData,
	GoogleModelData,
	ModelToProvider,
	OpenAIModelData,
} from "./generated/models.js";
import { ChatClient, TokenUsage } from "./types.js";
import type { AnthropicConfig, GoogleConfig, OpenAIConfig } from "./configs.js";
import { CLIENT_CONFIG_SCHEMAS } from "./configs.js";

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

// Helper functions to extract information from Zod schemas
function getZodSchemaFields(
	schema: any,
): Record<string, { type: string; isOptional: boolean; enumValues?: string[]; description?: string }> {
	const fields: Record<string, { type: string; isOptional: boolean; enumValues?: string[]; description?: string }> =
		{};

	if (schema && schema._def && schema._def.shape) {
		for (const [key, fieldSchema] of Object.entries(schema._def.shape() as any)) {
			const field: any = fieldSchema;
			let type = "string";
			let enumValues: string[] | undefined;
			let isOptional = false;
			let description: string | undefined;

			// Check if field is optional
			if (field._def.typeName === "ZodOptional") {
				isOptional = true;
				// Get the inner type
				const innerField = field._def.innerType;
				if (innerField._def) {
					// Handle coerced types
					if (innerField._def.innerType) {
						const innerType = innerField._def.innerType._def.typeName;
						if (innerType === "ZodNumber") type = "number";
						else if (innerType === "ZodBoolean") type = "boolean";
					}
					// Handle direct types
					else if (innerField._def.typeName === "ZodNumber") type = "number";
					else if (innerField._def.typeName === "ZodBoolean") type = "boolean";
					else if (innerField._def.typeName === "ZodEnum") {
						type = "enum";
						enumValues = innerField._def.values;
					} else if (innerField._def.typeName === "ZodArray") type = "string[]";
				}
			} else {
				// Handle non-optional fields
				if (field._def) {
					// Handle coerced types
					if (field._def.innerType) {
						const innerType = field._def.innerType._def.typeName;
						if (innerType === "ZodNumber") type = "number";
						else if (innerType === "ZodBoolean") type = "boolean";
					}
					// Handle direct types
					else if (field._def.typeName === "ZodNumber") type = "number";
					else if (field._def.typeName === "ZodBoolean") type = "boolean";
					else if (field._def.typeName === "ZodEnum") {
						type = "enum";
						enumValues = field._def.values;
					} else if (field._def.typeName === "ZodArray") type = "string[]";
				}
			}

			// Extract description from JSDoc comments (if available)
			if (field.description) {
				description = field.description;
			}

			fields[key] = {
				type,
				isOptional,
				...(enumValues && { enumValues }),
				...(description && { description }),
			};
		}
	}

	return fields;
}

// Helper functions for CLI parsing using Zod schemas
export function getFieldType(provider: string, field: string): string | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.type;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.type;
	}

	return undefined;
}

export function isRequired(provider: string, field: string): boolean {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return !providerFields[field]?.isOptional;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return !baseFields[field]?.isOptional;
	}

	return false;
}

export function getFieldDoc(provider: string, field: string): string | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.description;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.description;
	}

	return undefined;
}

export function getEnumValues(provider: string, field: string): string[] | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.enumValues;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.enumValues;
	}

	return undefined;
}

// Additional helper function to get all fields for a provider (including base fields)
export function getAllFields(provider: string): string[] {
	const baseFields = Object.keys(getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base));
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];

	if (!providerSchema || provider === "base") {
		return baseFields;
	}

	const providerFields = Object.keys(getZodSchemaFields(providerSchema));
	return [...baseFields, ...providerFields];
}

// Helper function to validate provider name
export function isValidProvider(provider: string): boolean {
	return provider in CLIENT_CONFIG_SCHEMAS && provider !== "base";
}

// Get all valid provider names
export function getProviders(): string[] {
	return Object.keys(CLIENT_CONFIG_SCHEMAS).filter((key) => key !== "base");
}
