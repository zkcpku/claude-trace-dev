import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
	getZodSchemaFields,
	getFieldType,
	isRequired,
	getFieldDoc,
	getEnumValues,
	getAllFields,
	isValidProvider,
	getProviders,
} from "../src/schema-introspection.js";

// Mock schemas for testing
const MockBaseSchema = z.object({
	apiKey: z.string().describe("API key for authentication"),
	baseURL: z.string().optional().describe("Custom API base URL"),
	maxRetries: z.coerce.number().min(0).optional().describe("Maximum number of retries"),
});

const MockAnthropicSchema = z.object({
	model: z.string().describe("Anthropic model to use"),
	thinkingEnabled: z.coerce.boolean().optional().describe("Enable thinking mode"),
	temperature: z.coerce.number().min(0).max(1).optional().describe("Temperature for sampling"),
	topK: z.coerce.number().min(1).optional().describe("Top-K sampling parameter"),
	toolChoice: z.enum(["auto", "any", "none"]).optional().describe("Tool choice strategy"),
});

const MockOpenAISchema = z.object({
	model: z.string().describe("OpenAI model to use"),
	reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Reasoning effort level"),
	temperature: z.coerce.number().min(0).max(2).optional().describe("Temperature for sampling"),
	responseFormat: z.enum(["text", "json_object"]).optional().describe("Response format"),
});

const mockSchemas = {
	base: MockBaseSchema,
	anthropic: MockAnthropicSchema,
	openai: MockOpenAISchema,
};

