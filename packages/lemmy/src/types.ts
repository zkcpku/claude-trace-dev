// Core type definitions for lemmy

import { OpenAIModels, AnthropicModels } from "./model-registry.js";

/**
 * Common interface implemented by all LLM provider clients
 */
export interface ChatClient {
	/**
	 * Send input to the LLM and get a response
	 * Supports text, tool results, and multimodal attachments
	 *
	 * Context Management:
	 * - Adds a USER message with the input content to context (if provided)
	 * - Adds an ASSISTANT message with the response to context (if successful)
	 *
	 * @param input - The input (string for text-only, UserInput for complex content)
	 * @param options - Optional configuration including context and streaming callback
	 * @returns Promise resolving to the result (success, tool call, or error)
	 */
	ask(input: string | UserInput, options?: AskOptions): Promise<AskResult>;

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
	type: "image" | "file";
	data: string | Buffer; // base64 string or buffer
	mimeType: string;
	name?: string;
}

/**
 * User input that can contain text, tool results, and/or attachments
 */
export interface UserInput {
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
 * System message
 */
export interface SystemMessage extends BaseMessage {
	role: "system";
	/** The message content */
	content: string;
}

/**
 * A message in the conversation history - discriminated union
 */
export type Message = UserMessage | AssistantMessage | SystemMessage;

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
 * Result of tool execution
 */
export interface ToolExecutionResult {
	/** The ID of the tool call this result corresponds to */
	toolCallId: string;
	/** Whether the tool executed successfully */
	success: boolean;
	/** Result from tool execution (type preserved) */
	result?: any;
	/** Error information if failed */
	error?: ToolError;
}

// Provider-specific configuration interfaces

/**
 * Configuration for Anthropic/Claude clients
 */
export interface AnthropicConfig {
	/** Anthropic API key */
	apiKey: string;
	/** Model name (e.g. 'claude-3-5-sonnet-20241022') */
	model: AnthropicModels;
	/** Optional custom API base URL */
	baseURL?: string;
	/** Maximum number of retries for failed requests */
	maxRetries?: number;
	/** Maximum number of output tokens to generate (default: 4096) */
	maxOutputTokens?: number;
	/** Optional extended thinking configuration */
	thinking?: {
		/** Whether to enable extended thinking */
		enabled: boolean;
		/** Optional budget for thinking tokens (default: reasonable model-specific limit) */
		budgetTokens?: number;
	};
}

/**
 * Configuration for OpenAI clients
 */
export interface OpenAIConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Model name (e.g. 'gpt-4o') */
	model: OpenAIModels;
	/** Optional OpenAI organization ID */
	organization?: string;
	/** Optional custom API base URL */
	baseURL?: string;
	/** Maximum number of retries for failed requests */
	maxRetries?: number;
	/** Maximum number of output tokens to generate (default: 4096) */
	maxOutputTokens?: number;
	/** Reasoning effort level - only supported by reasoning models (o1-mini, o1-preview) */
	reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Configuration for Google/Gemini clients
 */
export interface GoogleConfig {
	/** Google API key */
	apiKey: string;
	/** Model name (e.g. 'gemini-1.5-pro') */
	model: string;
	/** Optional Google Cloud project ID */
	projectId?: string;
	/** Optional custom API base URL */
	baseURL?: string;
	/** Maximum number of retries for failed requests */
	maxRetries?: number;
}

/**
 * Configuration for Ollama clients (local models)
 */
export interface OllamaConfig {
	/** Model name (user-defined local model) */
	model: string;
	/** Ollama server base URL (default: http://localhost:11434) */
	baseURL?: string;
	/** Maximum number of retries for failed requests */
	maxRetries?: number;
}

/**
 * Context for managing conversation state across providers
 * Forward declaration - full implementation in context.ts
 */
export interface Context {
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
	executeTool(toolCall: ToolCall): Promise<ToolExecutionResult>;
	/** Execute multiple tools in parallel */
	executeTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]>;
}
