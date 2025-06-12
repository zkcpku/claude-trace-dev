import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type { SchemaConverter } from "../types.js";

/**
 * Convert JSON Schema to Zod schema
 * Handles the conversion from MCP tool schemas to Zod for validation
 */
export function jsonSchemaToZodSchema(jsonSchema: Record<string, unknown>): z.ZodSchema {
	try {
		// Use json-schema-to-zod library for conversion
		const zodSchemaString = jsonSchemaToZod(jsonSchema);

		// For now, we'll create a permissive object schema
		// In a full implementation, we'd eval the generated string
		// or use a more sophisticated conversion approach

		if (jsonSchema.type === "object") {
			const properties = (jsonSchema.properties as Record<string, any>) || {};
			const required = (jsonSchema.required as string[]) || [];

			const shape: Record<string, z.ZodSchema> = {};

			for (const [key, prop] of Object.entries(properties)) {
				shape[key] = convertJsonPropertyToZod(prop, required.includes(key));
			}

			return z.object(shape);
		}

		// Fallback for non-object schemas
		return z.record(z.unknown());
	} catch (error) {
		console.warn("Failed to convert JSON Schema to Zod:", error);
		// Fallback to permissive schema
		return z.record(z.unknown());
	}
}

/**
 * Convert Zod schema to JSON Schema
 */
export function zodSchemaToJsonSchema(zodSchema: z.ZodSchema): Record<string, unknown> {
	try {
		return zodToJsonSchema(zodSchema) as Record<string, unknown>;
	} catch (error) {
		console.warn("Failed to convert Zod Schema to JSON Schema:", error);
		return {
			type: "object",
			additionalProperties: true,
		};
	}
}

/**
 * Convert a single JSON Schema property to Zod
 */
function convertJsonPropertyToZod(property: any, isRequired: boolean): z.ZodSchema {
	let schema: z.ZodSchema;

	switch (property.type) {
		case "string":
			schema = z.string();
			if (property.enum) {
				schema = z.enum(property.enum);
			}
			if (property.format === "uri") {
				schema = z.string().url();
			}
			if (property.minLength !== undefined) {
				schema = (schema as z.ZodString).min(property.minLength);
			}
			break;

		case "number":
			schema = z.number();
			if (property.minimum !== undefined) {
				schema = (schema as z.ZodNumber).min(property.minimum);
			}
			if (property.maximum !== undefined) {
				schema = (schema as z.ZodNumber).max(property.maximum);
			}
			break;

		case "boolean":
			schema = z.boolean();
			break;

		case "array":
			const itemSchema = property.items ? convertJsonPropertyToZod(property.items, true) : z.unknown();
			schema = z.array(itemSchema);
			if (property.minItems !== undefined) {
				schema = (schema as z.ZodArray<any>).min(property.minItems);
			}
			break;

		case "object":
			if (property.properties) {
				const shape: Record<string, z.ZodSchema> = {};
				const required = property.required || [];

				for (const [key, prop] of Object.entries(property.properties)) {
					shape[key] = convertJsonPropertyToZod(prop, required.includes(key));
				}

				schema = z.object(shape);
			} else {
				schema = z.record(z.unknown());
			}
			break;

		default:
			schema = z.unknown();
	}

	// Handle default values
	if (property.default !== undefined) {
		schema = schema.default(property.default);
	}

	// Make optional if not required
	if (!isRequired) {
		schema = schema.optional();
	}

	return schema;
}

/**
 * Create schema converter instance
 */
export function createSchemaConverter(): SchemaConverter {
	return {
		jsonSchemaToZod: jsonSchemaToZodSchema,
		zodToJsonSchema: zodSchemaToJsonSchema,
	};
}
