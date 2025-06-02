import type {
	UserMessage,
	AssistantMessage,
	Attachment,
	ToolResult,
	ToolCall,
	SerializedContext,
	SerializedToolDefinition,
} from "@mariozechner/lemmy";
import { Context } from "@mariozechner/lemmy";
import { z } from "zod";
import type {
	MessageCreateParamsBase,
	MessageParam,
	ToolChoice,
	ToolUnion,
	Metadata,
	ThinkingConfigParam,
	TextBlockParam,
	Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.js";

/**
 * Result of transforming an Anthropic request
 */
export interface TransformResult {
	/** Lemmy Context in serialized format with messages, system prompt, and tools */
	context: SerializedContext;
	/** Anthropic-specific parameters that aren't part of Context */
	anthropicParams: {
		model: string;
		max_tokens: number;
		temperature?: number;
		top_k?: number;
		top_p?: number;
		stop_sequences?: string[];
		stream?: boolean;
		tool_choice?: ToolChoice;
		metadata?: Metadata;
		thinking?: ThinkingConfigParam;
		service_tier?: "auto" | "standard_only";
		tools?: ToolUnion[];
	};
}

/**
 * Transform Anthropic API request to lemmy Context + Anthropic params
 */
export function transformAnthropicToLemmy(anthropicRequest: MessageCreateParamsBase): TransformResult {
	const context = new Context();
	const currentTime = new Date();

	// Set system message if present
	if (anthropicRequest.system) {
		if (typeof anthropicRequest.system === "string") {
			context.setSystemMessage(anthropicRequest.system);
		} else {
			// Handle TextBlockParam[] - extract text content
			const systemText = anthropicRequest.system
				.filter((block) => block.type === "text")
				.map((block) => ("text" in block ? block.text : ""))
				.join("\n");
			if (systemText) {
				context.setSystemMessage(systemText);
			}
		}
	}

	// Convert tools to lemmy SerializedToolDefinitions and add to context
	if (anthropicRequest.tools) {
		for (const anthropicTool of anthropicRequest.tools) {
			if (anthropicTool.type === "custom" || !anthropicTool.type) {
				// Standard custom tool
				const serializedTool = convertAnthropicToolToSerialized(anthropicTool as Tool);
				if (serializedTool) {
					// Create a dummy ToolDefinition with execute function to add to context
					const dummyTool = {
						...serializedTool,
						schema: z.object({}), // Dummy schema
						execute: async () => {
							throw new Error("Tool execution not supported in bridge mode");
						},
					};
					context.addTool(dummyTool);
				}
			}
			// Note: We skip built-in tools like bash_20250124, text_editor_20250124, web_search_20250305
			// since they're Anthropic-specific and don't have equivalent lemmy implementations
		}
	}

	// Convert each Anthropic message to lemmy format and add to context
	for (const anthropicMessage of anthropicRequest.messages) {
		if (anthropicMessage.role === "user") {
			const userMessage = convertAnthropicUserMessage(anthropicMessage, currentTime);
			context.addMessage(userMessage);
		} else if (anthropicMessage.role === "assistant") {
			const assistantMessage = convertAnthropicAssistantMessage(
				anthropicMessage,
				currentTime,
				anthropicRequest.model,
			);
			context.addMessage(assistantMessage);
		}
	}

	// Extract Anthropic-specific parameters (not stored in Context)
	const anthropicParams = {
		model: anthropicRequest.model,
		max_tokens: anthropicRequest.max_tokens,
		...(anthropicRequest.temperature !== undefined && { temperature: anthropicRequest.temperature }),
		...(anthropicRequest.top_k !== undefined && { top_k: anthropicRequest.top_k }),
		...(anthropicRequest.top_p !== undefined && { top_p: anthropicRequest.top_p }),
		...(anthropicRequest.stop_sequences && { stop_sequences: anthropicRequest.stop_sequences }),
		...(anthropicRequest.stream !== undefined && { stream: anthropicRequest.stream }),
		...(anthropicRequest.tool_choice && { tool_choice: anthropicRequest.tool_choice }),
		...(anthropicRequest.metadata && { metadata: anthropicRequest.metadata }),
		...(anthropicRequest.thinking && { thinking: anthropicRequest.thinking }),
		...(anthropicRequest.service_tier && { service_tier: anthropicRequest.service_tier }),
		...(anthropicRequest.tools && { tools: anthropicRequest.tools }),
	};

	return {
		context: context.serialize(),
		anthropicParams,
	};
}

/**
 * Convert Anthropic Tool to lemmy SerializedToolDefinition
 */
function convertAnthropicToolToSerialized(anthropicTool: Tool): SerializedToolDefinition | null {
	try {
		return {
			name: anthropicTool.name,
			description: anthropicTool.description || "",
			jsonSchema: anthropicTool.input_schema,
		};
	} catch (error) {
		console.warn(`Failed to convert Anthropic tool ${anthropicTool.name}:`, error);
		return null;
	}
}

function convertAnthropicUserMessage(anthropicMessage: MessageParam, timestamp: Date): UserMessage {
	const userMessage: UserMessage = {
		role: "user",
		timestamp,
	};

	if (typeof anthropicMessage.content === "string") {
		userMessage.content = anthropicMessage.content;
		return userMessage;
	}

	// Handle content blocks
	const contentBlocks = Array.isArray(anthropicMessage.content) ? anthropicMessage.content : [];
	let textContent = "";
	const toolResults: ToolResult[] = [];
	const attachments: Attachment[] = [];

	for (const block of contentBlocks) {
		switch (block.type) {
			case "text":
				if ("text" in block && block.text) {
					textContent += block.text;
				}
				break;

			case "tool_result":
				if ("tool_use_id" in block && "content" in block && block.tool_use_id && block.content) {
					toolResults.push({
						toolCallId: block.tool_use_id,
						content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
					});
				}
				break;

			case "image":
				if ("source" in block && block.source) {
					const source = block.source;
					let data: string;
					let mimeType: string;

					if ("data" in source && source.data) {
						// Base64 image
						data = source.data;
						mimeType = "media_type" in source && source.media_type ? source.media_type : "image/jpeg";
					} else if ("url" in source && source.url) {
						// URL image
						data = source.url;
						mimeType = "image/jpeg"; // Default for URL images
					} else {
						continue; // Skip invalid image blocks
					}

					attachments.push({
						type: "image",
						data,
						mimeType,
					});
				}
				break;

			case "document":
				// Documents aren't supported in lemmy types yet, so we skip them
				break;
		}
	}

	// Set the converted content
	if (textContent) userMessage.content = textContent;
	if (toolResults.length > 0) userMessage.toolResults = toolResults;
	if (attachments.length > 0) userMessage.attachments = attachments;

	return userMessage;
}

function convertAnthropicAssistantMessage(
	anthropicMessage: MessageParam,
	timestamp: Date,
	model: string,
): AssistantMessage {
	const assistantMessage: AssistantMessage = {
		role: "assistant",
		timestamp,
		// Required fields - we'll set defaults since we don't have the actual response data
		usage: { input: 0, output: 0 },
		provider: "anthropic",
		model: model,
		took: 0,
	};

	if (typeof anthropicMessage.content === "string") {
		assistantMessage.content = anthropicMessage.content;
		return assistantMessage;
	}

	// Handle content blocks
	const contentBlocks = Array.isArray(anthropicMessage.content) ? anthropicMessage.content : [];
	let textContent = "";
	const toolCalls: ToolCall[] = [];
	let thinking = "";
	let thinkingSignature = "";

	for (const block of contentBlocks) {
		switch (block.type) {
			case "text":
				if ("text" in block && block.text) {
					textContent += block.text;
				}
				break;

			case "thinking":
				if ("thinking" in block && block.thinking) {
					thinking += block.thinking;
				}
				if ("signature" in block && block.signature) {
					thinkingSignature += block.signature;
				}
				break;

			case "tool_use":
				if ("id" in block && "name" in block && block.id && block.name) {
					toolCalls.push({
						id: block.id,
						name: block.name,
						arguments: "input" in block && block.input ? (block.input as Record<string, unknown>) : {},
					});
				}
				break;
		}
	}

	// Set the converted content
	if (textContent) assistantMessage.content = textContent;
	if (toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;
	if (thinking) assistantMessage.thinking = thinking;
	if (thinkingSignature) assistantMessage.thinkingSignature = thinkingSignature;

	return assistantMessage;
}
