import { z } from "zod";

// =============================================================================
// Ask options schemas (for runtime API calls)
// =============================================================================

export const BaseAskOptionsSchema = z.object({
	context: z.any().optional().describe("Context object for conversation state"),
	maxOutputTokens: z.coerce.number().min(1).optional().describe("Maximum number of output tokens to generate"),
	onChunk: z
		.function()
		.args(z.string())
		.returns(z.void())
		.optional()
		.describe("Streaming callback for content chunks"),
	onThinkingChunk: z
		.function()
		.args(z.string())
		.returns(z.void())
		.optional()
		.describe("Streaming callback for thinking chunks (if supported by provider)"),
});

export const AnthropicAskOptionsSchema = BaseAskOptionsSchema.extend({
	thinkingEnabled: z.coerce.boolean().optional().describe("Whether to enable extended thinking for this request"),
	maxThinkingTokens: z.coerce
		.number()
		.min(1024)
		.optional()
		.describe("Maximum number of thinking tokens for this request (must be ≥1024 and less than max_tokens)"),
	temperature: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Temperature for sampling (0.0-1.0, defaults to 1.0)"),
	topK: z.coerce.number().min(1).optional().describe("Only sample from the top K options for each token"),
	topP: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Use nucleus sampling with specified probability cutoff (0.0-1.0)"),
	stopSequences: z.string().optional().describe("Stop sequence (single string)"),
	toolChoice: z.enum(["auto", "any", "none"]).optional().describe("How the model should use the provided tools"),
	disableParallelToolUse: z.coerce.boolean().optional().describe("Whether to disable parallel tool use"),
	serviceTier: z.enum(["auto", "standard_only"]).optional().describe("Priority tier for the request"),
	userId: z.string().optional().describe("External identifier for the user (uuid/hash)"),
});

export const OpenAIAskOptionsSchema = BaseAskOptionsSchema.extend({
	reasoningEffort: z
		.enum(["low", "medium", "high"])
		.optional()
		.describe("Reasoning effort level - only supported by reasoning models (o1-mini, o1-preview)"),
	temperature: z.coerce.number().min(0).max(2).optional().describe("Temperature for sampling (0.0-2.0)"),
	topP: z.coerce.number().min(0).max(1).optional().describe("Top-p sampling parameter (0.0-1.0)"),
	presencePenalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Presence penalty (-2.0 to 2.0) - penalizes tokens based on presence"),
	frequencyPenalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Frequency penalty (-2.0 to 2.0) - penalizes tokens based on frequency"),
	logprobs: z.coerce.boolean().optional().describe("Whether to return log probabilities of output tokens"),
	topLogprobs: z.coerce
		.number()
		.min(0)
		.max(20)
		.optional()
		.describe("Number of most likely tokens to return at each position (0-20)"),
	maxCompletionTokens: z.coerce
		.number()
		.min(1)
		.optional()
		.describe("Upper bound for tokens in completion (including reasoning tokens)"),
	n: z.coerce.number().min(1).max(128).optional().describe("Number of chat completion choices to generate (1-128)"),
	parallelToolCalls: z.coerce.boolean().optional().describe("Enable parallel function calling during tool use"),
	responseFormat: z.enum(["text", "json_object"]).optional().describe("Output format specification"),
	seed: z.coerce.number().optional().describe("For deterministic sampling (beta feature)"),
	serviceTier: z.enum(["auto", "default", "flex"]).optional().describe("Latency tier for scale tier customers"),
	stop: z.string().optional().describe("Stop sequence (single string)"),
	store: z.coerce.boolean().optional().describe("Store output for model distillation/evals"),
	toolChoice: z.enum(["none", "auto", "required"]).optional().describe("Controls which tool is called"),
	user: z.string().optional().describe("Stable identifier for end-users"),
});

export const GoogleAskOptionsSchema = BaseAskOptionsSchema.extend({
	includeThoughts: z.coerce.boolean().optional().describe("Whether to include thinking tokens for this request"),
	thinkingBudget: z.coerce.number().min(1).optional().describe("Thinking budget in tokens"),
	temperature: z.coerce.number().min(0).max(2).optional().describe("Temperature for sampling (0.0-2.0)"),
	topP: z.coerce.number().min(0).max(1).optional().describe("Top-p sampling parameter (0.0-1.0)"),
	topK: z.coerce.number().min(1).optional().describe("Top-k sampling parameter (positive integer)"),
	candidateCount: z.coerce.number().min(1).optional().describe("Number of response variations to return"),
	stopSequences: z.string().optional().describe("Stop sequence (single string)"),
	responseLogprobs: z.coerce.boolean().optional().describe("Whether to return the log probabilities of chosen tokens"),
	logprobs: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Number of top candidate tokens to return log probabilities for"),
	presencePenalty: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Positive values penalize tokens that already appear (presence penalty)"),
	frequencyPenalty: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Positive values penalize tokens that repeatedly appear (frequency penalty)"),
	seed: z.coerce.number().optional().describe("Fixed seed for deterministic responses"),
	responseMimeType: z.enum(["text/plain", "application/json"]).optional().describe("Output response mimetype"),
});

// =============================================================================
// Client configuration schemas (compose base config + model + defaults)
// =============================================================================
export const BaseClientConfigSchema = z.object({
	apiKey: z.string().describe("API key for the provider"),
	baseURL: z.string().optional().describe("Optional custom API base URL"),
	maxRetries: z.coerce.number().min(0).optional().describe("Maximum number of retries for failed requests"),
});

export const AnthropicConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'claude-3-5-sonnet-20241022')"),
	defaults: AnthropicAskOptionsSchema.omit({ context: true }).optional().describe("Default options for ask requests"),
});

export const OpenAIConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'gpt-4o')"),
	organization: z.string().optional().describe("Optional OpenAI organization ID"),
	defaults: OpenAIAskOptionsSchema.omit({ context: true }).optional().describe("Default options for ask requests"),
});

export const GoogleConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'gemini-1.5-pro')"),
	projectId: z.string().optional().describe("Optional Google Cloud project ID"),
	defaults: GoogleAskOptionsSchema.omit({ context: true }).optional().describe("Default options for ask requests"),
});

// =============================================================================
// Export schemas for runtime validation (for CLI)
// =============================================================================

export const CLIENT_CONFIG_SCHEMAS = {
	base: BaseClientConfigSchema.omit({ apiKey: true }), // Remove apiKey for CLI options
	anthropic: AnthropicAskOptionsSchema.omit({ context: true }),
	openai: OpenAIAskOptionsSchema.omit({ context: true }),
	google: GoogleAskOptionsSchema.omit({ context: true }),
} as const;

// =============================================================================
// Export concrete config and ask options types
// =============================================================================
export type BaseConfig = z.infer<typeof BaseClientConfigSchema>;
export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;

export type BaseAskOptions = z.infer<typeof BaseAskOptionsSchema>;
export type AnthropicAskOptions = z.infer<typeof AnthropicAskOptionsSchema>;
export type OpenAIAskOptions = z.infer<typeof OpenAIAskOptionsSchema>;
export type GoogleAskOptions = z.infer<typeof GoogleAskOptionsSchema>;
export type AskOptions = AnthropicAskOptions | OpenAIAskOptions | GoogleAskOptions;
