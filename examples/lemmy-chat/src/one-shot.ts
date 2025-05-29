import { Context, createClientForModel, getDefaultApiKeyEnvVar, Attachment } from "@mariozechner/lemmy";
import { loadImageAttachment } from "./images.js";

export async function runOneShot(provider: string, message: string, options: any): Promise<void> {
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

	streamingOptions.onThinkingChunk = (chunk: string) => {
		hasThinking = true;
		// Output thinking in gray
		process.stdout.write(`\x1b[90m${chunk}\x1b[0m`);
	};

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
