import { Command, Option } from "commander";
import { z } from "zod";
import {
	getZodSchemaFields,
	getAllFields,
	getFieldType,
	getFieldDoc,
	isRequired,
	getEnumValues,
} from "./schema-introspection.js";
import type { FieldMetadata } from "./schema-introspection.js";
import {
	getCapableModels,
	getValidProviders,
	validateProvider,
	type ModelValidationConfig,
} from "./provider-validation.js";

// Re-export types that are used in tests
export type { FieldMetadata };

/**
 * Configuration for command generation
 */
export interface CommandGenerationConfig {
	/** Zod schemas for each provider */
	schemas: Record<string, z.ZodTypeAny>;
	/** Fields to exclude from option generation */
	excludeFields?: string[];
	/** Custom field configurations */
	fieldOverrides?: Record<string, Partial<FieldMetadata>>;
	/** Whether to make API key optional (when env vars are available) */
	optionalApiKey?: boolean;
}

/**
 * Parsed CLI arguments with type information
 */
export interface ParsedArgs {
	provider: string;
	rawOptions: Record<string, unknown>;
	parsedOptions: Record<string, unknown>;
	validationErrors: string[];
}

/**
 * Create a Commander option from a field's metadata
 */
export function createOptionFromField(field: string, metadata: FieldMetadata, config: CommandGenerationConfig): Option {
	const override = config.fieldOverrides?.[field];
	const finalMetadata = { ...metadata, ...override };

	let flagName = `--${field}`;

	// Handle short flags for common options
	if (field === "model") flagName = "-m, --model";

	let option: Option;

	if (finalMetadata.type === "boolean") {
		option = new Option(flagName, finalMetadata.description || `Enable ${field}`);
	} else if (finalMetadata.type === "enum" && finalMetadata.enumValues) {
		option = new Option(`${flagName} <value>`, finalMetadata.description || `${field} value`).choices(
			finalMetadata.enumValues,
		);
	} else if (finalMetadata.type === "number") {
		option = new Option(`${flagName} <number>`, finalMetadata.description || `${field} value`).argParser((value) => {
			const parsed = parseFloat(value);
			if (isNaN(parsed)) {
				throw new Error(`${field} must be a number`);
			}
			return parsed;
		});
	} else if (finalMetadata.type === "string[]") {
		option = new Option(`${flagName} <values...>`, finalMetadata.description || `${field} values (space-separated)`);
	} else {
		// string or fallback
		option = new Option(`${flagName} <value>`, finalMetadata.description || `${field} value`);
	}

	// Make required fields mandatory (with special handling for apiKey)
	if (!finalMetadata.isOptional && field !== "apiKey") {
		option.makeOptionMandatory();
	} else if (field === "apiKey" && !config.optionalApiKey && !finalMetadata.isOptional) {
		option.makeOptionMandatory();
	}

	return option;
}

/**
 * Add all schema-based options to a command
 */
export function addSchemaOptionsToCommand(
	command: Command,
	provider: string,
	config: CommandGenerationConfig,
): Command {
	const fields = getAllFields(config.schemas, provider);
	const excludeFields = new Set(config.excludeFields || []);

	for (const field of fields) {
		if (excludeFields.has(field)) continue;

		const fieldType = getFieldType(config.schemas, provider, field);
		const required = isRequired(config.schemas, provider, field);
		const doc = getFieldDoc(config.schemas, provider, field);
		const enumValues = getEnumValues(config.schemas, provider, field);

		const metadata: FieldMetadata = {
			type: (fieldType as FieldMetadata["type"]) || "string",
			isOptional: !required,
			...(enumValues && { enumValues }),
			...(doc && { description: doc }),
		};

		const option = createOptionFromField(field, metadata, config);
		command.addOption(option);
	}

	return command;
}

/**
 * Create a provider-specific command with all options
 */
export function createProviderCommand(
	provider: string,
	config: CommandGenerationConfig,
	action?: (options: Record<string, unknown>) => void | Promise<void>,
): Command {
	const command = new Command(provider);
	command.description(`Execute using ${provider} provider`);

	// Add all schema-based options
	addSchemaOptionsToCommand(command, provider, config);

	// Set action if provided
	if (action) {
		command.action(action);
	}

	return command;
}

/**
 * Parse and validate command line arguments against schema
 */
