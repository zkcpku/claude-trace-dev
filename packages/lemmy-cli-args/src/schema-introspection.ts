import { z } from "zod";

/**
 * Metadata extracted from a Zod schema field
 */
export interface FieldMetadata {
	type: "string" | "number" | "boolean" | "enum" | "string[]";
	isOptional: boolean;
	enumValues?: string[];
	description?: string;
}

/**
 * Extract metadata from all fields in a Zod schema
 */
export function getZodSchemaFields(schema: z.ZodTypeAny): Record<string, FieldMetadata> {
	const fields: Record<string, FieldMetadata> = {};

	// Handle ZodObject
	if (schema instanceof z.ZodObject) {
		const shape = schema.shape;
		for (const [key, field] of Object.entries(shape)) {
			let type: FieldMetadata["type"] = "string";
			let isOptional = false;
			let enumValues: string[] | undefined;
			let description: string | undefined;

			// Cast field to any to access _def properties (Zod internal API)
			const zodField = field as any;

			// Check if field is optional
			if (zodField._def?.typeName === "ZodOptional") {
				isOptional = true;
				// Get the inner type
				const innerField = zodField._def.innerType;
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
				if (zodField._def) {
					// Handle coerced types
					if (zodField._def.innerType) {
						const innerType = zodField._def.innerType._def.typeName;
						if (innerType === "ZodNumber") type = "number";
						else if (innerType === "ZodBoolean") type = "boolean";
					}
					// Handle direct types
					else if (zodField._def.typeName === "ZodNumber") type = "number";
					else if (zodField._def.typeName === "ZodBoolean") type = "boolean";
					else if (zodField._def.typeName === "ZodEnum") {
						type = "enum";
						enumValues = zodField._def.values;
					} else if (zodField._def.typeName === "ZodArray") type = "string[]";
				}
			}

			// Extract description from JSDoc comments (if available)
			if (zodField.description) {
				description = zodField.description;
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

/**
 * Get the type of a specific field from a schema
 */
export function getFieldType(
	schemas: Record<string, z.ZodTypeAny>,
	provider: string,
	field: string,
): string | undefined {
	const providerSchema = schemas[provider];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.type;
		}
	}

	// Check base schema if not found in provider-specific schema
	const baseSchema = schemas["base"];
	if (baseSchema) {
		const baseFields = getZodSchemaFields(baseSchema);
		if (field in baseFields) {
			return baseFields[field]?.type;
		}
	}

	return undefined;
}

/**
 * Check if a field is required (not optional)
 */
export function isRequired(schemas: Record<string, z.ZodTypeAny>, provider: string, field: string): boolean {
	const providerSchema = schemas[provider];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return !providerFields[field]?.isOptional;
		}
	}

	// Check base schema if not found in provider-specific schema
	const baseSchema = schemas["base"];
	if (baseSchema) {
		const baseFields = getZodSchemaFields(baseSchema);
		if (field in baseFields) {
			return !baseFields[field]?.isOptional;
		}
	}

	return false;
}

/**
 * Get field documentation/description
 */
export function getFieldDoc(
	schemas: Record<string, z.ZodTypeAny>,
	provider: string,
	field: string,
): string | undefined {
	const providerSchema = schemas[provider];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.description;
		}
	}

	// Check base schema if not found in provider-specific schema
	const baseSchema = schemas["base"];
	if (baseSchema) {
		const baseFields = getZodSchemaFields(baseSchema);
		if (field in baseFields) {
			return baseFields[field]?.description;
		}
	}

	return undefined;
}

/**
 * Get enum values for a field (if it's an enum type)
 */
export function getEnumValues(
	schemas: Record<string, z.ZodTypeAny>,
	provider: string,
	field: string,
): string[] | undefined {
	const providerSchema = schemas[provider];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.enumValues;
		}
	}

	// Check base schema if not found in provider-specific schema
	const baseSchema = schemas["base"];
	if (baseSchema) {
		const baseFields = getZodSchemaFields(baseSchema);
		if (field in baseFields) {
			return baseFields[field]?.enumValues;
		}
	}

	return undefined;
}

/**
 * Get all fields for a provider (including base fields)
 */
export function getAllFields(schemas: Record<string, z.ZodTypeAny>, provider: string): string[] {
	const baseSchema = schemas["base"];
	const baseFields = baseSchema ? Object.keys(getZodSchemaFields(baseSchema)) : [];

	const providerSchema = schemas[provider];
	if (!providerSchema || provider === "base") {
		return baseFields;
	}

	const providerFields = Object.keys(getZodSchemaFields(providerSchema));
	return [...baseFields, ...providerFields];
}

/**
 * Check if a provider is valid (exists in schemas)
 */
export function isValidProvider(schemas: Record<string, z.ZodTypeAny>, provider: string): boolean {
	return provider in schemas && provider !== "base";
}

/**
 * Get all valid provider names
 */
export function getProviders(schemas: Record<string, z.ZodTypeAny>): string[] {
	return Object.keys(schemas).filter((key) => key !== "base");
}
