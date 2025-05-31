import { RawPair, ProcessedConversation, ProcessedMessage, ToolCall } from "../types/claude-data";

export class ConversationProcessor {
	mergeConversations(pairs: RawPair[]): ProcessedConversation[] {
		if (!pairs || pairs.length === 0) return [];

		// First, group pairs by system instructions + model
		const pairsBySystem = new Map<string, RawPair[]>();
		for (const pair of pairs) {
			const requestBody = pair.request.body || {};
			const model = requestBody.model || "unknown";
			const system = requestBody.system;

			// Create a key based on system instructions + model
			const systemKey = JSON.stringify({ system, model });

			if (!pairsBySystem.has(systemKey)) {
				pairsBySystem.set(systemKey, []);
			}
			pairsBySystem.get(systemKey)!.push(pair);
		}

		const allConversations: ProcessedConversation[] = [];

		// Process each system group separately
		for (const [systemKey, systemPairs] of pairsBySystem) {
			const firstPair = systemPairs[0];
			const model = firstPair.request.body?.model || "unknown";

			// Sort pairs by timestamp within system group
			const sortedPairs = [...systemPairs].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			// Group pairs by conversation thread based on message history
			const conversationThreads = new Map<string, RawPair[]>();

			for (const pair of sortedPairs) {
				const requestBody = pair.request.body || {};
				const messages = requestBody.messages || [];

				if (messages.length === 0) continue;

				// Use first user message as conversation identifier
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
			const conversationList: ProcessedConversation[] = [];
			for (const [conversationKey, threadPairs] of conversationThreads) {
				// Sort threadPairs by timestamp to get proper chronological order
				const sortedThreadPairs = [...threadPairs].sort(
					(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
				);

				// Find the pair with the longest message history (most complete conversation)
				const finalPair = sortedThreadPairs.reduce((longest, current) => {
					const currentMessages = current.request.body?.messages || [];
					const longestMessages = longest.request.body?.messages || [];
					return currentMessages.length > longestMessages.length ? current : longest;
				});

				// Create conversation from the final pair
				const requestBody = finalPair.request.body || {};
				const messages = requestBody.messages || [];
				const system = requestBody.system;

				// Calculate proper start and end times
				const startTime = sortedThreadPairs[0].timestamp;
				const endTime = finalPair.timestamp;

				const processedMessages = this.processMessages(messages, finalPair);

				const conversation: ProcessedConversation = {
					id: conversationKey,
					model: model,
					messages: messages, // Use original messages, not processed ones
					system: system,
					latestResponse: this.extractResponseContent(finalPair.response),
					pairs: sortedThreadPairs,
					metadata: {
						startTime: startTime,
						endTime: endTime,
						totalPairs: sortedThreadPairs.length,
						totalTokens: this.extractTotalTokens(finalPair.response),
						tokenUsage: this.extractTokenUsage(finalPair),
					},
					rawPairs: sortedThreadPairs,
				};

				conversationList.push(conversation);
			}

			// Add conversations to the global list
			allConversations.push(...conversationList);
		}

		return allConversations;
	}

	private processMessages(messages: any[], finalPair: RawPair): ProcessedMessage[] {
		const processedMessages: ProcessedMessage[] = [];

		// Process request messages
		for (const message of messages) {
			processedMessages.push({
				role: message.role,
				content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
				metadata: {
					timestamp: finalPair.timestamp,
				},
			});
		}

		// Process response if available
		const responseContent = this.extractResponseContent(finalPair.response);
		if (responseContent) {
			const thinking = this.extractThinkingFromSSE(finalPair.response);
			const toolCalls = this.extractToolCallsFromSSE(finalPair.response);

			processedMessages.push({
				role: "assistant",
				content: responseContent,
				thinking: thinking,
				toolCalls: toolCalls,
				metadata: {
					timestamp: finalPair.timestamp,
					model: finalPair.request.body?.model,
				},
			});
		}

		return processedMessages;
	}

	private extractResponseContent(response: any): string {
		if (!response || !response.body) return "";

		// Handle different response formats
		if (typeof response.body === "string") {
			try {
				const parsed = JSON.parse(response.body);
				return parsed.content?.[0]?.text || "";
			} catch {
				return response.body;
			}
		}

		if (response.body.content && Array.isArray(response.body.content)) {
			return response.body.content
				.filter((item: any) => item.type === "text")
				.map((item: any) => item.text)
				.join("");
		}

		return "";
	}

	private extractThinkingFromSSE(response: any): string | undefined {
		if (!response.events) return undefined;

		const thinkingParts: string[] = [];
		for (const event of response.events) {
			if (event.event === "content_block_delta" && event.data?.delta?.type === "text_delta") {
				if (event.data.delta.text && event.data.delta.text.includes("<thinking>")) {
					// Extract thinking content - this is a simplified version
					const thinkingMatch = event.data.delta.text.match(/<thinking>(.*?)<\/antml:thinking>/s);
					if (thinkingMatch) {
						thinkingParts.push(thinkingMatch[1]);
					}
				}
			}
		}

		return thinkingParts.length > 0 ? thinkingParts.join("") : undefined;
	}

	private extractToolCallsFromSSE(response: any): ToolCall[] | undefined {
		if (!response.events) return undefined;

		const toolCalls: ToolCall[] = [];
		// This is a simplified implementation - you'd need to parse the SSE events properly
		// for tool calls based on the actual format in your data

		return toolCalls.length > 0 ? toolCalls : undefined;
	}

	private extractTokenUsage(pair: RawPair) {
		const response = pair.response.body;
		if (response && response.usage) {
			return {
				input: response.usage.input_tokens || 0,
				output: response.usage.output_tokens || 0,
			};
		}
		return undefined;
	}

	private extractTotalTokens(response: any): number {
		if (response && response.usage) {
			return (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);
		}
		return 0;
	}

	private normalizeMessageForGrouping(message: any): any {
		// Create a normalized version of the message for grouping
		return {
			role: message.role,
			content: message.content,
			// Remove any timestamp or id fields that might vary between calls
		};
	}

	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString();
	}
}