describe("Schema Introspection", () => {
	describe("getZodSchemaFields", () => {
		it("should extract field metadata from Zod schema", () => {
			const fields = getZodSchemaFields(MockBaseSchema);

			expect(fields).toHaveProperty("apiKey");
			expect(fields).toHaveProperty("baseURL");
			expect(fields).toHaveProperty("maxRetries");

			// Check apiKey (required string)
			expect(fields.apiKey.type).toBe("string");
			expect(fields.apiKey.isOptional).toBe(false);
			expect(fields.apiKey.description).toBe("API key for authentication");

			// Check baseURL (optional string)
			expect(fields.baseURL.type).toBe("string");
			expect(fields.baseURL.isOptional).toBe(true);
			expect(fields.baseURL.description).toBe("Custom API base URL");

			// Check maxRetries (optional coerced number)
			expect(fields.maxRetries.type).toBe("number");
			expect(fields.maxRetries.isOptional).toBe(true);
			expect(fields.maxRetries.description).toBe("Maximum number of retries");
		});

		it("should handle boolean fields", () => {
			const fields = getZodSchemaFields(MockAnthropicSchema);

			expect(fields.thinkingEnabled.type).toBe("boolean");
			expect(fields.thinkingEnabled.isOptional).toBe(true);
		});

		it("should handle enum fields", () => {
			const fields = getZodSchemaFields(MockAnthropicSchema);

			expect(fields.toolChoice.type).toBe("enum");
			expect(fields.toolChoice.enumValues).toEqual(["auto", "any", "none"]);
			expect(fields.toolChoice.isOptional).toBe(true);
		});

		it("should handle number fields with coercion", () => {
			const fields = getZodSchemaFields(MockAnthropicSchema);

			expect(fields.temperature.type).toBe("number");
			expect(fields.topK.type).toBe("number");
		});

		it("should handle required vs optional fields correctly", () => {
			const fields = getZodSchemaFields(MockAnthropicSchema);

			// model is required
			expect(fields.model.isOptional).toBe(false);
			// everything else is optional
			expect(fields.thinkingEnabled.isOptional).toBe(true);
			expect(fields.temperature.isOptional).toBe(true);
			expect(fields.toolChoice.isOptional).toBe(true);
		});
	});

	describe("getFieldType", () => {
		it("should get field type from provider schema", () => {
			expect(getFieldType(mockSchemas, "anthropic", "model")).toBe("string");
			expect(getFieldType(mockSchemas, "anthropic", "thinkingEnabled")).toBe("boolean");
			expect(getFieldType(mockSchemas, "anthropic", "temperature")).toBe("number");
			expect(getFieldType(mockSchemas, "anthropic", "toolChoice")).toBe("enum");
		});

		it("should fall back to base schema", () => {
			expect(getFieldType(mockSchemas, "anthropic", "apiKey")).toBe("string");
			expect(getFieldType(mockSchemas, "anthropic", "maxRetries")).toBe("number");
		});

		it("should return undefined for unknown fields", () => {
			expect(getFieldType(mockSchemas, "anthropic", "unknownField")).toBeUndefined();
		});

		it("should handle different providers", () => {
			expect(getFieldType(mockSchemas, "openai", "reasoningEffort")).toBe("enum");
			expect(getFieldType(mockSchemas, "openai", "responseFormat")).toBe("enum");
		});
	});

	describe("isRequired", () => {
		it("should identify required fields", () => {
			expect(isRequired(mockSchemas, "anthropic", "model")).toBe(true);
			expect(isRequired(mockSchemas, "base", "apiKey")).toBe(true);
		});

		it("should identify optional fields", () => {
			expect(isRequired(mockSchemas, "anthropic", "thinkingEnabled")).toBe(false);
			expect(isRequired(mockSchemas, "anthropic", "temperature")).toBe(false);
			expect(isRequired(mockSchemas, "base", "baseURL")).toBe(false);
		});

		it("should fall back to base schema", () => {
			expect(isRequired(mockSchemas, "anthropic", "apiKey")).toBe(true);
			expect(isRequired(mockSchemas, "anthropic", "baseURL")).toBe(false);
		});

		it("should return false for unknown fields", () => {
			expect(isRequired(mockSchemas, "anthropic", "unknownField")).toBe(false);
		});
	});

	describe("getFieldDoc", () => {
		it("should get field documentation", () => {
			expect(getFieldDoc(mockSchemas, "anthropic", "model")).toBe("Anthropic model to use");
			expect(getFieldDoc(mockSchemas, "anthropic", "thinkingEnabled")).toBe("Enable thinking mode");
			expect(getFieldDoc(mockSchemas, "base", "apiKey")).toBe("API key for authentication");
		});

		it("should fall back to base schema", () => {
			expect(getFieldDoc(mockSchemas, "anthropic", "apiKey")).toBe("API key for authentication");
			expect(getFieldDoc(mockSchemas, "anthropic", "maxRetries")).toBe("Maximum number of retries");
		});

		it("should return undefined for fields without documentation", () => {
			const schemaWithoutDocs = z.object({
				field: z.string(),
			});
			const schemas = { test: schemaWithoutDocs };

			expect(getFieldDoc(schemas, "test", "field")).toBeUndefined();
		});
	});

	describe("getEnumValues", () => {
		it("should get enum values", () => {
			expect(getEnumValues(mockSchemas, "anthropic", "toolChoice")).toEqual(["auto", "any", "none"]);
			expect(getEnumValues(mockSchemas, "openai", "reasoningEffort")).toEqual(["low", "medium", "high"]);
			expect(getEnumValues(mockSchemas, "openai", "responseFormat")).toEqual(["text", "json_object"]);
		});

		it("should return undefined for non-enum fields", () => {
			expect(getEnumValues(mockSchemas, "anthropic", "model")).toBeUndefined();
			expect(getEnumValues(mockSchemas, "anthropic", "temperature")).toBeUndefined();
		});

		it("should return undefined for unknown fields", () => {
			expect(getEnumValues(mockSchemas, "anthropic", "unknownField")).toBeUndefined();
		});
	});

	describe("getAllFields", () => {
		it("should get all fields for a provider (including base)", () => {
			const anthropicFields = getAllFields(mockSchemas, "anthropic");

			// Should include base fields
			expect(anthropicFields).toContain("apiKey");
			expect(anthropicFields).toContain("baseURL");
			expect(anthropicFields).toContain("maxRetries");

			// Should include provider-specific fields
			expect(anthropicFields).toContain("model");
			expect(anthropicFields).toContain("thinkingEnabled");
			expect(anthropicFields).toContain("temperature");
			expect(anthropicFields).toContain("toolChoice");
		});

		it("should handle different providers", () => {
			const openaiFields = getAllFields(mockSchemas, "openai");

			// Should include base fields
			expect(openaiFields).toContain("apiKey");
			expect(openaiFields).toContain("baseURL");

			// Should include OpenAI-specific fields
			expect(openaiFields).toContain("model");
			expect(openaiFields).toContain("reasoningEffort");
			expect(openaiFields).toContain("responseFormat");

			// Should not include Anthropic-specific fields
			expect(openaiFields).not.toContain("thinkingEnabled");
			expect(openaiFields).not.toContain("toolChoice");
		});

		it("should return only base fields for 'base' provider", () => {
			const baseFields = getAllFields(mockSchemas, "base");

			expect(baseFields).toContain("apiKey");
			expect(baseFields).toContain("baseURL");
			expect(baseFields).toContain("maxRetries");
			expect(baseFields).not.toContain("model");
			expect(baseFields).not.toContain("thinkingEnabled");
		});

		it("should handle unknown providers gracefully", () => {
			const unknownFields = getAllFields(mockSchemas, "unknown");

			// Should still return base fields
			expect(unknownFields).toContain("apiKey");
			expect(unknownFields).toContain("baseURL");
			expect(unknownFields).toContain("maxRetries");
		});
	});

	describe("isValidProvider", () => {
		it("should validate known providers", () => {
			expect(isValidProvider(mockSchemas, "anthropic")).toBe(true);
			expect(isValidProvider(mockSchemas, "openai")).toBe(true);
		});

		it("should reject base as a provider", () => {
			expect(isValidProvider(mockSchemas, "base")).toBe(false);
		});

		it("should reject unknown providers", () => {
			expect(isValidProvider(mockSchemas, "unknown")).toBe(false);
			expect(isValidProvider(mockSchemas, "")).toBe(false);
		});
	});

	describe("getProviders", () => {
		it("should return all valid providers", () => {
			const providers = getProviders(mockSchemas);

			expect(providers).toContain("anthropic");
			expect(providers).toContain("openai");
			expect(providers).not.toContain("base");
		});

		it("should filter out base schema", () => {
			const providers = getProviders(mockSchemas);

			expect(providers).not.toContain("base");
		});
	});

	describe("edge cases and error handling", () => {
		it("should handle empty schemas", () => {
			const emptySchema = z.object({});
			const fields = getZodSchemaFields(emptySchema);

			expect(fields).toEqual({});
		});

		it("should handle schemas with complex nested types", () => {
			const complexSchema = z.object({
				arrayField: z.array(z.string()).optional().describe("Array of strings"),
				unionField: z.union([z.string(), z.number()]).optional().describe("String or number"),
			});

			const fields = getZodSchemaFields(complexSchema);

			expect(fields.arrayField.type).toBe("string[]");
			expect(fields.arrayField.isOptional).toBe(true);

			// Union types default to string
			expect(fields.unionField.type).toBe("string");
		});

		it("should handle schemas without descriptions", () => {
			const schemaWithoutDocs = z.object({
				field1: z.string(),
				field2: z.number().optional(),
			});

			const fields = getZodSchemaFields(schemaWithoutDocs);

			expect(fields.field1.description).toBeUndefined();
			expect(fields.field2.description).toBeUndefined();
		});
	});
});
