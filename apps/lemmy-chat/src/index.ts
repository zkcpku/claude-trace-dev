#!/usr/bin/env node --no-deprecation

import { Command } from "commander";
import { getProviders } from "@mariozechner/lemmy";
import { getDefaultProviderConfig, getProviderConfig } from "./defaults.js";
import { runOneShot } from "./one-shot.js";
import { createModelsCommand, createDefaultsCommand, createChatCommand, createOneShotCommand } from "./commands.js";

function setupProgram(): Command {
	const program = new Command();

	program.name("lemmy-chat").description("CLI for chatting with various LLM providers").version("0.1.0");

	// Add models and defaults commands
	program.addCommand(createModelsCommand());
	program.addCommand(createDefaultsCommand());

	// Add chat commands
	program.addCommand(createChatCommand());

	// Add one-shot subcommands, one per provider
	for (const provider of getProviders()) {
		const providerCommand = createOneShotCommand(provider);
		program.addCommand(providerCommand);
	}

	// Add global help with apps
	program.addHelpText(
		"after",
		`
Examples:
  $ lemmy-chat models                                    # List all available models
  $ lemmy-chat models --provider anthropic --tools      # List Anthropic models with tool support
  $ lemmy-chat anthropic "What is TypeScript?"          # Direct provider usage
  $ lemmy-chat openai "Solve this math problem"         # Direct provider usage
  $ lemmy-chat google "Tell me a joke"                  # Direct provider usage

Interactive Chat Mode (TUI):
  $ lemmy-chat chat                                     # Uses defaults for TUI chat interface
  $ lemmy-chat chat -p anthropic -m claude-3-5-sonnet-20241022 --thinkingEnabled
  $ lemmy-chat chat -p openai -m o1-mini               # TUI chat with specific model

  TUI Features:
  - Rich terminal user interface with message history
  - Real-time streaming responses with proper display
  - Visual separation of thinking vs response content
  - Token usage and cost tracking displayed
  - Proper component-based rendering

Set Defaults (saves to ~/.lemmy-chat/defaults.json):
  $ lemmy-chat defaults anthropic -m claude-3-5-sonnet-20241022 --thinkingEnabled
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

async function main() {
	// Check if no arguments provided (just "lemmy-chat")
	if (process.argv.length === 2) {
		const defaultConfig = getDefaultProviderConfig();
		if (!defaultConfig) {
			// No defaults set, show help
			const program = setupProgram();
			program.help();
			return;
		} else {
			// Show defaults and prompt for message
			console.log("No message provided. Current defaults:");
			console.log(`  Provider: ${defaultConfig.provider}`);
			console.log(`  Model: ${defaultConfig.config.model}`);
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
		const defaultConfig = getDefaultProviderConfig();
		if (!defaultConfig) {
			console.error("❌ No defaults set. Set defaults first:");
			console.error("  lemmy-chat defaults anthropic -m claude-3-5-sonnet-latest");
			console.error("  lemmy-chat defaults openai -m o4-mini");
			process.exit(1);
		}

		// Extract message from args
		const message = process.argv.slice(2).join(" ");
		try {
			// Get the provider config with API key from environment
			const providerConfig = getProviderConfig(defaultConfig.provider);
			await runOneShot(defaultConfig.provider, message, providerConfig, []);
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
