import type { Message } from "@mariozechner/lemmy";

export interface SSEEvent {
	type: string;
	data: unknown;
}

/**
 * Parse Server-Sent Events (SSE) from raw text data
 */
export function parseSSE(sseData: string): any[] {
	const events: any[] = [];
	const lines = sseData.split("\n");
	let currentEvent: any = {};

	for (const line of lines) {
		if (line.startsWith("data:")) {
			try {
				currentEvent = JSON.parse(line.substring(5).trim());
			} catch {
				currentEvent.data = line.substring(5).trim();
			}
		} else if (line.trim() === "" && Object.keys(currentEvent).length > 0) {
			events.push({ ...currentEvent });
			currentEvent = {};
		}
	}

	if (Object.keys(currentEvent).length > 0) events.push(currentEvent);
	return events;
}

/**
 * Extract assistant message from parsed SSE events
 */
export function extractAssistantFromSSE(events: any[], logger?: { error: (msg: string) => void }): Message | null {
	try {
		let content = "",
			thinking = "";
		const toolCalls: any[] = [];
		let errorMessage = "";

		for (const event of events) {
			if (event.type === "error") {
				// Handle error events - extract the error message
				errorMessage = event.error?.message || JSON.stringify(event.error) || "Unknown error";
			} else if (event.type === "content_block_delta") {
				if (event.delta?.type === "text_delta") content += event.delta.text || "";
				if (event.delta?.type === "thinking_delta") thinking += event.delta.thinking || "";
			} else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
				toolCalls.push({ id: event.content_block.id, name: event.content_block.name, arguments: {} });
			} else if (
				event.type === "content_block_delta" &&
				event.delta?.type === "input_json_delta" &&
				toolCalls.length > 0
			) {
				const lastTool = toolCalls[toolCalls.length - 1];
				lastTool.argumentsJson = (lastTool.argumentsJson || "") + (event.delta.partial_json || "");
			}
		}

		// Parse tool arguments
		for (const tool of toolCalls) {
			if (tool.argumentsJson) {
				try {
					tool.arguments = JSON.parse(tool.argumentsJson);
					delete tool.argumentsJson;
				} catch {
					tool.arguments = tool.argumentsJson;
					delete tool.argumentsJson;
				}
			}
		}

		const message: any = { role: "assistant" };
		if (thinking) message.thinking = thinking;
		if (content) message.content = content;
		if (toolCalls.length > 0) message.toolCalls = toolCalls;
		if (errorMessage) message.content = `Error: ${errorMessage}`;

		return Object.keys(message).length > 1 ? message : null;
	} catch (error) {
		logger?.error(`Failed to extract assistant response: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
