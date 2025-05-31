export interface ClaudeData {
	rawPairs: RawPair[];
	timestamp?: string;
	metadata?: Record<string, any>;
}

export interface RawPair {
	request: {
		timestamp: number;
		method: string;
		url: string;
		headers: Record<string, string>;
		body: any;
	};
	response: {
		timestamp: number;
		status_code: number;
		headers: Record<string, string>;
		body?: any;
		body_raw?: string;
		events?: SSEEvent[];
	};
	logged_at: string;
}

export interface SSEEvent {
	event: string;
	data: any;
	timestamp: string;
}

export interface ProcessedConversation {
	id: string;
	model: string;
	messages: any[]; // Original message format from API
	system?: any; // System prompt
	latestResponse?: string; // Latest assistant response
	pairs: RawPair[]; // All pairs in this conversation
	metadata: {
		startTime: string;
		endTime: string;
		totalPairs: number;
		totalTokens?: number;
		tokenUsage?: {
			input: number;
			output: number;
		};
	};
	rawPairs: RawPair[]; // Keep for compatibility
}

export interface ProcessedMessage {
	role: "user" | "assistant" | "system";
	content: string;
	thinking?: string;
	toolCalls?: ToolCall[];
	metadata?: {
		timestamp: string;
		model?: string;
	};
}

export interface ToolCall {
	id: string;
	type: string;
	name: string;
	input: any;
	result?: any;
	error?: string;
}

declare global {
	interface Window {
		claudeData: ClaudeData;
	}
}
