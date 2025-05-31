import type {
	Message,
	MessageParam,
	TextBlockParam,
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
	compacted?: boolean; // Flag to indicate this conversation was created by merging compact conversations
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

		// Process all pairs including haiku models
		console.log(`Processing ${pairs.length} pairs`);

		// First, group pairs by system instructions + model (like old implementation)
		const pairsBySystem = new Map<string, ProcessedPair[]>();

		for (const pair of pairs) {
			const system = pair.request.system;
			const model = pair.model;

			// Create a key based on system instructions + model
			const systemKey = JSON.stringify({ system, model });

			if (!pairsBySystem.has(systemKey)) {
				pairsBySystem.set(systemKey, []);
			}
			pairsBySystem.get(systemKey)!.push(pair);
		}

		const allConversations: SimpleConversation[] = [];

		// Process each system group separately
		for (const [, systemPairs] of pairsBySystem) {
			// Sort pairs by timestamp within system group
			const sortedPairs = [...systemPairs].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			// Group pairs by conversation thread based on message history
			const conversationThreads = new Map<string, ProcessedPair[]>();

			for (const pair of sortedPairs) {
				const messages = pair.request.messages || [];
				if (messages.length === 0) continue;

				// Use first user message as conversation identifier (normalize it)
				const firstUserMessage = messages[0];
				const normalizedFirstMessage = this.normalizeMessageForGrouping(firstUserMessage);
				const conversationKey = JSON.stringify({
					firstMessage: normalizedFirstMessage,
				});

				const keyHash = this.hashString(conversationKey);

				if (!conversationThreads.has(keyHash)) {
					conversationThreads.set(keyHash, []);
				}
				conversationThreads.get(keyHash)!.push(pair);
			}

			// For each conversation thread, only keep the final pair (longest message history)
			for (const [conversationKey, threadPairs] of conversationThreads) {
				// Sort threadPairs by timestamp to get proper chronological order
				const sortedThreadPairs = [...threadPairs].sort(
					(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
				);

				// Find the pair with the longest message history (most complete conversation)
				const finalPair = sortedThreadPairs.reduce((longest, current) => {
					const currentMessages = current.request.messages || [];
					const longestMessages = longest.request.messages || [];
					return currentMessages.length > longestMessages.length ? current : longest;
				});

				// Collect all models used in this conversation thread
				const modelsUsed = new Set(sortedThreadPairs.map((pair) => pair.model));

				// Process messages to pair tool_use with tool_result
				const enhancedMessages = this.processToolResults(finalPair.request.messages || []);

				// Create conversation from the final pair
				const conversation: SimpleConversation = {
					id: this.hashString(conversationKey),
					models: modelsUsed,
					system: finalPair.request.system,
					messages: enhancedMessages,
					response: finalPair.response,
					allPairs: sortedThreadPairs,
					finalPair: finalPair,
					metadata: {
						startTime: sortedThreadPairs[0].timestamp,
						endTime: finalPair.timestamp,
						totalPairs: sortedThreadPairs.length,
						inputTokens: finalPair.response.usage?.input_tokens || 0,
						outputTokens: finalPair.response.usage?.output_tokens || 0,
						totalTokens:
							(finalPair.response.usage?.input_tokens || 0) + (finalPair.response.usage?.output_tokens || 0),
					},
				};

				allConversations.push(conversation);
			}
		}

		console.log(`Before compact detection: ${allConversations.length} conversations`);

		// Apply compact conversation detection and merging (from old implementation)
		const mergedConversations = this.detectAndMergeCompactConversations(allConversations);

		console.log(`After compact detection: ${mergedConversations.length} conversations`);
		mergedConversations.forEach((conv, i) => {
			console.log(`Conversation ${i}: compacted=${conv.compacted}, pairs=${conv.allPairs.length}`);
		});

		// Sort by start time
		return mergedConversations.sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);
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

	/**
	 * Detect and merge compact conversations (from old implementation)
	 *
	 * A "compact conversation" is one where Claude has condensed a longer conversation
	 * into a single API call with more messages. This function finds such conversations
	 * and merges them with their "original" counterparts.
	 *
	 * Updated: Now compares against ALL conversations since compacted conversations
	 * may have different system prompts than their originals.
	 */
	private detectAndMergeCompactConversations(conversations: SimpleConversation[]): SimpleConversation[] {
		if (conversations.length <= 1) return conversations;

		// Sort all conversations by start time to process in chronological order
		const sortedConversations = [...conversations].sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);

		console.log(`Sorted conversations by timestamp:`);
		sortedConversations.forEach((conv, i) => {
			console.log(
				`  ${i}: ${conv.allPairs.length} pairs, ${conv.messages.length} messages, start: ${conv.metadata.startTime}`,
			);
		});

		const usedConversations = new Set<number>();
		const mergedConversations: SimpleConversation[] = [];

		// Look for compact conversations (1 pair, many messages)
		for (let i = 0; i < sortedConversations.length; i++) {
			const currentConv = sortedConversations[i];

			if (usedConversations.has(i)) continue;

			console.log(
				`Examining conversation ${i}: ${currentConv.allPairs.length} pairs, ${currentConv.messages.length} messages`,
			);

			// Check if this is a compact conversation (1 pair with many messages)
			if (currentConv.allPairs.length === 1) {
				console.log(
					`Found potential compact conversation ${i}: ${currentConv.allPairs.length} pairs, ${currentConv.messages.length} messages`,
				);

				// Look for the original conversation across ALL conversations (not just same system group)
				let originalConv: SimpleConversation | null = null;
				let originalIndex = -1;

				for (let j = 0; j < sortedConversations.length; j++) {
					if (j === i || usedConversations.has(j)) continue;

					const otherConv = sortedConversations[j];

					console.log(
						`  Comparing with conversation ${j}: ${otherConv.allPairs.length} pairs, ${otherConv.messages.length} messages`,
					);

					// Check if other conversation has exactly 2 fewer messages
					if (otherConv.messages.length === currentConv.messages.length - 2) {
						console.log(
							`  ✓ Message count match: ${otherConv.messages.length} vs ${currentConv.messages.length} (diff=2)`,
						);

						// Check if all messages in otherConv (except first) match messages in currentConv (except first)
						// Skip first message in both conversations when comparing
						let messagesMatch = true;
						console.log(`  Comparing messages 1-${otherConv.messages.length - 1}:`);
						for (let k = 1; k < otherConv.messages.length; k++) {
							const match = this.messagesRoughlyEqual(otherConv.messages[k], currentConv.messages[k]);
							console.log(
								`    Message ${k}: ${match ? "✓" : "✗"} (roles: ${otherConv.messages[k]?.role} vs ${currentConv.messages[k]?.role})`,
							);
							if (!match) {
								messagesMatch = false;
								break;
							}
						}

						if (messagesMatch) {
							console.log(`  ✓ Found matching original conversation ${j}: messages match after first`);
							originalConv = otherConv;
							originalIndex = j;
							break;
						} else {
							console.log(`  ✗ Messages don't match after first`);
						}
					} else {
						console.log(
							`  ✗ Message count mismatch: ${otherConv.messages.length} vs ${currentConv.messages.length} (need diff=2)`,
						);
					}
				}

				if (originalConv) {
					console.log(`✓ Merging compact conversation ${i} with original conversation ${originalIndex}`);
					const mergedConv = this.mergeCompactConversation(originalConv, currentConv);
					mergedConversations.push(mergedConv);
					usedConversations.add(i);
					usedConversations.add(originalIndex);
				} else {
					console.log(`✗ No matching original conversation found for compact conversation ${i}`);
					// Still mark as compacted since it has the compact pattern (1 pair, many messages)
					currentConv.compacted = true;
					mergedConversations.push(currentConv);
					usedConversations.add(i);
				}
			} else {
				console.log(`Conversation ${i} is not compact (has ${currentConv.allPairs.length} pairs), adding directly`);
				mergedConversations.push(currentConv);
				usedConversations.add(i);
			}
		}

		// Add remaining conversations that weren't part of compact patterns
		for (let i = 0; i < sortedConversations.length; i++) {
			if (!usedConversations.has(i)) {
				console.log(
					`Adding non-compact conversation ${i}: ${sortedConversations[i].allPairs.length} pairs, ${sortedConversations[i].messages.length} messages`,
				);
				mergedConversations.push(sortedConversations[i]);
			}
		}

		// Sort final merged conversations by startTime to ensure chronological order
		return mergedConversations.sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);
	}

	/**
	 * Merge a compact conversation with its original counterpart
	 */
	private mergeCompactConversation(
		originalConv: SimpleConversation,
		compactConv: SimpleConversation,
	): SimpleConversation {
		const originalMessages = originalConv.messages || [];
		const compactMessages = compactConv.messages || [];

		console.log(
			`Merging: original has ${originalMessages.length} messages, compact has ${compactMessages.length} messages`,
		);

		// The compact conversation contains the full merged result, but its first user message
		// is truncated/summarized. We need to replace it with the original first message.
		const mergedMessages = [...compactMessages];
		if (originalMessages.length > 0 && mergedMessages.length > 0) {
			mergedMessages[0] = originalMessages[0]; // Replace first message with original
			console.log(`Replaced first message from original conversation`);
		}

		// Combine and sort all pairs by timestamp
		const allPairs = [...originalConv.allPairs, ...compactConv.allPairs].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);

		// Collect all models used
		const allModels = new Set([...originalConv.models, ...compactConv.models]);

		// Calculate proper start and end times from all pairs
		const startTime = allPairs[0].timestamp;
		const endTime = allPairs[allPairs.length - 1].timestamp;

		const mergedConv: SimpleConversation = {
			id: compactConv.id, // Use compact conversation's ID
			models: allModels,
			system: originalConv.system, // Use original system message
			messages: mergedMessages,
			response: compactConv.response, // Use compact conversation's response
			allPairs: allPairs,
			finalPair: compactConv.finalPair, // Use compact conversation's final pair
			compacted: true, // Mark as compacted conversation
			metadata: {
				startTime: startTime,
				endTime: endTime,
				totalPairs: allPairs.length,
				inputTokens: (originalConv.metadata.inputTokens || 0) + (compactConv.metadata.inputTokens || 0),
				outputTokens: (originalConv.metadata.outputTokens || 0) + (compactConv.metadata.outputTokens || 0),
				totalTokens: (originalConv.metadata.totalTokens || 0) + (compactConv.metadata.totalTokens || 0),
			},
		};

		console.log(`Merged result: ${mergedConv.messages.length} messages, ${mergedConv.allPairs.length} pairs`);
		return mergedConv;
	}

	/**
	 * Compare two messages to see if they're roughly equal
	 * Used for compact conversation detection
	 */
	private messagesRoughlyEqual(msg1: MessageParam, msg2: MessageParam): boolean {
		if (msg1.role !== msg2.role) return false;

		// Simple content comparison - just check if both are strings or both are arrays
		const content1 = msg1.content;
		const content2 = msg2.content;

		if (typeof content1 !== typeof content2) return false;
		if (Array.isArray(content1) !== Array.isArray(content2)) return false;

		// For now, just assume they match if roles and content types are the same
		// Could add more sophisticated comparison later
		return true;
	}

	/**
	 * Normalize message for grouping (from old implementation)
	 * Removes dynamic content that might vary between calls
	 */
	private normalizeMessageForGrouping(message: MessageParam): MessageParam {
		if (!message || !message.content) return message;

		let normalizedContent: string | ContentBlockParam[];

		if (Array.isArray(message.content)) {
			normalizedContent = message.content.map((block) => {
				if (block.type === "text" && "text" in block) {
					let text = block.text;
					// Remove dynamic content that might vary between calls
					text = text.replace(/Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, "Generated [TIMESTAMP]");
					text = text.replace(/The user opened the file [^\s]+ in the IDE\./g, "The user opened file in IDE.");
					text = text.replace(/<system-reminder>.*?<\/system-reminder>/gs, "[SYSTEM-REMINDER]");
					return { type: "text", text: text };
				}
				return block;
			});
		} else {
			normalizedContent = message.content;
		}

		return {
			role: message.role,
			content: normalizedContent,
		};
	}
}
