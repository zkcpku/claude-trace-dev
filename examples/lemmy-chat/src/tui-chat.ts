import {
	AssistantMessage,
	calculateTokenCost,
	Context,
	createClientForModel,
	getDefaultApiKeyEnvVar,
	getProviders,
	UserMessage,
} from "@mariozechner/lemmy";
import { TUI, Container, TextComponent, TextEditor, logger } from "@mariozechner/lemmy-tui";
import { loadDefaults } from "./defaults.js";
import chalk from "chalk";

export async function runTUIChat(options: any): Promise<void> {
	// Determine provider and model
	let provider: string | undefined = options.provider;
	let model: string | undefined = options.model;

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

	// TypeScript type guards - at this point we know they are defined
	if (!provider || !model) {
		console.error("❌ Provider and model are required");
		process.exit(1);
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

	// Create client and context
	const client = createClientForModel(model, config);
	const context = new Context();

	// Create TUI components
	const tui = new TUI();

	// Enable debug logging
	logger.configure({
		enabled: true,
		logFile: "tui-debug.log",
		logLevel: "debug",
	});

	// Header component
	const header = new TextComponent(chalk.yellow(`Chat with ${provider}/${model} | Type 'exit' to quit`));

	// Messages container
	const messagesContainer = new Container(tui);

	// Status component for tokens/cost
	const statusComponent = new TextComponent("Ready to chat...");

	// Input editor
	const inputEditor = new TextEditor();

	// Add components to TUI
	tui.addChild(header);
	tui.addChild(messagesContainer);
	tui.addChild(inputEditor);
	tui.addChild(statusComponent);

	// Set focus to input editor
	tui.setFocus(inputEditor);

	// Track conversation state
	let totalCost = 0;
	let isProcessing = false;
	let animationInterval: NodeJS.Timeout | null = null;

	function startLoadingAnimation() {
		if (animationInterval) return; // Already animating

		const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let frameIndex = 0;

		animationInterval = setInterval(() => {
			const spinner = frames[frameIndex % frames.length];
			statusComponent.setText(`${spinner} Processing...`);
			tui.requestRender();
			frameIndex++;
		}, 100);
	}

	function stopLoadingAnimation() {
		if (animationInterval) {
			clearInterval(animationInterval);
			animationInterval = null;
		}
	}

	function updateStatus(message?: string) {
		// Don't update status if we're currently animating
		if (animationInterval) return;

		if (message) {
			statusComponent.setText(message);
		} else if (context.getMessages().length > 0) {
			const lastMsg = context.getLastMessage();
			if (lastMsg && lastMsg.role === "assistant") {
				const tokensInfo = lastMsg.usage ? `↑${lastMsg.usage.input} ↓${lastMsg.usage.output}` : "";
				const costInfo = `Last: $${(calculateTokenCost(lastMsg.model, lastMsg.usage) || 0).toFixed(6)} | Total: $${totalCost.toFixed(6)}`;
				statusComponent.setText(chalk.italic(chalk.gray([tokensInfo, costInfo].filter(Boolean).join(" | "))));
			}
		} else {
			statusComponent.setText(chalk.italic(chalk.gray("Ready to chat...")));
		}
		tui.requestRender();
	}

	function addMessage(message: UserMessage | AssistantMessage) {
		if (message.role === "assistant") {
			if (message.thinking && config.thinkingEnabled) {
				const thinkingComponent = new TextComponent(chalk.dim.italic(`Thinking: ${message.thinking}\n`));
				messagesContainer.addChild(thinkingComponent);
			}

			const messageComponent = new TextComponent(chalk.blue(`Assistant: ${message.content}\n`));
			messagesContainer.addChild(messageComponent);

			totalCost += calculateTokenCost(message.model, message.usage);
		} else {
			const messageComponent = new TextComponent(chalk.green(`You: ${message.content}\n`));
			messagesContainer.addChild(messageComponent);
		}

		updateStatus();
	}

	// Handle input submissions
	inputEditor.onSubmit = async (text: string) => {
		const message = text.trim();

		if (message === "exit" || message === "quit") {
			console.log("\n👋 Goodbye!");
			tui.stop();
			process.exit(0);
		}

		if (message === "" || isProcessing) {
			return;
		}

		isProcessing = true;
		startLoadingAnimation();

		try {
			// Add user message
			addMessage({
				role: "user",
				content: message,
				timestamp: new Date(),
			});

			// Make the API call
			const result = await client.ask(message, {
				context,
			});

			if (result.type === "success") {
				addMessage(result.message);
				totalCost += calculateTokenCost(result.message.model, result.message.usage);
			} else {
				const errorComponent = new TextComponent(`❌ Error: ${result.error.message}`);
				messagesContainer.addChild(errorComponent);
				tui.requestRender();
			}
		} catch (error) {
			const errorComponent = new TextComponent(
				`❌ Error: ${error instanceof Error ? error.message : String(error)}`,
			);
			messagesContainer.addChild(errorComponent);
			tui.requestRender();
		} finally {
			stopLoadingAnimation();
			isProcessing = false;
			updateStatus();
		}
	};

	// Start the TUI
	tui.start();
}
