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
			doc: "Whether to enable extended thinking",
		},
		maxThinkingTokens: {
			type: "number",
			required: false,
			doc: "Maximum number of thinking tokens (default: reasonable model-specific limit)",
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
			doc: "Whether to include thinking tokens",
		},
	},
} as const;
