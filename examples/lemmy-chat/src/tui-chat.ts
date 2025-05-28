import {
	AssistantMessage,
	calculateTokenCost,
	Context,
	createClientForModel,
	getDefaultApiKeyEnvVar,
	getProviders,
	UserMessage,
	AnthropicModelData,
	OpenAIModelData,
	GoogleModelData,
	findModelData,
} from "@mariozechner/lemmy";
import {
	TUI,
	Container,
	TextComponent,
	TextEditor,
	CombinedAutocompleteProvider,
	type AutocompleteItem,
	type SlashCommand,
	logger,
} from "@mariozechner/lemmy-tui";
import { CONFIG_SCHEMA } from "@mariozechner/lemmy";
import { loadDefaults, loadDefaultsConfig, getProviderConfig } from "./defaults.js";
import chalk from "chalk";

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

export async function runTUIChat(options: any): Promise<void> {
	// Determine provider and model
	let provider: string = options.provider;
	let model: string = options.model;

	// If no provider/model specified, try to use defaults
	if (!provider || !model) {
		const config = loadDefaultsConfig();
		if (!config.defaultProvider || Object.keys(config.providers).length === 0) {
			console.error("❌ No provider/model specified and no defaults set.");
			console.error("Either provide --provider and --model, or set defaults first:");
			console.error("  lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled");
			process.exit(1);
		}

		// Use default provider and its model
		provider = config.defaultProvider;
		const providerDefaults = config.providers[provider];
		model = providerDefaults?.model || "";

		if (!provider || !model) {
			console.error("❌ Could not determine provider/model from defaults");
			process.exit(1);
		}

		// Merge provider defaults with explicit options (explicit options take precedence)
		const providerConfig = getProviderConfig(
			provider,
			options.apiKey || process.env[getDefaultApiKeyEnvVar(provider as any)] || "",
		);

		// Create merged options: provider defaults + explicit options (explicit takes precedence)
		const mergedOptions: any = {
			provider,
			model,
			...providerConfig,
			...options, // Explicit options override defaults
		};

		options = mergedOptions;
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
	let client = createClientForModel(model, config);
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

	// Function to build commands for a specific provider
	function buildCommands(currentProvider: string): SlashCommand[] {
		// Get all available models for model command completions
		const allModels = {
			...AnthropicModelData,
			...OpenAIModelData,
			...GoogleModelData,
		};

		const commands: SlashCommand[] = [
			{ name: "exit", description: "Exit the chat" },
			{ name: "clear", description: "Clear the conversation" },
			{
				name: "model",
				description: "Show or set current model",
				getArgumentCompletions: (prefix: string) => {
					return Object.keys(allModels)
						.filter((modelName) => modelName.toLowerCase().includes(prefix.toLowerCase()))
						.map((modelName) => ({
							value: modelName,
							label: modelName,
							description: `Switch to ${modelName}`,
						}));
				},
			},
			{ name: "usage", description: "Show token usage and costs" },
			{ name: "system", description: "Set system prompt" },
			{ name: "help", description: "Show available commands" },
		];

		// Add provider-specific options from config schema
		const providerSchema = CONFIG_SCHEMA[currentProvider as keyof typeof CONFIG_SCHEMA] as any;
		if (providerSchema && typeof providerSchema === "object") {
			for (const [key, config] of Object.entries(providerSchema)) {
				// Skip the model field as it's already set
				if (key === "model") continue;

				const configObj = config as any;
				const commandName = `${currentProvider}:${key}`;
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
					name: commandName,
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
				name: key,
				description,
			});
		}

		return commands;
	}

	// Define available slash commands
	let commands = buildCommands(provider);

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

	// Store current ask options - initialize with current config
	let currentOptions: Record<string, any> = { ...config };
	delete currentOptions["apiKey"]; // Don't expose API key in options
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
			if (message.thinking) {
				const thinkingComponent = new TextComponent(chalk.dim.italic(`Thinking: ${message.thinking.trim()}`), {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(thinkingComponent);
			}

			const messageComponent = new TextComponent(`Assistant: ${message.content?.trim() || ""}`, {
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
				executeCommand(commandName, commandValue);
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

	async function executeCommand(command: string, value?: string) {
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
				if (value) {
					// User wants to set a new model
					const newModel = value.trim();
					const allModels = {
						...AnthropicModelData,
						...OpenAIModelData,
						...GoogleModelData,
					};

					if (allModels[newModel as keyof typeof allModels]) {
						try {
							// Determine new provider
							const { ModelToProvider } = await import("@mariozechner/lemmy");
							const newProvider = ModelToProvider[newModel as keyof typeof ModelToProvider];

							if (!newProvider) {
								throw new Error(`Could not determine provider for model: ${newModel}`);
							}

							// Get the correct API key for the new provider
							const newApiKey = process.env[getDefaultApiKeyEnvVar(newProvider as any)];
							if (!newApiKey) {
								throw new Error(
									`No API key found for ${newProvider}. Set ${getDefaultApiKeyEnvVar(newProvider as any)} environment variable.`,
								);
							}

							// Get provider-specific configuration in new structured format
							const newConfig: any = getProviderConfig(newProvider, newApiKey);

							// Override with the new model
							newConfig.model = newModel;
							const newProviderSchema = CONFIG_SCHEMA[newProvider as keyof typeof CONFIG_SCHEMA];
							const baseSchema = CONFIG_SCHEMA.base;

							// Add compatible provider-specific options
							if (newProviderSchema && typeof newProviderSchema === "object") {
								for (const [key, value] of Object.entries(currentOptions)) {
									if (key.startsWith(`${newProvider}:`)) {
										const optionKey = key.split(":")[1];
										if (optionKey && (newProviderSchema as any).hasOwnProperty(optionKey)) {
											newConfig[optionKey] = value;
										}
									}
								}
							}

							// Add compatible base options
							for (const [key, value] of Object.entries(currentOptions)) {
								if (baseSchema.hasOwnProperty(key)) {
									newConfig[key] = value;
								}
							}

							// Create new client
							const newClient = createClientForModel(newModel, newConfig);

							// Update variables
							client = newClient;
							model = newModel;
							provider = newProvider;
							currentOptions = newConfig;

							// Update header
							header.setText(chalk.yellow(`Chat with ${provider}/${model} | Type 'exit' to quit`));

							// Update commands for new provider
							commands = buildCommands(provider);
							const newAutocompleteProvider = new CombinedAutocompleteProvider(commands);
							inputEditor.setAutocompleteProvider(newAutocompleteProvider);

							const confirmComponent = new TextComponent(
								chalk.green(`✓ Switched to model: ${provider}/${model}`),
								{
									bottom: 1,
									left: 1,
									right: 1,
								},
							);
							messagesContainer.addChild(confirmComponent);

							// Show any options that were removed due to incompatibility
							const removedOptions = Object.keys(currentOptions).filter(
								(key) =>
									!baseSchema.hasOwnProperty(key) &&
									(!key.startsWith(`${newProvider}:`) ||
										!(newProviderSchema as any)?.hasOwnProperty(key.split(":")[1])),
							);

							if (removedOptions.length > 0) {
								const warningComponent = new TextComponent(
									chalk.yellow(`⚠️  Removed incompatible options: ${removedOptions.join(", ")}`),
									{ bottom: 1, left: 1, right: 1 },
								);
								messagesContainer.addChild(warningComponent);

								// Remove them from currentOptions
								for (const key of removedOptions) {
									delete currentOptions[key];
								}
							}
						} catch (error) {
							const errorComponent = new TextComponent(
								chalk.red(
									`❌ Failed to switch model: ${error instanceof Error ? error.message : String(error)}`,
								),
								{ bottom: 1, left: 1, right: 1 },
							);
							messagesContainer.addChild(errorComponent);
						}
					} else {
						// Invalid model
						const errorComponent = new TextComponent(chalk.red(`❌ Unknown model: ${newModel}`), {
							bottom: 1,
							left: 1,
							right: 1,
						});
						messagesContainer.addChild(errorComponent);
					}
				} else {
					// Show current model with full details
					const modelData = findModelData(model);
					if (modelData) {
						const fullInfo = formatModelInfo(model, modelData);
						const infoComponent = new TextComponent(chalk.cyan(`Current model:\n${fullInfo}`), {
							bottom: 1,
							left: 1,
							right: 1,
						});
						messagesContainer.addChild(infoComponent);
					} else {
						// Fallback if model data is not found
						const infoComponent = new TextComponent(chalk.cyan(`Current model: ${provider}/${model}`), {
							bottom: 1,
							left: 1,
							right: 1,
						});
						messagesContainer.addChild(infoComponent);
					}
				}
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
				const helpText = commands.map((cmd) => `  /${cmd.name} - ${cmd.description}`).join("\n");
				const helpComponent = new TextComponent(chalk.cyan("Available commands:\n" + helpText), {
					bottom: 1,
					left: 1,
					right: 1,
				});
				messagesContainer.addChild(helpComponent);
				break;

			case "system":
				if (value) {
					// Set new system prompt
					const newSystemMessage = value.trim();
					context.setSystemMessage(newSystemMessage);

					const confirmComponent = new TextComponent(chalk.green(`✓ System prompt set`), {
						bottom: 1,
						left: 1,
						right: 1,
					});
					messagesContainer.addChild(confirmComponent);

					// Show the new system message
					const previewComponent = new TextComponent(chalk.gray(`Preview: ${newSystemMessage}`), {
						bottom: 1,
						left: 1,
						right: 1,
					});
					messagesContainer.addChild(previewComponent);
				} else {
					// Show current system prompt
					const currentSystemMessage = context.getSystemMessage();
					let systemText = chalk.cyan("Current system prompt:");
					if (currentSystemMessage) {
						systemText += chalk.gray(`\n\n${currentSystemMessage}`);
					} else {
						systemText += chalk.gray("\n\n(No system prompt set)");
					}
					systemText += chalk.yellow("\n\nTo set a new system prompt, use: /system <prompt>");

					const systemComponent = new TextComponent(systemText, {
						bottom: 1,
						left: 1,
						right: 1,
					});
					messagesContainer.addChild(systemComponent);
				}
				break;

			default:
				// Check if it's a provider-specific option or base option
				if (command.includes(":") || CONFIG_SCHEMA.base.hasOwnProperty(command)) {
					if (value) {
						// Parse and store the value
						let parsedValue: any = value;

						// Try to parse as boolean
						if (value.toLowerCase() === "true") {
							parsedValue = true;
						} else if (value.toLowerCase() === "false") {
							parsedValue = false;
						}
						// Try to parse as number
						else if (!isNaN(Number(value))) {
							parsedValue = Number(value);
						}

						currentOptions[command] = parsedValue;

						const confirmComponent = new TextComponent(chalk.green(`✓ Set ${command} to: ${parsedValue}`), {
							bottom: 1,
							left: 1,
							right: 1,
						});
						messagesContainer.addChild(confirmComponent);
					} else {
						// Show current value and prompt for new value
						const currentValue = currentOptions[command];
						const promptComponent = new TextComponent(
							chalk.yellow(
								`Current ${command}: ${currentValue ?? "not set"}\nUse /${command} <value> to set a new value`,
							),
							{ bottom: 1, left: 1, right: 1 },
						);
						messagesContainer.addChild(promptComponent);
					}
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

	// Handle input simulation for testing
	if (options.simulateInput && Array.isArray(options.simulateInput)) {
		setTimeout(() => {
			console.log("\n🧪 Simulating input sequence:", options.simulateInput);

			let currentIndex = 0;

			const sendNextInput = () => {
				if (currentIndex >= options.simulateInput.length) {
					return;
				}

				const input = options.simulateInput[currentIndex];

				// Convert special keywords to actual characters
				let actualInput = input;
				if (input === "TAB") actualInput = "\t";
				else if (input === "ENTER") actualInput = "\r";
				else if (input === "SPACE") actualInput = " ";
				else if (input === "ESC") actualInput = "\x1b";

				console.log(`🧪 Step ${currentIndex + 1}: Sending "${input}" (${JSON.stringify(actualInput)})`);

				// Send input to the focused component
				if (inputEditor.handleInput) {
					inputEditor.handleInput(actualInput);
					tui.requestRender();
				}

				currentIndex++;

				// If this was ENTER, wait for processing to complete before sending next input
				if (input === "ENTER") {
					const waitForProcessing = () => {
						if (isProcessing) {
							setTimeout(waitForProcessing, 100);
						} else {
							// Wait a bit more after processing completes, then send next input
							setTimeout(sendNextInput, 500);
						}
					};
					waitForProcessing();
				} else {
					// For non-ENTER inputs, send next input after a short delay
					setTimeout(sendNextInput, 200);
				}
			};

			sendNextInput();
		}, 500); // Wait a bit for TUI to be ready
	}
}
