// Core type definitions for lemmy

import { OpenAIModels, AnthropicModels, GoogleModels } from "./model-registry.js";

/**
 * Common interface implemented by all LLM provider clients
 */
export interface ChatClient<TOptions extends AskOptions = AskOptions> {
	/**
	 * Send input to the LLM and get a response
	 * Supports text, tool results, and multimodal attachments
	 *
	 * Context Management:
	 * - Adds a USER message with the input content to context (if provided)
	 * - Adds an ASSISTANT message with the response to context (if successful)
	 *
	 * @param input - The input (string for text-only, AskInput for complex content)
	 * @param options - Optional configuration including context and streaming callback
	 * @returns Promise resolving to the result (success, tool call, or error)
	 */
	ask(input: string | AskInput, options?: TOptions): Promise<AskResult>;

	/**
	 * Get the model name/identifier used by this client
	 *
	 * @returns The model name (e.g., 'claude-3-5-sonnet-20241022', 'gpt-4o', 'o1-mini')
	 */
	getModel(): string;

	/**
	 * Get the provider name for this client
	 *
	 * @returns The provider name (e.g., 'anthropic', 'openai')
	 */
	getProvider(): string;
}

/**
 * Options for the ask method
 */
export interface AskOptions {
	/** Optional context to maintain conversation state */
	context?: Context;
	/** Optional maximum number of tokens to generate */
	maxOutputTokens?: number;
	/** Optional callback for streaming content chunks */
	onChunk?: (content: string) => void;
	/** Optional callback for streaming thinking chunks (if supported by provider) */
	onThinkingChunk?: (thinking: string) => void;
}

/**
 * Options for the ask method for AnthropicClient
 */
export interface AnthropicAskOptions extends AskOptions {
	/** Whether to enable extended thinking for this request */
	thinkingEnabled?: boolean;
	/** Maximum number of thinking tokens for this request (must be ≥1024 and less than max_tokens) */
	maxThinkingTokens?: number;
	/** Temperature for sampling (0.0-1.0, defaults to 1.0) */
	temperature?: number;
	/** Only sample from the top K options for each token */
	topK?: number;
	/** Use nucleus sampling with specified probability cutoff (0.0-1.0) */
	topP?: number;
	/** Custom text sequences that will cause the model to stop generating */
	stopSequences?: string[];
	/** System prompt for providing context and instructions */
	system?: string;
	/** Definitions of tools that the model may use */
	tools?: any[]; // Type will be refined later
	/** How the model should use the provided tools */
	toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string; disable_parallel_tool_use?: boolean };
	/** Whether to disable parallel tool use */
	disableParallelToolUse?: boolean;
	/** Priority tier for the request ('auto' | 'standard_only') */
	serviceTier?: "auto" | "standard_only";
	/** External identifier for the user (uuid/hash) */
	userId?: string;
}

/**
 * Options for the ask method for OpenAIClient
 */
export interface OpenAIAskOptions extends AskOptions {
	/** Reasoning effort level - only supported by reasoning models (o1-mini, o1-preview) */
	reasoningEffort?: "low" | "medium" | "high";
	/** Temperature for sampling (0.0-2.0) */
	temperature?: number;
	/** Top-p sampling parameter (0.0-1.0) */
	topP?: number;
	/** Presence penalty (-2.0 to 2.0) - penalizes tokens based on presence */
	presencePenalty?: number;
	/** Frequency penalty (-2.0 to 2.0) - penalizes tokens based on frequency */
	frequencyPenalty?: number;
	/** Modify likelihood of specific tokens appearing (-100 to 100) */
	logitBias?: Record<string, number>;
	/** Whether to return log probabilities of output tokens */
	logprobs?: boolean;
	/** Number of most likely tokens to return at each position (0-20) */
	topLogprobs?: number;
	/** Upper bound for tokens in completion (including reasoning tokens) */
	maxCompletionTokens?: number;
	/** Number of chat completion choices to generate (1-128) */
	n?: number;
	/** Enable parallel function calling during tool use */
	parallelToolCalls?: boolean;
	/** Output format specification */
	responseFormat?: { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: any };
	/** For deterministic sampling (beta feature) */
	seed?: number;
	/** Latency tier for scale tier customers */
	serviceTier?: "auto" | "default" | "flex";
	/** Up to 4 stop sequences */
	stop?: string | string[];
	/** Store output for model distillation/evals */
	store?: boolean;
	/** Controls which tool is called */
	toolChoice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
	/** Stable identifier for end-users */
	user?: string;
}

