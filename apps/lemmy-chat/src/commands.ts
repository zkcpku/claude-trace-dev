import { Command, Option } from "commander";
import {
	AnthropicModelData,
	OpenAIModelData,
	GoogleModelData,
	ModelToProvider,
	getAllFields,
	getFieldType,
	getFieldDoc,
	isRequired,
	getEnumValues,
	getProviders,
	Attachment,
} from "@mariozechner/lemmy";
import type { ProviderConfigMap as CoreProviderConfigMap } from "@mariozechner/lemmy";
import {
	saveDefaults,
	loadDefaults,
	loadDefaultsConfig,
	setDefaultProvider,
	clearDefaults,
	DEFAULTS_FILE,
	getProviderConfig,
	getDefaultProviderConfig,
} from "./defaults.js";
import { runOneShot } from "./one-shot.js";
import { loadImageAttachment } from "./images.js";
import { runTUIChat } from "./chat.js";

function formatModelInfo(modelId: string, modelData: any): string {
	const contextWindow = modelData.contextWindow || 0;
	const maxOutput = modelData.maxOutputTokens || 0;
	const pricing = modelData.pricing;

	let info = `${modelId}`;

	// Add capability indicators
	const capabilities: string[] = [];
	if (modelData.supportsTools) capabilities.push("🔧 tools");
	if (modelData.supportsImageInput) capabilities.push("🖼️  images");
	if (capabilities.length > 0) {
		info += ` (${capabilities.join(", ")})`;
	}

	// Add context/output info
	if (contextWindow > 0 || maxOutput > 0) {
		const contextStr = contextWindow > 0 ? `${contextWindow.toLocaleString()}` : "?";
		const outputStr = maxOutput > 0 ? `${maxOutput.toLocaleString()}` : "?";
		info += `\n    Context: ${contextStr} tokens, Max output: ${outputStr} tokens`;
	}

	// Add pricing info
	if (pricing) {
		const inputPrice = pricing.inputPerMillion;
		const outputPrice = pricing.outputPerMillion;
		info += `\n    Pricing: $${inputPrice}/M input, $${outputPrice}/M output`;
	}

	return info;
}

