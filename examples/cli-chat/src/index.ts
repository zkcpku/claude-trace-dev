#!/usr/bin/env node

// Suppress punycode deprecation warning
process.removeAllListeners("warning");
process.on("warning", (warning) => {
	if (warning.name === "DeprecationWarning" && warning.message.includes("punycode")) {
		return; // Ignore punycode deprecation warnings
	}
	console.warn(warning.message);
});

import { Command, Option } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { extname, join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";
import {
	Context,
	createClientForModel,
	getDefaultApiKeyEnvVar,
	getAllFields,
	getFieldType,
	getFieldDoc,
	isRequired,
	getEnumValues,
	getProviders,
	AnthropicModelData,
	OpenAIModelData,
	GoogleModelData,
	ModelToProvider,
	Attachment,
} from "@mariozechner/lemmy";

const DEFAULTS_DIR = join(homedir(), ".lemmy-chat");
const DEFAULTS_FILE = join(DEFAULTS_DIR, "defaults.json");

function ensureDefaultsDir(): void {
	if (!existsSync(DEFAULTS_DIR)) {
		mkdirSync(DEFAULTS_DIR, { recursive: true });
	}
}

function saveDefaults(args: string[]): void {
	ensureDefaultsDir();
	writeFileSync(DEFAULTS_FILE, JSON.stringify(args, null, 2));
}

function loadDefaults(): string[] {
	if (!existsSync(DEFAULTS_FILE)) {
		return [];
	}
	try {
		const content = readFileSync(DEFAULTS_FILE, "utf8");
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.warn(
			`Warning: Could not load defaults from ${DEFAULTS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

function getMimeTypeFromExtension(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	const mimeTypes: { [key: string]: string } = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
		".bmp": "image/bmp",
		".tiff": "image/tiff",
		".tif": "image/tiff",
	};

	return mimeTypes[ext] || "image/jpeg"; // default fallback
}

function loadImageAttachment(filePath: string): Attachment {
	try {
		const buffer = readFileSync(filePath);
		const base64Data = buffer.toString("base64");
		const mimeType = getMimeTypeFromExtension(filePath);

		return {
			type: "image",
			data: base64Data,
			mimeType,
			name: filePath.split("/").pop() || "image",
		};
	} catch (error) {
		throw new Error(
			`Failed to load image from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function createProviderCommand(provider: string): Command {
	const command = new Command(provider);
	command.description(`Chat using ${provider} models`);

	// Add model option (required)
	command.requiredOption("-m, --model <model>", `${getFieldDoc(provider, "model") || `${provider} model to use`}`);

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

	return command;
}

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

function createModelsCommand(): Command {
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

function createDefaultsCommand(): Command {
	const command = new Command("defaults");
	command.description("Set default arguments for lemmy-chat");

	command.argument("[args...]", "Default arguments to save (e.g., anthropic -m claude-opus-4-20250514)");

	command.option("-s, --show", "Show current defaults");
	command.option("-c, --clear", "Clear saved defaults");

	// Allow unknown options to be captured as arguments
	command.allowUnknownOption();

	command.action((args: string[], options: any) => {
		if (options.show) {
			const defaults = loadDefaults();
			if (defaults.length === 0) {
				console.log("No defaults set.");
				console.log("\nSet defaults with:");
				console.log("  lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled");
				console.log("  lemmy-chat defaults openai -m o4-mini --reasoningEffort medium");
			} else {
				console.log("Current defaults:");
				console.log(`  lemmy-chat ${defaults.join(" ")}`);
				console.log(`\nStored in: ${DEFAULTS_FILE}`);
			}
			return;
		}

		if (options.clear) {
			if (existsSync(DEFAULTS_FILE)) {
				writeFileSync(DEFAULTS_FILE, JSON.stringify([], null, 2));
				console.log("✅ Defaults cleared");
			} else {
				console.log("No defaults to clear");
			}
			return;
		}

		if (args.length === 0) {
			console.log("Usage:");
			console.log("  lemmy-chat defaults <provider> [options...]  # Set defaults");
			console.log("  lemmy-chat defaults --show                   # Show current defaults");
			console.log("  lemmy-chat defaults --clear                  # Clear defaults");
			console.log("\nExamples:");
			console.log("  lemmy-chat defaults anthropic -m claude-3-5-sonnet-latest --thinkingEnabled");
			console.log("  lemmy-chat defaults openai -m o4-mini --reasoningEffort medium");
			console.log("  lemmy-chat defaults google -m gemini-2.0-flash --projectId my-project");
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

function createChatCommand(): Command {
	const command = new Command("chat");
	command.description("Interactive chat mode");

	command.option("-p, --provider <provider>", "Provider to use (anthropic, openai, google)");
	command.option("-m, --model <model>", "Model to use");
	command.option("--apiKey <key>", "API key (or use environment variables)");

	// Add provider-specific options (collect unique fields)
	const allFields = new Set<string>();
	const fieldInfo = new Map<string, { type: string; doc?: string; enumValues?: string[] }>();

	for (const provider of getProviders()) {
		const fields = getAllFields(provider);

		for (const field of fields) {
			if (["model", "apiKey"].includes(field)) continue; // Already added

			if (!allFields.has(field)) {
				allFields.add(field);
				const doc = getFieldDoc(provider, field);
				const enumValues = getEnumValues(provider, field);
				const info: { type: string; doc?: string; enumValues?: string[] } = {
					type: getFieldType(provider, field) || "string",
				};
				if (doc) info.doc = doc;
				if (enumValues) info.enumValues = enumValues;
				fieldInfo.set(field, info);
			}
		}
	}

	// Add unique options
	for (const field of allFields) {
		const info = fieldInfo.get(field)!;
		let flagName = `--${field}`;

		let option: Option;

		if (info.type === "boolean") {
			option = new Option(flagName, info.doc || `Enable ${field}`);
		} else if (info.type === "enum" && info.enumValues) {
			option = new Option(`${flagName} <value>`, info.doc || `${field} value`).choices(info.enumValues);
		} else if (info.type === "number") {
			option = new Option(`${flagName} <number>`, info.doc || `${field} value`).argParser((value) => {
				const parsed = parseInt(value, 10);
				if (isNaN(parsed)) {
					throw new Error(`${field} must be a number`);
				}
				return parsed;
			});
		} else {
			option = new Option(`${flagName} <value>`, info.doc || `${field} value`);
		}

		command.addOption(option);
	}

	command.action(async (options) => {
		try {
			await runInteractiveChat(options);
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

	return command;
}

function setupProgram(): Command {
	const program = new Command();

	program.name("lemmy-chat").description("CLI for chatting with various LLM providers").version("0.1.0");

	// Add models and defaults commands
	program.addCommand(createModelsCommand());
	program.addCommand(createDefaultsCommand());

	// Add chat command
	program.addCommand(createChatCommand());

	// Add provider subcommands
	for (const provider of getProviders()) {
		const providerCommand = createProviderCommand(provider);

		providerCommand.action(async (message: string, options: any) => {
			try {
				await runChat(provider, message, options);
			} catch (error) {
				console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
				process.exit(1);
			}
		});

		program.addCommand(providerCommand);
	}

	// Add global help with examples
	program.addHelpText(
		"after",
		`
Examples:
  $ lemmy-chat models                                    # List all available models
  $ lemmy-chat models --provider anthropic --tools      # List Anthropic models with tool support
  $ lemmy-chat anthropic "What is TypeScript?"          # Direct provider usage
  $ lemmy-chat openai "Solve this math problem"         # Direct provider usage
  $ lemmy-chat google "Tell me a joke"                  # Direct provider usage

Interactive Chat Mode:
  $ lemmy-chat chat                                     # Uses defaults for interactive chat
  $ lemmy-chat chat -p anthropic -m claude-sonnet-4-20250514 --thinkingEnabled
  $ lemmy-chat chat -p openai -m o4-mini               # Interactive chat with specific model

Set Defaults (saves to ~/.lemmy-chat/defaults.json):
  $ lemmy-chat defaults anthropic -m claude-opus-4-20250514 --thinkingEnabled
  $ lemmy-chat defaults openai -m gpt-4o --reasoningEffort medium
  $ lemmy-chat defaults --show                          # Show current defaults
  $ lemmy-chat defaults --clear                         # Clear defaults

Use Defaults:
  $ lemmy-chat "Hello world"                            # Uses saved defaults
  $ lemmy-chat -i image.jpg "What's in this image?"    # Uses defaults + image

Image Input:
  $ lemmy-chat anthropic -i image.jpg "What's in this image?"
  $ lemmy-chat openai --images img1.png img2.jpg "Compare these images"
  $ lemmy-chat google -i screenshot.png "Explain this code"

Environment Variables:
  ANTHROPIC_API_KEY    - Anthropic API key
  OPENAI_API_KEY       - OpenAI API key
  GOOGLE_API_KEY       - Google API key

You can also pass API keys via --apiKey flag.
`,
	);

	return program;
}

async function runChat(provider: string, message: string, options: any): Promise<void> {
	// Get API key from options or environment
	const apiKey = options.apiKey || process.env[getDefaultApiKeyEnvVar(provider as any)];
	if (!apiKey) {
		throw new Error(`No API key provided. Set ${getDefaultApiKeyEnvVar(provider as any)} or use --apiKey flag.`);
	}

	// Build config from options
	const config: any = {
		model: options.model,
		apiKey,
		...options,
	};

	// Remove commander-specific and image fields from config
	delete config.apiKey;
	delete config.image;
	delete config.images;
	config.apiKey = apiKey;

	// Process image attachments
	const attachments: Attachment[] = [];

	if (options.image) {
		console.log(`📎 Loading image: ${options.image}`);
		attachments.push(loadImageAttachment(options.image));
	}

	if (options.images && Array.isArray(options.images)) {
		for (const imagePath of options.images) {
			console.log(`📎 Loading image: ${imagePath}`);
			attachments.push(loadImageAttachment(imagePath));
		}
	}

	console.log(`🤖 Using ${provider}/${options.model}`);
	console.log(`🔑 API key: ${apiKey.slice(0, 8)}...`);
	if (attachments.length > 0) {
		console.log(`🖼️  Attached ${attachments.length} image(s)`);
	}

	// Create client and context
	const client = createClientForModel(options.model, config);
	const context = new Context();

	// Set up streaming callbacks if thinking is enabled
	const streamingOptions: any = {};
	let hasThinking = false;
	let isFirstNormalChunk = true;

	if (config.thinkingEnabled) {
		streamingOptions.onThinkingChunk = (chunk: string) => {
			hasThinking = true;
			// Output thinking in gray
			process.stdout.write(`\x1b[90m${chunk}\x1b[0m`);
		};
	}

	streamingOptions.onChunk = (chunk: string) => {
		// Add separator before first normal output if there was thinking
		if (hasThinking && isFirstNormalChunk) {
			process.stdout.write("\n\n");
			isFirstNormalChunk = false;
		}
		process.stdout.write(chunk);
	};

	// Make request
	console.log(`\n💬 You: ${message}`);
	console.log(`\n🤖 ${provider}:`);

	// Use AskInput format if we have attachments, otherwise use simple string
	const askInput = attachments.length > 0 ? { content: message, attachments } : message;

	const result = await client.ask(askInput, {
		context,
		...streamingOptions,
	});

	if (result.type === "success") {
		// If we weren't streaming, show the content
		if (!streamingOptions.onChunk) {
			console.log(result.message.content);
		}

		console.log(`\n\n📊 Tokens: ${result.tokens.input} in, ${result.tokens.output} out`);
		console.log(`💰 Cost: $${result.cost.toFixed(6)}`);

		if (result.message.thinking && !config.thinkingEnabled) {
			console.log(`💭 Thinking was available but not streamed. Use --thinkingEnabled to see it.`);
		}
	} else {
		throw new Error(result.error.message);
	}
}

async function runInteractiveChat(options: any): Promise<void> {
	// Determine provider and model
	let provider = options.provider;
	let model = options.model;

	// If no provider/model specified, try to use defaults
	if (!provider || !model) {
		const defaults = loadDefaults();
		if (defaults.length === 0) {
			console.error("❌ No provider/model specified and no defaults set.");
			console.error("Either provide --provider and --model, or set defaults first:");
			console.error("  lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled");
			process.exit(1);
		}

		// Parse defaults to extract provider and model
		provider = defaults[0];
		const modelIndex = defaults.indexOf("-m");
		if (modelIndex !== -1 && modelIndex + 1 < defaults.length) {
			model = defaults[modelIndex + 1];
		}

		if (!provider || !model) {
			console.error("❌ Could not determine provider/model from defaults");
			process.exit(1);
		}

		// Parse defaults manually for chat mode
		const parsedDefaults: any = { provider, model };

		// Simple parsing of defaults for common options
		for (let i = 0; i < defaults.length; i++) {
			const arg = defaults[i];

			if (arg && arg.startsWith("--") && !arg.includes("=")) {
				const optName = arg.slice(2);

				// Check if it's a boolean flag
				const nextArg = defaults[i + 1];
				if (i + 1 >= defaults.length || (nextArg && nextArg.startsWith("-"))) {
					// Boolean flag
					parsedDefaults[optName] = true;
				} else {
					// Value option
					parsedDefaults[optName] = nextArg;
					i++; // Skip the value
				}
			}
		}

		// Merge parsed defaults with explicit options (explicit options take precedence)
		Object.assign(parsedDefaults, options);
		options = parsedDefaults;
	}

	// Validate provider
	if (!getProviders().includes(provider)) {
		console.error(`❌ Invalid provider: ${provider}. Valid providers: ${getProviders().join(", ")}`);
		process.exit(1);
	}

	// Get API key
	const apiKey = options.apiKey || process.env[getDefaultApiKeyEnvVar(provider as any)];
	if (!apiKey) {
		console.error(`❌ No API key provided. Set ${getDefaultApiKeyEnvVar(provider as any)} or use --apiKey flag.`);
		process.exit(1);
	}

	// Build config
	const config: any = {
		model,
		apiKey,
		...options,
	};

	// Clean up config
	delete config.provider;
	delete config.apiKey;
	config.apiKey = apiKey;

	console.log(`\n🤖 Interactive Chat Mode`);
	console.log(`Provider: ${provider}`);
	console.log(`Model: ${model}`);
	console.log(`API key: ${apiKey.slice(0, 8)}...`);
	console.log(`\nType your messages below. Use 'exit', 'quit', or Ctrl+C to end the conversation.\n`);

	// Create client and context
	const client = createClientForModel(model, config);
	const context = new Context();

	// Set up readline interface
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "💬 You: ",
	});

	// Set up streaming callbacks
	const streamingOptions: any = {};
	let hasThinking = false;
	let isFirstNormalChunk = true;

	if (config.thinkingEnabled) {
		streamingOptions.onThinkingChunk = (chunk: string) => {
			hasThinking = true;
			process.stdout.write(`\x1b[90m${chunk}\x1b[0m`);
		};
	}

	streamingOptions.onChunk = (chunk: string) => {
		if (hasThinking && isFirstNormalChunk) {
			process.stdout.write("\n\n");
			isFirstNormalChunk = false;
		}
		process.stdout.write(chunk);
	};

	// Handle user input
	rl.on("line", async (input) => {
		const message = input.trim();

		if (message === "exit" || message === "quit") {
			console.log("\n👋 Goodbye!");
			rl.close();
			return;
		}

		if (message === "") {
			rl.prompt();
			return;
		}

		try {
			// Reset streaming state for each message
			hasThinking = false;
			isFirstNormalChunk = true;

			console.log(`\n🤖 ${provider}:`);

			const result = await client.ask(message, {
				context,
				...streamingOptions,
			});

			if (result.type === "success") {
				if (!streamingOptions.onChunk) {
					console.log(result.message.content);
				}

				console.log(
					`\n📊 Tokens: ${result.tokens.input} in, ${result.tokens.output} out | 💰 Cost: $${result.cost.toFixed(6)}`,
				);

				if (result.message.thinking && !config.thinkingEnabled) {
					console.log(`💭 Thinking was available but not streamed. Use --thinkingEnabled to see it.`);
				}
			} else {
				console.error(`❌ Error: ${result.error.message}`);
			}

			console.log(); // Extra line for spacing
			rl.prompt();
		} catch (error) {
			console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			console.log();
			rl.prompt();
		}
	});

	// Handle Ctrl+C
	rl.on("SIGINT", () => {
		console.log("\n👋 Goodbye!");
		process.exit(0);
	});

	// Start the conversation
	rl.prompt();
}

async function main() {
	// Check if no arguments provided (just "lemmy-chat")
	if (process.argv.length === 2) {
		const defaults = loadDefaults();
		if (defaults.length === 0) {
			// No defaults set, show help
			const program = setupProgram();
			program.help();
			return;
		} else {
			// Show defaults and prompt for message
			console.log("No message provided. Current defaults:");
			console.log(`  lemmy-chat ${defaults.join(" ")}`);
			console.log("\nUsage:");
			console.log('  lemmy-chat "your message"              # Use defaults');
			console.log("  lemmy-chat defaults --show             # Show current defaults");
			console.log("  lemmy-chat defaults anthropic -m ...   # Set new defaults");
			return;
		}
	}

	// Check if first argument after "lemmy-chat" is a message (not a command or provider)
	const firstArg = process.argv[2];
	const isCommand = firstArg
		? ["models", "defaults", "chat", "help", "--help", "-h", "--version", "-V"].includes(firstArg)
		: false;
	const isProvider = firstArg ? getProviders().includes(firstArg) : false;

	if (!isCommand && !isProvider && firstArg) {
		// First argument looks like a message, try to use defaults
		const defaults = loadDefaults();
		if (defaults.length === 0) {
			console.error("❌ No defaults set. Set defaults first:");
			console.error("  lemmy-chat defaults anthropic -m claude-3-5-sonnet-latest");
			console.error("  lemmy-chat defaults openai -m o4-mini");
			process.exit(1);
		}

		// Prepend defaults to argv and re-parse
		const newArgv = [
			process.argv[0] || "node", // node
			process.argv[1] || "lemmy-chat", // script path
			...defaults, // default args
			...process.argv.slice(2).filter((arg): arg is string => arg !== undefined), // user message
		];

		const program = setupProgram();
		try {
			await program.parseAsync(newArgv);
		} catch (error) {
			console.error(`❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
		return;
	}

	// Normal argument processing
	const program = setupProgram();
	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		console.error(`❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
	process.exit(1);
});

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