/**
 * Options for the ask method for GoogleClient
 */
export interface GoogleAskOptions extends AskOptions {
	/** Whether to include thinking tokens for this request */
	includeThoughts?: boolean;
	/** Thinking budget in tokens */
	thinkingBudget?: number;
	/** Temperature for sampling (0.0-2.0) */
	temperature?: number;
	/** Top-p sampling parameter (0.0-1.0) */
	topP?: number;
	/** Top-k sampling parameter (positive integer) */
	topK?: number;
	/** Number of response variations to return */
	candidateCount?: number;
	/** List of strings that tells the model to stop generating text */
	stopSequences?: string[];
	/** Whether to return the log probabilities of chosen tokens */
	responseLogprobs?: boolean;
	/** Number of top candidate tokens to return log probabilities for */
	logprobs?: number;
	/** Positive values penalize tokens that already appear (presence penalty) */
	presencePenalty?: number;
	/** Positive values penalize tokens that repeatedly appear (frequency penalty) */
	frequencyPenalty?: number;
	/** Fixed seed for deterministic responses */
	seed?: number;
	/** Output response mimetype ('text/plain' | 'application/json') */
	responseMimeType?: string;
	/** Instructions for the model (system prompt) */
	systemInstruction?: string;
}

/**
 * The reason the generation stopped
 */
export type StopReason = "max_tokens" | "stop_sequence" | "tool_call" | "complete";

/**
 * Discriminated union of all possible ask method results
 */
export type AskResult =
	| {
			type: "success";
			stopReason: StopReason;
			message: AssistantMessage;
			tokens: TokenUsage;
			cost: number;
	  }
	| { type: "error"; error: ModelError };

/**
 * Token usage statistics
 */
export interface TokenUsage {
	/** Number of input tokens */
	input: number;
	/** Number of output tokens */
	output: number;
}

/**
 * Base message structure for user, assistant, and system messages
 */
export interface BaseMessage {
	/** When this message was created */
	timestamp: Date;
}

/**
 * Attachment for multimodal models (images, files, etc.)
 */
export interface Attachment {
	type: "image";
	data: string | Buffer; // base64 string or buffer
	mimeType: string;
	name?: string;
}

/**
 * Input for the ask method that can contain text, tool results, and/or attachments
 */
export interface AskInput {
	/** Optional text content */
	content?: string;
	/** Optional tool results from previous tool calls */
	toolResults?: ToolResult[];
	/** Optional attachments for multimodal models */
	attachments?: Attachment[];
}

/**
 * User message - can contain text, tool results, and/or attachments
 */
export interface UserMessage extends BaseMessage {
	role: "user";
	/** Optional text content */
	content?: string;
	/** Optional tool results */
	toolResults?: ToolResult[];
	/** Optional attachments */
	attachments?: Attachment[];
}

/**
 * Assistant message
 */
export interface AssistantMessage extends BaseMessage {
	role: "assistant";
	/** Optional message content */
	content?: string;
	/** Tool calls made by the assistant (if any) */
	toolCalls?: ToolCall[];
	/** Internal reasoning/thinking content (if available from provider) */
	thinking?: string;
	/** Thinking signature (for Anthropic thinking blocks) */
	thinkingSignature?: string;
	/** Cumulative token usage up to and including this message */
	usage: TokenUsage;
	/** Which provider generated this message */
	provider: string;
	/** Which model generated this message (used for cost calculation) */
	model: string;
	/** Duration in seconds from request start to message completion */
	took: number;
}

/**
 * A message in the conversation history - discriminated union
 */
export type Message = UserMessage | AssistantMessage;

/**
 * Error from the LLM provider
 */
export interface ModelError {
	/** Category of error */
	type: "rate_limit" | "auth" | "network" | "api_error" | "invalid_request";
	/** Human-readable error message */
	message: string;
	/** Whether this error can be retried */
	retryable: boolean;
	/** For rate limits, how long to wait before retrying (seconds) */
	retryAfter?: number;
}

/**
 * Error from tool execution
 */
export interface ToolError {
	/** Category of tool error */
	type: "execution_failed" | "invalid_args" | "mcp_error";
	/** Human-readable error message */
	message: string;
	/** Name of the tool that failed */
	toolName: string;
}

/**
 * A request to execute a tool
 */