export function createOneShotCommand(provider: string): Command {
	const command = new Command(provider);
	command.description(`Chat using ${provider} models`);

	// Add model option (optional if defaults exist)
	command.option("-m, --model <model>", `${getFieldDoc(provider, "model") || `${provider} model to use`}`);

	// Add message argument
	command.argument("<message>", "Message to send to the model");

	// Add image option for multimodal models
	command.option("-i, --image <path>", "Path to image file to include in the message");
	command.option("--images <paths...>", "Paths to multiple image files (space-separated)");

	// Add all config options for this provider
	const fields = getAllFields(provider);

	for (const field of fields) {
		if (field === "model") continue; // Already added as required option

		const fieldType = getFieldType(provider, field);
		const required = isRequired(provider, field);
		const doc = getFieldDoc(provider, field);
		const enumValues = getEnumValues(provider, field);

		let flagName = `--${field}`;

		// Create option based on type
		let option: Option;

		if (fieldType === "boolean") {
			option = new Option(flagName, doc || `Enable ${field}`);
		} else if (fieldType === "enum" && enumValues) {
			option = new Option(`${flagName} <value>`, doc || `${field} value`).choices(enumValues);
		} else if (fieldType === "number") {
			option = new Option(`${flagName} <number>`, doc || `${field} value`).argParser((value) => {
				const parsed = parseInt(value, 10);
				if (isNaN(parsed)) {
					throw new Error(`${field} must be a number`);
				}
				return parsed;
			});
		} else {
			// string or fallback
			option = new Option(`${flagName} <value>`, doc || `${field} value`);
		}

		// Don't make API key required via CLI since it can come from env
		if (required && field !== "apiKey") {
			option.makeOptionMandatory();
		}

		command.addOption(option);
	}

	command.action(async (message: string, options: any) => {
		try {
			// Use centralized config building
			const config = getProviderConfig(provider as keyof CoreProviderConfigMap, options);

			// Handle image attachments
			const attachments: Attachment[] = [];
			if (options.image) {
				try {
					const attachment = loadImageAttachment(options.image);
					attachments.push(attachment);
				} catch (error) {
					console.error(
						`❌ Failed to load image ${options.image}:`,
						error instanceof Error ? error.message : String(error),
					);
					process.exit(1);
				}
			}

			if (options.images && Array.isArray(options.images)) {
				for (const imagePath of options.images) {
					try {
						const attachment = loadImageAttachment(imagePath);
						attachments.push(attachment);
					} catch (error) {
						console.error(
							`❌ Failed to load image ${imagePath}:`,
							error instanceof Error ? error.message : String(error),
						);
						process.exit(1);
					}
				}
			}

			await runOneShot(provider, message, config, attachments);
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

	return command;
}

export function createModelsCommand(): Command {
	const command = new Command("models");
	command.description("List available models");

	command.option("-p, --provider <provider>", "Filter by provider (anthropic, openai, google)");
	command.option("--tools", "Show only models that support tools");
	command.option("--images", "Show only models that support image input");
	command.option("--cheap", "Show only models under $1/M input tokens");
	command.option("--json", "Output as JSON");

	command.action((options) => {
		const provider = options.provider?.toLowerCase();

		// Validate provider if specified
		if (provider && !getProviders().includes(provider)) {
			console.error(`❌ Invalid provider: ${provider}. Valid providers: ${getProviders().join(", ")}`);
			process.exit(1);
		}

		const allModels: { [key: string]: any } = {
			...AnthropicModelData,
			...OpenAIModelData,
			...GoogleModelData,
		};

		let modelsToShow = Object.entries(allModels);

		// Apply filters
		if (provider) {
			modelsToShow = modelsToShow.filter(([modelId]) => {
				const modelProvider = ModelToProvider[modelId as keyof typeof ModelToProvider];
				return modelProvider === provider;
			});
		}

		if (options.tools) {
			modelsToShow = modelsToShow.filter(([, data]) => data.supportsTools);
		}

		if (options.images) {
			modelsToShow = modelsToShow.filter(([, data]) => data.supportsImageInput);
		}

		if (options.cheap) {
			modelsToShow = modelsToShow.filter(([, data]) => {
				return data.pricing && data.pricing.inputPerMillion < 1;
			});
		}

		// Sort by provider, then by name
		modelsToShow.sort(([a], [b]) => {
			const providerA = ModelToProvider[a as keyof typeof ModelToProvider];
			const providerB = ModelToProvider[b as keyof typeof ModelToProvider];
			if (providerA !== providerB) {
				return providerA.localeCompare(providerB);
			}
			return a.localeCompare(b);
		});

		if (options.json) {
			const output = modelsToShow.reduce((acc, [modelId, data]) => {
				acc[modelId] = {
					provider: ModelToProvider[modelId as keyof typeof ModelToProvider],
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
			const modelProvider = ModelToProvider[modelId as keyof typeof ModelToProvider];
			if (!byProvider[modelProvider]) {
				byProvider[modelProvider] = [];
			}
			byProvider[modelProvider].push([modelId, data]);
		}

		console.log(`\n📋 Available Models (${modelsToShow.length} total)\n`);

		for (const [providerName, models] of Object.entries(byProvider)) {
			console.log(`🤖 ${providerName.toUpperCase()} (${models.length} models):`);
			for (const [modelId, data] of models) {
				console.log(`  ${formatModelInfo(modelId, data)}`);
				console.log();
			}
		}

		// Only show usage and filters help if no filters were applied
		const hasFilters = provider || options.tools || options.images || options.cheap;
		if (!hasFilters) {
			console.log("Usage:");
			console.log('  lemmy-chat <provider> -m <model> "Your message"');
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

export function createDefaultsCommand(): Command {
	const command = new Command("defaults");
	command.description("Set default arguments for lemmy-chat");

	command.argument("[args...]", "Default arguments to save (e.g., anthropic -m claude-opus-4-20250514)");

	command.option("-s, --show", "Show current defaults");
	command.option("-c, --clear", "Clear saved defaults");
	command.option("--default-provider <provider>", "Set the default provider");

	// Allow unknown options to be captured as arguments
	command.allowUnknownOption();

	command.action((args: string[], options: any) => {
		if (options.show) {
			const config = loadDefaultsConfig();
			if (Object.keys(config.providers).length === 0) {
				console.log("No defaults set.");
				console.log("\nSet defaults with:");
				console.log("  lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled");
				console.log("  lemmy-chat defaults openai -m o4-mini --reasoningEffort medium");
				console.log("  lemmy-chat defaults --default-provider anthropic");
			} else {
				console.log("Current defaults:");
				console.log(`Default provider: ${config.defaultProvider || "none"}`);
				console.log();

				for (const [provider, settings] of Object.entries(config.providers)) {
					console.log(`📋 ${provider.toUpperCase()}:`);
					if (settings.model) {
						console.log(`  Model: ${settings.model}`);
					}
					for (const [key, value] of Object.entries(settings)) {
						if (key === "model") continue;
						if (key === "defaults" && typeof value === "object" && value !== null) {
							// Show defaults in a nested format
							for (const [defaultKey, defaultValue] of Object.entries(value)) {
								console.log(`  ${defaultKey}: ${defaultValue}`);
							}
						} else {
							console.log(`  ${key}: ${value}`);
						}
					}
					console.log();
				}
				console.log(`Stored in: ${DEFAULTS_FILE}`);
			}
			return;
		}

		if (options.defaultProvider) {
			if (!getProviders().includes(options.defaultProvider)) {
				console.error(
					`❌ Invalid provider: ${options.defaultProvider}. Valid providers: ${getProviders().join(", ")}`,
				);
				process.exit(1);
			}
			setDefaultProvider(options.defaultProvider);
			console.log(`✅ Set default provider to: ${options.defaultProvider}`);
			return;
		}

		if (options.clear) {
			clearDefaults();
			console.log("✅ Defaults cleared");
			return;
		}

		if (args.length === 0) {
			console.log("Usage:");
			console.log("  lemmy-chat defaults <provider> [options...]           # Set provider defaults");
			console.log("  lemmy-chat defaults --default-provider <provider>    # Set default provider");
			console.log("  lemmy-chat defaults --show                           # Show current defaults");
			console.log("  lemmy-chat defaults --clear                          # Clear all defaults");
			console.log("\nExamples:");
			console.log("  lemmy-chat defaults anthropic -m claude-3-5-sonnet-latest --thinkingEnabled");
			console.log("  lemmy-chat defaults openai -m o4-mini --reasoningEffort medium");
			console.log("  lemmy-chat defaults google -m gemini-2.0-flash --projectId my-project");
			console.log("  lemmy-chat defaults --default-provider anthropic");
			return;
		}

		// Validate that first arg is a valid provider
		const provider = args[0];
		if (!provider || !getProviders().includes(provider)) {
			console.error(`❌ Invalid provider: ${provider}. Valid providers: ${getProviders().join(", ")}`);
			process.exit(1);
		}

		saveDefaults(args);
		console.log("✅ Defaults saved:");
		console.log(`   lemmy-chat ${args.join(" ")}`);
		console.log(`\nNow you can run: lemmy-chat "your message"`);
		console.log(`Stored in: ${DEFAULTS_FILE}`);
	});

	return command;
}

export function createChatCommand(): Command {
	const command = new Command("chat");
	command.description("Interactive chat mode with TUI interface");

	command.option("-p, --provider <provider>", "Provider to use (anthropic, openai, google)");
	command.option("-m, --model <model>", "Model to use");
	command.option("--apiKey <key>", "API key (or use environment variables)");
	command.option("--simulate-input <inputs...>", "Simulate input sequences for testing");

	// Add common options that work across providers
	command.option("--thinkingEnabled", "Enable thinking for supported models");
	command.option("--temperature <number>", "Temperature for generation", parseFloat);
	command.option("--maxOutputTokens <number>", "Maximum output tokens", parseInt);
	command.option("--maxThinkingTokens <number>", "Maximum thinking tokens", parseInt);

	command.action(async (options) => {
		try {
			// Determine provider - use from options or defaults
			let provider = options.provider;
			if (!provider) {
				const defaultConfig = getDefaultProviderConfig();
				if (defaultConfig) {
					provider = defaultConfig.provider;
				} else {
					console.error("❌ No provider specified and no defaults set.");
					console.error("Either use -p/--provider flag or set defaults first:");
					console.error("  lemmy-chat defaults anthropic -m claude-sonnet-4-20250514");
					process.exit(1);
				}
			}

			// Use centralized config building
			const config = getProviderConfig(provider as keyof CoreProviderConfigMap, options, options.apiKey);

			// Pass the built config to TUI chat
			await runTUIChat(provider, config, options.simulateInput);
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

	return command;
}