export function parseAndValidateArgs(args: string[], provider: string, config: CommandGenerationConfig): ParsedArgs {
	const result: ParsedArgs = {
		provider,
		rawOptions: {},
		parsedOptions: {},
		validationErrors: [],
	};

	// Simple argument parsing (can be enhanced)
	const rawOptions: Record<string, unknown> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;

		if (arg === "-m" && i + 1 < args.length) {
			const model = args[i + 1];
			if (model) {
				rawOptions["model"] = model;
			}
			i++;
		} else if (arg.startsWith("--")) {
			const optName = arg.slice(2);

			if (i + 1 < args.length && !args[i + 1]?.startsWith("-")) {
				const value = args[i + 1];
				if (value) {
					rawOptions[optName] = parseValue(value);
				}
				i++;
			} else {
				rawOptions[optName] = true;
			}
		}
	}

	result.rawOptions = rawOptions;

	// Validate against schema if available
	const schema = config.schemas[provider];
	if (schema && schema instanceof z.ZodObject) {
		try {
			const parsed = schema.parse(rawOptions);
			result.parsedOptions = parsed;
		} catch (error) {
			if (error instanceof z.ZodError) {
				result.validationErrors = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
			} else {
				result.validationErrors = [`Validation error: ${error}`];
			}
		}
	} else {
		// No schema validation, just copy raw options
		result.parsedOptions = rawOptions;
	}

	return result;
}

/**
 * Helper to parse string values to appropriate types
 */
function parseValue(value: string): unknown {
	if (value.toLowerCase() === "true") return true;
	if (value.toLowerCase() === "false") return false;
	const num = Number(value);
	if (!isNaN(num)) return num;
	return value;
}

/**
 * Generate help text for a provider's options
 */
export function generateProviderHelp(provider: string, config: CommandGenerationConfig): string {
	const lines: string[] = [];
	lines.push(`Options for ${provider}:`);
	lines.push("");

	const fields = getAllFields(config.schemas, provider);
	const excludeFields = new Set(config.excludeFields || []);

	for (const field of fields) {
		if (excludeFields.has(field)) continue;

		const fieldType = getFieldType(config.schemas, provider, field);
		const required = isRequired(config.schemas, provider, field);
		const doc = getFieldDoc(config.schemas, provider, field);
		const enumValues = getEnumValues(config.schemas, provider, field);

		let flagDisplay = `--${field}`;
		if (field === "model") flagDisplay = "-m, --model";

		if (fieldType !== "boolean") {
			flagDisplay += ` <${fieldType || "value"}>`;
		}

		const requiredText = required ? " (required)" : " (optional)";
		const description = doc || `${field} option`;

		lines.push(`  ${flagDisplay.padEnd(25)} ${description}${requiredText}`);

		if (enumValues) {
			lines.push(`${" ".repeat(27)} Choices: ${enumValues.join(", ")}`);
		}
	}

	return lines.join("\n");
}

/**
 * Create a models listing command
 */
export function createModelsCommand(
	modelRegistries: Record<string, Record<string, unknown>>,
	modelToProvider: Record<string, string>,
): Command {
	const command = new Command("models");
	command.description("List available models");

	command.option("-p, --provider <provider>", "Filter by provider");
	command.option("--tools", "Show only models that support tools");
	command.option("--images", "Show only models that support image input");
	command.option("--json", "Output as JSON");

	command.action((options) => {
		// Implementation would use the registries to list models
		// This is a stub that could be implemented based on specific needs
		console.log("Models command - implementation depends on registry structure");
	});

	return command;
}

/**
 * Batch create commands for all providers
 */
export function createProviderCommands(
	config: CommandGenerationConfig,
	actions?: Record<string, (options: Record<string, unknown>) => void | Promise<void>>,
): Record<string, Command> {
	const commands: Record<string, Command> = {};

	const providers = Object.keys(config.schemas).filter((key) => key !== "base");

	for (const provider of providers) {
		const action = actions?.[provider];
		commands[provider] = createProviderCommand(provider, config, action);
	}

	return commands;
}

/**
 * Configuration for complete CLI application
 */
export interface CLIApplicationConfig {
	/** Command generation config for schemas */
	commandConfig: CommandGenerationConfig;
	/** Model validation config for capability checking */
	modelConfig: ModelValidationConfig;
	/** Custom provider filter (e.g., exclude anthropic for bridging) */
	providerFilter?: (providers: string[]) => string[];
	/** Custom model data formatter */
	formatModelInfo?: (model: string, data: any) => string;
}

/**
 * Create a complete models command with full functionality
 */
