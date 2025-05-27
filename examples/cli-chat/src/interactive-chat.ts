import { createInterface } from "readline";
import { Context, createClientForModel, getDefaultApiKeyEnvVar, getProviders } from "@mariozechner/lemmy";
import { loadDefaults } from "./defaults.js";

export async function runInteractiveChat(options: any): Promise<void> {
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
