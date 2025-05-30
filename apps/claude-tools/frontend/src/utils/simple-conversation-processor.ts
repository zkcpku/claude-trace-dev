import type {
	Message,
	MessageParam,
	TextBlockParam,
	ToolUnion,
	ToolResultBlockParam,
	ToolUseBlock,
	ContentBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { ProcessedPair } from "./data";

// Extended message type with tool result pairing
export interface EnhancedMessageParam extends MessageParam {
	toolResults?: Record<string, ToolResultBlockParam>;
	hide?: boolean;
}

export interface SimpleConversation {
	id: string;
	models: Set<string>;
	system?: string | TextBlockParam[];
	messages: EnhancedMessageParam[];
	response: Message;
	allPairs: ProcessedPair[];
	finalPair: ProcessedPair;
	metadata: {
		startTime: string;
		endTime: string;
		totalPairs: number;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
}

export class SimpleConversationProcessor {
	mergeConversations(pairs: ProcessedPair[]): SimpleConversation[] {
		if (!pairs || pairs.length === 0) return [];

		// Group by system prompt + first user message
		const conversationGroups = new Map<string, ProcessedPair[]>();

		for (const pair of pairs) {
			const messages = pair.request.messages || [];
			if (messages.length === 0) continue;

			const system = pair.request.system;
			const firstUserMessage = messages[0];
			const groupKey = this.createGroupKey(system, firstUserMessage);

			if (!conversationGroups.has(groupKey)) {
				conversationGroups.set(groupKey, []);
			}
			conversationGroups.get(groupKey)!.push(pair);
		}

		const conversations: SimpleConversation[] = [];

		// For each group, pick the pair with the longest messages array
		for (const [groupKey, groupPairs] of conversationGroups) {
			// Sort by timestamp
			const sortedPairs = [...groupPairs].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			// Find the pair with the most messages (most complete conversation)
			const finalPair = sortedPairs.reduce((longest, current) => {
				const currentMessageCount = current.request.messages?.length || 0;
				const longestMessageCount = longest.request.messages?.length || 0;
				return currentMessageCount > longestMessageCount ? current : longest;
			});

			// Collect all models used in this conversation
			const modelsUsed = new Set(sortedPairs.map((pair) => pair.model));

			// Process messages to pair tool_use with tool_result
			const enhancedMessages = this.processToolResults(finalPair.request.messages || []);

			// Create conversation
			const conversation: SimpleConversation = {
				id: this.hashString(groupKey),
				models: modelsUsed,
				system: finalPair.request.system,
				messages: enhancedMessages,
				response: finalPair.response,
				allPairs: sortedPairs,
				finalPair: finalPair,
				metadata: {
					startTime: sortedPairs[0].timestamp,
					endTime: finalPair.timestamp,
					totalPairs: sortedPairs.length,
					inputTokens: finalPair.response.usage?.input_tokens || 0,
					outputTokens: finalPair.response.usage?.output_tokens || 0,
					totalTokens:
						(finalPair.response.usage?.input_tokens || 0) + (finalPair.response.usage?.output_tokens || 0),
				},
			};

			conversations.push(conversation);
		}

		// Sort by start time
		return conversations.sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);
	}

	private createGroupKey(system: string | TextBlockParam[] | undefined, firstUserMessage: MessageParam): string {
		return JSON.stringify({
			system: system,
			firstMessage: firstUserMessage,
		});
	}

	private processToolResults(messages: MessageParam[]): EnhancedMessageParam[] {
		const enhancedMessages: EnhancedMessageParam[] = [];
		const pendingToolUses: Record<string, { messageIndex: number; toolIndex: number }> = {};

		for (let i = 0; i < messages.length; i++) {
			const message = messages[i];
			const enhancedMessage: EnhancedMessageParam = { ...message, toolResults: {}, hide: false };

			// Process message content
			if (Array.isArray(message.content)) {
				let hasOnlyToolResults = true;
				let hasTextContent = false;

				for (let j = 0; j < message.content.length; j++) {
					const block = message.content[j];

					if (block.type === "tool_use" && "id" in block) {
						// Track tool_use for later pairing
						const toolUse = block as ToolUseBlock;
						pendingToolUses[toolUse.id] = { messageIndex: i, toolIndex: j };
						hasOnlyToolResults = false;
					} else if (block.type === "tool_result" && "tool_use_id" in block) {
						// Find corresponding tool_use and attach result
						const toolResult = block as ToolResultBlockParam;
						const toolUseId = toolResult.tool_use_id;

						if (pendingToolUses[toolUseId]) {
							const { messageIndex } = pendingToolUses[toolUseId];
							if (!enhancedMessages[messageIndex]) {
								enhancedMessages[messageIndex] = { ...messages[messageIndex], toolResults: {}, hide: false };
							}
							enhancedMessages[messageIndex].toolResults![toolUseId] = toolResult;
							delete pendingToolUses[toolUseId];
						}
					} else if (block.type === "text") {
						hasTextContent = true;
						hasOnlyToolResults = false;
					} else {
						hasOnlyToolResults = false;
					}
				}

				// Hide messages that contain only tool_result blocks
				if (hasOnlyToolResults && !hasTextContent) {
					enhancedMessage.hide = true;
				}
			}

			enhancedMessages[i] = enhancedMessage;
		}

		return enhancedMessages;
	}

	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString();
	}
}
