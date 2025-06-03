import {
	createClientForModel,
	getProviderForModel,
	findModelData,
	type AllModels,
	type ModelData,
} from "@mariozechner/lemmy";
import type {
	AnthropicConfig,
	OpenAIConfig,
	GoogleConfig,
	AnthropicAskOptions,
	OpenAIAskOptions,
	GoogleAskOptions,
} from "@mariozechner/lemmy";
import type {
	Provider,
	BridgeConfig,
	ProviderClientInfo,
	CapabilityValidationResult,
	ProviderConfig,
} from "../types.js";

/**
 * Create provider-agnostic client for a given model
 */
export function createProviderClient(config: BridgeConfig): ProviderClientInfo {
	const provider = getProviderForModel(config.model as AllModels) as Provider;
	const modelData = findModelData(config.model);

	if (!modelData) {
		throw new Error(`Model data not found for model: ${config.model}`);
	}

	const providerConfig = buildProviderConfig(provider, config);
	const client = createClientForModel(config.model as AllModels, providerConfig);

	return {
		client,
		provider,
		model: config.model,
		modelData,
	};
}

/**
 * Build provider-specific configuration from bridge config
 */
function buildProviderConfig(provider: Provider, config: BridgeConfig): ProviderConfig {
	const baseConfig = {
		model: config.model,
		apiKey: config.apiKey || getDefaultApiKey(provider),
		...(config.baseURL && { baseURL: config.baseURL }),
		...(config.maxRetries && { maxRetries: config.maxRetries }),
	};

	switch (provider) {
		case "anthropic":
			return baseConfig as AnthropicConfig;
		case "openai":
			return baseConfig as OpenAIConfig;
		case "google":
			return baseConfig as GoogleConfig;
		default:
			// TypeScript exhaustiveness check
			const _exhaustiveCheck: never = provider;
			throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
	}
}

/**
 * Get default API key environment variable for provider
 */
function getDefaultApiKey(provider: Provider): string {
	switch (provider) {
		case "anthropic":
			const anthropicKey = process.env["ANTHROPIC_API_KEY"];
			if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
			return anthropicKey;
		case "openai":
			const openaiKey = process.env["OPENAI_API_KEY"];
			if (!openaiKey) throw new Error("OPENAI_API_KEY environment variable is required");
			return openaiKey;
		case "google":
			const googleKey = process.env["GOOGLE_API_KEY"];
			if (!googleKey) throw new Error("GOOGLE_API_KEY environment variable is required");
			return googleKey;
		default:
			// TypeScript exhaustiveness check
			const _exhaustiveCheck: never = provider;
			throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
	}
}

/**
 * Validate model capabilities against request requirements
 */
export function validateCapabilities(
	modelData: ModelData,
	anthropicRequest: any,
	logger?: { log: (msg: string) => void },
): CapabilityValidationResult {
	const warnings: string[] = [];
	const adjustments: CapabilityValidationResult["adjustments"] = {};

	// Check output token limits
	if (anthropicRequest.max_tokens && anthropicRequest.max_tokens > modelData.maxOutputTokens) {
		warnings.push(
			`Requested max_tokens (${anthropicRequest.max_tokens}) exceeds model limit (${modelData.maxOutputTokens}). Will be clamped to model maximum.`,
		);
		adjustments.maxOutputTokens = modelData.maxOutputTokens;
		logger?.log(`⚠️  Max tokens clamped: ${anthropicRequest.max_tokens} → ${modelData.maxOutputTokens}`);
	}

	// Check tool support
	if (anthropicRequest.tools && anthropicRequest.tools.length > 0 && !modelData.supportsTools) {
		warnings.push(`Model ${anthropicRequest.model} does not support tools. Tool calls will be disabled.`);
		adjustments.toolsDisabled = true;
		logger?.log(`⚠️  Tools disabled for model without tool support`);
	}

	// Check image support (scan through messages for images)
	const hasImages = anthropicRequest.messages?.some((msg: any) =>
		Array.isArray(msg.content) ? msg.content.some((block: any) => block.type === "image") : false,
	);

	if (hasImages && !modelData.supportsImageInput) {
		warnings.push(`Model ${anthropicRequest.model} does not support image input. Images will be ignored.`);
		adjustments.imagesIgnored = true;
		logger?.log(`⚠️  Images ignored for model without image support`);
	}

	return {
		valid: warnings.length === 0,
		warnings,
		adjustments,
	};
}

/**
 * Convert thinking parameters based on provider type
 */
export function convertThinkingParameters(
	provider: Provider,
	anthropicRequest: any,
): AnthropicAskOptions | OpenAIAskOptions | GoogleAskOptions {
	const baseOptions = {
		maxOutputTokens: anthropicRequest.max_tokens,
	};

	switch (provider) {
		case "anthropic":
			return {
				...baseOptions,
				// Anthropic uses the same thinking parameters
				...(anthropicRequest.thinking_enabled !== undefined && {
					thinkingEnabled: anthropicRequest.thinking_enabled,
				}),
				...(anthropicRequest.max_thinking_tokens !== undefined && {
					maxThinkingTokens: anthropicRequest.max_thinking_tokens,
				}),
			} as AnthropicAskOptions;

		case "google":
			return {
				...baseOptions,
				// Google uses includeThoughts for thinking
				...(anthropicRequest.thinking_enabled !== undefined && {
					includeThoughts: anthropicRequest.thinking_enabled,
				}),
				...(anthropicRequest.max_thinking_tokens !== undefined && {
					thinkingBudget: anthropicRequest.max_thinking_tokens,
				}),
			} as GoogleAskOptions;

		case "openai":
			// OpenAI doesn't support thinking for most models
			// Only reasoning models (o1-*) support reasoningEffort
			const isReasoningModel = anthropicRequest.model?.includes("o1-");
			return {
				...baseOptions,
				...(isReasoningModel &&
					anthropicRequest.thinking_enabled && {
						reasoningEffort: "medium" as const,
					}),
			} as OpenAIAskOptions;

		default:
			// TypeScript exhaustiveness check
			const _exhaustiveCheck: never = provider;
			throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
	}
}
