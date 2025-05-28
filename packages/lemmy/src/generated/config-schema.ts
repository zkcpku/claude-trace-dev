export const CONFIG_SCHEMA = {
	base: {
		apiKey: {
			type: "string",
			required: true,
			doc: "API key for the provider",
		},
		baseURL: {
			type: "string",
			required: false,
			doc: "Optional custom API base URL",
		},
		maxRetries: {
			type: "number",
			required: false,
			doc: "Maximum number of retries for failed requests",
		},
		maxOutputTokens: {
			type: "number",
			required: false,
			doc: "Maximum number of output tokens to generate (default: 4096)",
		},
	},
	anthropic: {
		model: {
			type: "string",
			required: true,
			doc: "Model name (e.g. 'claude-3-5-sonnet-20241022')",
		},
		thinkingEnabled: {
			type: "boolean",
			required: false,
			doc: "Whether to enable extended thinking for this request",
		},
		maxThinkingTokens: {
			type: "number",
			required: false,
			doc: "Maximum number of thinking tokens for this request (must be ≥1024 and less than max_tokens)",
		},
		temperature: {
			type: "number",
			required: false,
			doc: "Temperature for sampling (0.0-1.0, defaults to 1.0)",
		},
		topK: {
			type: "number",
			required: false,
			doc: "Only sample from the top K options for each token",
		},
		topP: {
			type: "number",
			required: false,
			doc: "Use nucleus sampling with specified probability cutoff (0.0-1.0)",
		},
		stopSequences: {
			type: "string",
			required: false,
			doc: "Custom text sequences that will cause the model to stop generating",
		},
		system: {
			type: "string",
			required: false,
			doc: "System prompt for providing context and instructions",
		},
		disableParallelToolUse: {
			type: "boolean",
			required: false,
			doc: "Whether to disable parallel tool use",
		},
		serviceTier: {
			type: "enum",
			required: false,
			doc: "Priority tier for the request",
			values: ["auto", "standard_only"],
		},
		userId: {
			type: "string",
			required: false,
			doc: "External identifier for the user (uuid/hash)",
		},
	},
	openai: {
		model: {
			type: "string",
			required: true,
			doc: "Model name (e.g. 'gpt-4o')",
		},
		organization: {
			type: "string",
			required: false,
			doc: "Optional OpenAI organization ID",
		},
		reasoningEffort: {
			type: "enum",
			required: false,
			doc: "Reasoning effort level - only supported by reasoning models (o1-mini, o1-preview)",
			values: ["low", "medium", "high"],
		},
		temperature: {
			type: "number",
			required: false,
			doc: "Temperature for sampling (0.0-2.0)",
		},
		topP: {
			type: "number",
			required: false,
			doc: "Top-p sampling parameter (0.0-1.0)",
		},
		presencePenalty: {
			type: "number",
			required: false,
			doc: "Presence penalty (-2.0 to 2.0) - penalizes tokens based on presence",
		},
		frequencyPenalty: {
			type: "number",
			required: false,
			doc: "Frequency penalty (-2.0 to 2.0) - penalizes tokens based on frequency",
		},
		logprobs: {
			type: "boolean",
			required: false,
			doc: "Whether to return log probabilities of output tokens",
		},
		topLogprobs: {
			type: "number",
			required: false,
			doc: "Number of most likely tokens to return at each position (0-20)",
		},
		maxCompletionTokens: {
			type: "number",
			required: false,
			doc: "Upper bound for tokens in completion (including reasoning tokens)",
		},
		n: {
			type: "number",
			required: false,
			doc: "Number of chat completion choices to generate (1-128)",
		},
		parallelToolCalls: {
			type: "boolean",
			required: false,
			doc: "Enable parallel function calling during tool use",
		},
		seed: {
			type: "number",
			required: false,
			doc: "For deterministic sampling (beta feature)",
		},
		serviceTier: {
			type: "enum",
			required: false,
			doc: "Latency tier for scale tier customers",
			values: ["auto", "default", "flex"],
		},
		stop: {
			type: "string",
			required: false,
			doc: "Up to 4 stop sequences",
		},
		store: {
			type: "boolean",
			required: false,
			doc: "Store output for model distillation/evals",
		},
		user: {
			type: "string",
			required: false,
			doc: "Stable identifier for end-users",
		},
	},
	google: {
		model: {
			type: "string",
			required: true,
			doc: "Model name (e.g. 'gemini-1.5-pro')",
		},
		projectId: {
			type: "string",
			required: false,
			doc: "Optional Google Cloud project ID",
		},
		includeThoughts: {
			type: "boolean",
			required: false,
			doc: "Whether to include thinking tokens for this request",
		},
		thinkingBudget: {
			type: "number",
			required: false,
			doc: "Thinking budget in tokens",
		},
		temperature: {
			type: "number",
			required: false,
			doc: "Temperature for sampling (0.0-2.0)",
		},
		topP: {
			type: "number",
			required: false,
			doc: "Top-p sampling parameter (0.0-1.0)",
		},
		topK: {
			type: "number",
			required: false,
			doc: "Top-k sampling parameter (positive integer)",
		},
		candidateCount: {
			type: "number",
			required: false,
			doc: "Number of response variations to return",
		},
		stopSequences: {
			type: "string",
			required: false,
			doc: "List of strings that tells the model to stop generating text",
		},
		responseLogprobs: {
			type: "boolean",
			required: false,
			doc: "Whether to return the log probabilities of chosen tokens",
		},
		logprobs: {
			type: "number",
			required: false,
			doc: "Number of top candidate tokens to return log probabilities for",
		},
		presencePenalty: {
			type: "number",
			required: false,
			doc: "Positive values penalize tokens that already appear (presence penalty)",
		},
		frequencyPenalty: {
			type: "number",
			required: false,
			doc: "Positive values penalize tokens that repeatedly appear (frequency penalty)",
		},
		seed: {
			type: "number",
			required: false,
			doc: "Fixed seed for deterministic responses",
		},
		responseMimeType: {
			type: "string",
			required: false,
			doc: "Output response mimetype ('text/plain' | 'application/json')",
		},
		systemInstruction: {
			type: "string",
			required: false,
			doc: "Instructions for the model (system prompt)",
		},
	},
} as const;