export interface ToolCall {
	/** Unique identifier for this tool call */
	id: string;
	/** Name of the tool to execute */
	name: string;
	/** Arguments to pass to the tool */
	arguments: Record<string, unknown>;
}

/**
 * Result of a tool execution for sending to LLM
 */
export interface ToolResult {
	/** The ID of the tool call this result responds to */
	toolCallId: string;
	/** The result content from tool execution */
	content: string;
}

/**
 * Definition of an available tool
 */
export interface ToolDefinition<T = Record<string, unknown>, R = unknown> {
	/** Unique name of the tool */
	name: string;
	/** Description of what the tool does */
	description: string;
	/** Zod schema for validating tool arguments */
	schema: import("zod").ZodSchema<T>;
	/** Function to execute when tool is called */
	execute: (args: T) => Promise<R>;
}

/**
 * Parameters for defining a tool
 */
export interface DefineToolParams<T = Record<string, unknown>, R = unknown> {
	/** Unique name of the tool */
	name: string;
	/** Description of what the tool does */
	description: string;
	/** Zod schema for validating tool arguments */
	schema: import("zod").ZodSchema<T>;
	/** Function to execute when tool is called */
	execute: (args: T) => Promise<R>;
}

/**
 * Result of tool execution with type-safe discriminated union
 */
export type ExecuteToolResult =
	| {
			/** Tool executed successfully */
			success: true;
			/** The ID of the tool call this result corresponds to */
			toolCallId: string;
			/** Result from tool execution (type preserved as unknown) */
			result: unknown;
	  }
	| {
			/** Tool execution failed */
			success: false;
			/** The ID of the tool call this result corresponds to */
			toolCallId: string;
			/** Error information */
			error: ToolError;
	  };

// Provider-specific configuration interfaces

/**
 * Base configuration shared by all providers
 */
export interface BaseConfig {
	/** API key for the provider */
	apiKey: string;
	/** Optional custom API base URL */
	baseURL?: string;
	/** Maximum number of retries for failed requests */
	maxRetries?: number;
	/** Maximum number of output tokens to generate (default: 4096) */
	maxOutputTokens?: number;
}

/**
 * Configuration for Anthropic/Claude clients
 */
export interface AnthropicConfig extends BaseConfig {
	/** Model name (e.g. 'claude-3-5-sonnet-20241022') */
	model: AnthropicModels;
	/** Default options for ask requests */
	defaults?: AnthropicAskOptions;
}

/**
 * Configuration for OpenAI clients
 */
export interface OpenAIConfig extends BaseConfig {
	/** Model name (e.g. 'gpt-4o') */
	model: OpenAIModels;
	/** Optional OpenAI organization ID */
	organization?: string;
	/** Default options for ask requests */
	defaults?: OpenAIAskOptions;
}

/**
 * Configuration for Google/Gemini clients
 */
export interface GoogleConfig extends BaseConfig {
	/** Model name (e.g. 'gemini-1.5-pro') */
	model: GoogleModels;
	/** Optional Google Cloud project ID */
	projectId?: string;
	/** Default options for ask requests */
	defaults?: GoogleAskOptions;
}

/**
 * Context for managing conversation state across providers
 * Forward declaration - full implementation in context.ts
 */
export interface Context {
	/** Set the system message for the conversation */
	setSystemMessage(message: string): void;
	/** Get the system message for the conversation */
	getSystemMessage(): string | undefined;
	/** Add a message to the conversation history */
	addMessage(message: Message): void;
	/** Get all messages in the conversation */
	getMessages(): readonly Message[];
	/** Get the last message in the conversation */
	getLastMessage(): Message | undefined;
	/** Clear all messages from the conversation */
	clear(): void;
	/** Create a copy of this context */
	clone(): Context;
	/** Calculate total cost across all messages */
	getTotalCost(): number;
	/** Get aggregated token usage across all messages */
	getTokenUsage(): TokenUsage;
	/** Add a tool to the context */
	addTool<T = Record<string, unknown>, R = unknown>(tool: ToolDefinition<T, R>): void;
	/** Get a specific tool by name */
	getTool(name: string): ToolDefinition<any, any> | undefined;
	/** List all available tools */
	listTools(): ToolDefinition<any, any>[];
	/** Execute a tool call and return the result with error handling */
	executeTool(toolCall: ToolCall): Promise<ExecuteToolResult>;
	/** Execute multiple tools in parallel */
	executeTools(toolCalls: ToolCall[]): Promise<ExecuteToolResult[]>;
}
