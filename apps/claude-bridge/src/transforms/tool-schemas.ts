import { z } from "zod";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ToolDefinition } from "@mariozechner/lemmy";
import type { JSONSchema } from "../types.js";

/**
 * Convert JSON Schema to Zod schema
 */
export function jsonSchemaToZod(jsonSchema: JSONSchema): z.ZodSchema {
	if (!jsonSchema || typeof jsonSchema !== "object") {
		return z.any();
	}

	// Handle $ref resolution
	if (jsonSchema.$ref && jsonSchema.definitions) {
		const refPath = jsonSchema.$ref;
		if (refPath.startsWith("#/definitions/")) {
			const definitionName = refPath.substring("#/definitions/".length);
			const definition = jsonSchema.definitions[definitionName];
			if (definition) {
				return jsonSchemaToZod(definition);
			}
		}
	}

	const type = jsonSchema.type;

	switch (type) {
		case "string":
			let stringSchema = z.string();
			if (jsonSchema.description) {
				stringSchema = stringSchema.describe(jsonSchema.description);
			}
			return stringSchema;

		case "number":
			let numberSchema = z.number();
			if (jsonSchema.description) {
				numberSchema = numberSchema.describe(jsonSchema.description);
			}
			return numberSchema;

		case "integer":
			let intSchema = z.number().int();
			if (jsonSchema.description) {
				intSchema = intSchema.describe(jsonSchema.description);
			}
			return intSchema;

		case "boolean":
			let boolSchema = z.boolean();
			if (jsonSchema.description) {
				boolSchema = boolSchema.describe(jsonSchema.description);
			}
			return boolSchema;

		case "array":
			const itemSchema = jsonSchema.items ? jsonSchemaToZod(jsonSchema.items) : z.any();
			let arraySchema = z.array(itemSchema);
			if (jsonSchema.description) {
				arraySchema = arraySchema.describe(jsonSchema.description);
			}
			return arraySchema;

		case "object":
			const shape: Record<string, z.ZodSchema> = {};

			if (jsonSchema.properties) {
				for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
					shape[key] = jsonSchemaToZod(propSchema);
				}
			}

			let objectSchema = z.object(shape);

			// Handle required fields
			if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
				// Zod objects are required by default, so we need to make non-required fields optional
				const requiredFields = new Set(jsonSchema.required);
				const newShape: Record<string, z.ZodSchema> = {};

				for (const [key, schema] of Object.entries(shape)) {
					newShape[key] = requiredFields.has(key) ? schema : schema.optional();
				}

				objectSchema = z.object(newShape);
			} else {
				// If no required array, make all fields optional
				const newShape: Record<string, z.ZodSchema> = {};
				for (const [key, schema] of Object.entries(shape)) {
					newShape[key] = schema.optional();
				}
				objectSchema = z.object(newShape);
			}

			// Handle additionalProperties
			// Note: Zod doesn't have a direct equivalent to additionalProperties: false
			// The default behavior is to strip unknown properties, which is close enough

			if (jsonSchema.description) {
				objectSchema = objectSchema.describe(jsonSchema.description);
			}

			return objectSchema;

		default:
			return z.any();
	}
}

/**
 * Convert Anthropic Tool to lemmy ToolDefinition with Zod schema
 */
export function convertAnthropicToolToLemmy(anthropicTool: Tool): ToolDefinition | null {
	try {
		const zodSchema = jsonSchemaToZod(anthropicTool.input_schema as JSONSchema);

		return {
			name: anthropicTool.name,
			description: anthropicTool.description || "",
			schema: zodSchema,
			execute: async () => {
				throw new Error("Tool execution not supported in bridge mode");
			},
		};
	} catch (error) {
		console.warn(`Failed to convert Anthropic tool ${anthropicTool.name} to Zod:`, error);
		return null;
	}
}