export function createCompleteModelsCommand(config: CLIApplicationConfig): Command {
	const command = new Command("models");
	command.description("List available models");

	command.option("-p, --provider <provider>", "Filter by provider");
	command.option("--tools", "Show only models that support tools");
	command.option("--images", "Show only models that support image input");
	command.option("--cheap", "Show only models under $1/M input tokens");
	command.option("--json", "Output as JSON");

	command.action((options) => {
		const provider = options.provider?.toLowerCase();

		// Validate provider if specified
		if (provider) {
			const validProviders = getValidProviders();
			if (!validateProvider(provider, validProviders)) {
				console.error(`❌ Invalid provider: ${provider}. Valid providers: ${validProviders.join(", ")}`);
				process.exit(1);
			}
		}

		// Use model filtering from config
		const filterConfig = {
			...config.modelConfig,
			requiredCapabilities: {
				...(options.tools && { tools: true }),
				...(options.images && { images: true }),
			},
		};

		const capableModelsByProvider = getCapableModels(filterConfig);

		// Convert to format expected by display logic
		let modelsToShow: Array<[string, any]> = [];

		// Filter by provider if specified
		const allProviders = getValidProviders();
		const availableProviders = config.providerFilter ? config.providerFilter(allProviders) : allProviders;
		const providersToShow = provider ? [provider] : availableProviders;

		for (const providerName of providersToShow) {
			const models = capableModelsByProvider[providerName as keyof typeof capableModelsByProvider] || [];
			for (const model of models) {
				// Get model data from the registries
				let modelData;
				for (const registry of Object.values(config.modelConfig.modelRegistries)) {
					if (model in registry) {
						modelData = registry[model];
						break;
					}
				}

				// Apply price filtering if requested
				if (options.cheap && modelData?.pricing) {
					if (modelData.pricing.inputPerMillion > 1) {
						continue; // Skip expensive models
					}
				}

				if (modelData) {
					modelsToShow.push([model, modelData]);
				}
			}
		}

		// Sort by provider, then by name
		modelsToShow.sort(([a], [b]) => {
			const providerA = config.modelConfig.modelToProvider[a];
			const providerB = config.modelConfig.modelToProvider[b];
			if (providerA && providerB && providerA !== providerB) {
				return providerA.localeCompare(providerB);
			}
			return a.localeCompare(b);
		});

		if (options.json) {
			const output = modelsToShow.reduce((acc, [modelId, data]) => {
				acc[modelId] = {
					provider: config.modelConfig.modelToProvider[modelId],
					...data,
				};
				return acc;
			}, {} as any);
			console.log(JSON.stringify(output, null, 2));
			return;
		}

		// Group by provider for display
		const byProvider: { [key: string]: Array<[string, any]> } = {};
		for (const [modelId, data] of modelsToShow) {
			const modelProvider = config.modelConfig.modelToProvider[modelId];
			if (modelProvider) {
				if (!byProvider[modelProvider]) {
					byProvider[modelProvider] = [];
				}
				byProvider[modelProvider].push([modelId, data]);
			}
		}

		console.log(`\n📋 Available Models (${modelsToShow.length} total)\n`);

		for (const [providerName, models] of Object.entries(byProvider)) {
			console.log(`🤖 ${providerName.toUpperCase()} (${models.length} models):`);
			for (const [modelId, data] of models) {
				const info = config.formatModelInfo ? config.formatModelInfo(modelId, data) : `${modelId}`;
				console.log(`  ${info}`);
				console.log();
			}
		}

		// Only show usage and filters help if no filters were applied
		const hasFilters = provider || options.tools || options.images || options.cheap;
		if (!hasFilters) {
			console.log("Usage:");
			console.log('  <app> <provider> -m <model> "Your message"');
			console.log("\nFilters:");
			console.log("  --provider <name>  Show only models from specific provider");
			console.log("  --tools           Show only models that support function calling");
			console.log("  --images          Show only models that support image input");
			console.log("  --cheap           Show only models under $1/M input tokens");
			console.log("  --json            Output as JSON for scripting");
		}
	});

	return command;
}

/**
 * Create a complete one-shot provider command with message handling
 */
export function createCompleteProviderCommand(
	provider: string,
	config: CLIApplicationConfig,
	executeAction: (provider: string, message: string, options: any, attachments?: any[]) => Promise<void>,
): Command {
	const command = createProviderCommand(provider, config.commandConfig);

	// Add message argument
	command.argument("<message>", "Message to send to the model");

	// Add image options for multimodal models
	command.option("-i, --image <path>", "Path to image file to include in the message");
	command.option("--images <paths...>", "Paths to multiple image files (space-separated)");

	command.action(async (message: string, options: any) => {
		try {
			// Validate provider and model if specified
			if (options.model) {
				// Basic validation - apps can add more specific validation
				const validProviders = getValidProviders();
				if (!validateProvider(provider, validProviders)) {
					console.error(`❌ Invalid provider: ${provider}`);
					process.exit(1);
				}
			}

			// Handle attachments (basic stub - apps can implement image loading)
			const attachments: any[] = [];

			await executeAction(provider, message, options, attachments);
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

	return command;
}

/**
 * Create all provider commands for an application
 */
export function createCompleteProviderCommands(
	config: CLIApplicationConfig,
	executeAction: (provider: string, message: string, options: any, attachments?: any[]) => Promise<void>,
): Record<string, Command> {
	const commands: Record<string, Command> = {};

	const allProviders = getValidProviders();
	const availableProviders = config.providerFilter ? config.providerFilter(allProviders) : allProviders;

	for (const provider of availableProviders) {
		commands[provider] = createCompleteProviderCommand(provider, config, executeAction);
	}

	return commands;
}
