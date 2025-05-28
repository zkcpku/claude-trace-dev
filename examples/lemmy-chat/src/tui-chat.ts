import {
	AssistantMessage,
	calculateTokenCost,
	Context,
	createClientForModel,
	getDefaultApiKeyEnvVar,
	getProviders,
	UserMessage,
} from "@mariozechner/lemmy";
import {
	TUI,
	Container,
	TextComponent,
	TextEditor,
	CombinedAutocompleteProvider,
	type AutocompleteItem,
	logger,
} from "@mariozechner/lemmy-tui";
import { CONFIG_SCHEMA } from "@mariozechner/lemmy";
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

	// Logo component
	const logoText = chalk.hex("#AC5A1F")(
		[
			"   ██╗     ███████╗███╗   ███╗███╗   ███╗██╗   ██╗",
			"   ██║     ██╔════╝████╗ ████║████╗ ████║╚██╗ ██╔╝",
			"   ██║     █████╗  ██╔████╔██║██╔████╔██║ ╚████╔╝",
			"   ██║     ██╔══╝  ██║╚██╔╝██║██║╚██╔╝██║  ╚██╔╝",
			"   ███████╗███████╗██║ ╚═╝ ██║██║ ╚═╝ ██║   ██║",
			"   ╚══════╝╚══════╝╚═╝     ╚═╝╚═╝     ╚═╝   ╚═╝",
		].join("\n"),
	);
	const logo = new TextComponent(logoText, { top: 1, bottom: 1 });

	// Header component
	const header = new TextComponent(chalk.yellow(`Chat with ${provider}/${model} | Type 'exit' to quit`), {
		left: 1,
		right: 1,
		bottom: 1,
	});

	// Messages container
	const messagesContainer = new Container(tui);

	// Status component for tokens/cost
	const statusComponent = new TextComponent(" Ready to chat...", { left: 1, right: 1 });

	// Input editor
	const inputEditor = new TextEditor();

	// Define available slash commands
	const commands: AutocompleteItem[] = [
		{ value: "exit", label: "exit", description: "Exit the chat" },
		{ value: "clear", label: "clear", description: "Clear the conversation" },
		{ value: "model", label: "model", description: "Show current model" },
		{ value: "usage", label: "usage", description: "Show token usage and costs" },
		{ value: "system", label: "system", description: "Set system prompt" },
		{ value: "temperature", label: "temperature", description: "Set temperature (0-2)" },
		{ value: "help", label: "help", description: "Show available commands" },
	];

	// Add provider-specific options from config schema
	const providerSchema = CONFIG_SCHEMA[provider as keyof typeof CONFIG_SCHEMA] as any;
	if (providerSchema && typeof providerSchema === "object") {
		for (const [key, config] of Object.entries(providerSchema)) {
			// Skip the model field as it's already set
			if (key === "model") continue;

			const configObj = config as any;
			const commandName = `${provider}:${key}`;
			let description = configObj.doc || "";

			// Add type/value hints to description
			if (configObj.type === "boolean") {
				description += " (true/false)";
			} else if (configObj.type === "enum" && "values" in configObj) {
				description += ` (${configObj.values.join("/")})`;
			} else if (configObj.type === "number") {
				description += " (number)";
			}

			commands.push({
				value: commandName,
				label: commandName,
				description,
			});
		}
	}

	// Add base options that apply to all providers
	const baseSchema = CONFIG_SCHEMA.base;
	for (const [key, config] of Object.entries(baseSchema)) {
		// Skip apiKey and baseURL as they're not typically changed at runtime
		if (key === "apiKey" || key === "baseURL") continue;

		const configObj = config as any;
		let description = configObj.doc || "";
		if (configObj.type === "number") {
			description += " (number)";
		}

		commands.push({
			value: key,
			label: key,
			description,
		});
	}

	// Set up autocomplete provider
	const autocompleteProvider = new CombinedAutocompleteProvider(commands);
	inputEditor.setAutocompleteProvider(autocompleteProvider);

	// Add components to TUI
	tui.addChild(logo);
	tui.addChild(header);
	tui.addChild(messagesContainer);
	tui.addChild(inputEditor);
	tui.addChild(statusComponent);

	// Set focus to input editor
	tui.setFocus(inputEditor);

	// Track conversation state
	let totalCost = 0;
	let isProcessing = false;

	// Store current ask options
	const currentOptions: Record<string, any> = {};
	let animationInterval: NodeJS.Timeout | null = null;

	function startLoadingAnimation() {
		if (animationInterval) return; // Already animating

		const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let frameIndex = 0;

		animationInterval = setInterval(() => {
			const spinner = frames[frameIndex % frames.length];
			statusComponent.setText(chalk.magenta(` ${spinner} Processing...`));
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
				const lastUsage = lastMsg.usage ? `↑${lastMsg.usage.input} ↓${lastMsg.usage.output}` : "";
				const lastCost = calculateTokenCost(lastMsg.model, lastMsg.usage);

				const totalUsage = `↑${context.getTokenUsage().input} ↓${context.getTokenUsage().output}`;
				const totalCost = context.getTotalCost();

				const statusInfo = ` Last: ${lastUsage} $${lastCost.toFixed(6)} | Total: ${totalUsage} $${totalCost.toFixed(6)}`;
				statusComponent.setText(chalk.italic(chalk.gray(statusInfo)));
			}
		} else {
			statusComponent.setText(chalk.italic(chalk.gray(" Ready to chat...")));
		}
		tui.requestRender();
	}

	function addMessage(message: UserMessage | AssistantMessage) {
		if (message.role === "assistant") {
			if (message.thinking && config.thinkingEnabled) {
				const thinkingComponent = new TextComponent(chalk.dim.italic(`Thinking: ${message.thinking}`), {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(thinkingComponent);
			}

			const messageComponent = new TextComponent(`Assistant: ${message.content}`, {
				bottom: 1,
				left: 1,
				right: 1,
			});
			messagesContainer.addChild(messageComponent);

			totalCost += calculateTokenCost(message.model, message.usage);
		} else {
			// Handle multiline content properly
			// Filter out empty lines at the end that might come from trailing newlines
			const allLines = message.content?.split("\n") || [""];
			const lines = allLines.filter((line, index) => {
				// Keep all non-empty lines and empty lines that aren't at the end
				return line !== "" || index < allLines.length - 1;
			});
			logger.debug("Chat", "Processing user message display", {
				originalContent: JSON.stringify(message.content),
				lines: lines,
				lineCount: lines.length,
			});

			// Always use padding for user messages
			const messageComponent = new TextComponent(chalk.green(`You: ${message.content}`), {
				bottom: 1,
				left: 1,
				right: 1,
			});
			messagesContainer.addChild(messageComponent);
		}

		updateStatus();
	}

	// Handle input submissions
	inputEditor.onSubmit = async (text: string) => {
		logger.debug("Chat", "Received submission", {
			originalText: JSON.stringify(text),
			trimmedText: JSON.stringify(text.trim()),
			lines: text.split("\n"),
		});
		const message = text.trim();

		if (message === "exit" || message === "quit") {
			console.log("\n👋 Goodbye!");
			tui.stop();
			process.exit(0);
		}

		// Check if it's a slash command
		if (message.startsWith("/")) {
			const parts = message.substring(1).split(" ");
			const commandName = parts[0];
			const commandValue = parts.slice(1).join(" ");

			if (commandName) {
				// Check if we're setting a value for an option
				if (commandValue && (commandName.includes(":") || CONFIG_SCHEMA.base.hasOwnProperty(commandName))) {
					// Parse and store the value
					let parsedValue: any = commandValue;

					// Try to parse as boolean
					if (commandValue.toLowerCase() === "true") {
						parsedValue = true;
					} else if (commandValue.toLowerCase() === "false") {
						parsedValue = false;
					}
					// Try to parse as number
					else if (!isNaN(Number(commandValue))) {
						parsedValue = Number(commandValue);
					}

					currentOptions[commandName] = parsedValue;

					const confirmComponent = new TextComponent(chalk.green(`✓ Set ${commandName} to: ${parsedValue}`), {
						bottom: 1,
						left: 1,
						right: 1,
					});
					messagesContainer.addChild(confirmComponent);
				} else {
					executeCommand(commandName);
				}
			}
			return;
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

			// Make the API call with current options
			// Strip provider: prefix from option keys
			const askOptions: any = { context };
			for (const [key, value] of Object.entries(currentOptions)) {
				// Remove provider: prefix if present
				const parts = key.split(":");
				const optionKey = parts.length > 1 && parts[1] ? parts[1] : key;
				askOptions[optionKey] = value;
			}

			const result = await client.ask(message, askOptions);

			if (result.type === "success") {
				addMessage(result.message);
				totalCost += calculateTokenCost(result.message.model, result.message.usage);
			} else {
				const errorComponent = new TextComponent(`❌ Error: ${result.error.message}`, {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(errorComponent);
				tui.requestRender();
			}
		} catch (error) {
			const errorComponent = new TextComponent(
				`❌ Error: ${error instanceof Error ? error.message : String(error)}`,
				{ bottom: 1, left: 1, right: 1 },
			);
			messagesContainer.addChild(errorComponent);
			tui.requestRender();
		} finally {
			stopLoadingAnimation();
			isProcessing = false;
			updateStatus();
		}
	};

	function executeCommand(command: string) {
		switch (command) {
			case "exit":
				console.log("\n👋 Goodbye!");
				tui.stop();
				process.exit(0);

			case "clear":
				// Clear all messages from the container
				messagesContainer.clear();

				// Clear context
				context.getMessages().length = 0;
				totalCost = 0;
				updateStatus("Conversation cleared");
				break;

			case "model":
				const infoComponent = new TextComponent(chalk.cyan(`Current model: ${provider}/${model}`), {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(infoComponent);
				break;

			case "usage":
				const usage = context.getTokenUsage();
				let usageText = chalk.cyan(
					`Total usage: ↑${usage.input} ↓${usage.output} tokens, $${totalCost.toFixed(6)}`,
				);

				// Add current options if any are set
				if (Object.keys(currentOptions).length > 0) {
					usageText += chalk.gray("\n\nActive options:");
					for (const [key, value] of Object.entries(currentOptions)) {
						usageText += chalk.gray(`\n  ${key}: ${JSON.stringify(value)}`);
					}
				}

				const usageComponent = new TextComponent(usageText, { bottom: 1, left: 1, right: 1 });
				messagesContainer.addChild(usageComponent);
				break;

			case "help":
				const helpText = commands.map((cmd) => `  /${cmd.value} - ${cmd.description}`).join("\n");
				const helpComponent = new TextComponent(chalk.cyan("Available commands:\n" + helpText), {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(helpComponent);
				break;

			default:
				// Check if it's a provider-specific option or base option
				if (command.includes(":") || CONFIG_SCHEMA.base.hasOwnProperty(command)) {
					// Show current value and prompt for new value
					const currentValue = currentOptions[command];
					const promptComponent = new TextComponent(
						chalk.yellow(
							`Current ${command}: ${currentValue ?? "not set"}\nUse /${command} <value> to set a new value`,
						),
						{ bottom: 1, left: 1, right: 1 },
					);
					messagesContainer.addChild(promptComponent);
				} else {
					const errorComponent = new TextComponent(chalk.red(`Unknown command: /${command}`), {
						bottom: 1,
						left: 1,
						right: 1,
					});
					messagesContainer.addChild(errorComponent);
				}
		}
	}

	// Start the TUI
	tui.start();
}
