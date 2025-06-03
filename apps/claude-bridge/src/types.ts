import type { SerializedContext } from "@mariozechner/lemmy";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/messages.js";

// Basic types for claude-bridge

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
	} | null;
	logged_at: string;
	note?: string;
}

export interface BridgeConfig {
	provider: string;
	model: string;
	apiKey?: string | undefined;
	logDirectory?: string | undefined;
	logLevel?: "debug" | "info" | "warn" | "error" | undefined;
}

export interface TransformationEntry {
	timestamp: number;
	request_id: string;
	raw_request: MessageCreateParamsBase;
	lemmy_context: SerializedContext;
	bridge_config: {
		provider: string;
		model: string;
	};
	raw_response?: {
		status_code: number;
		headers: Record<string, string>;
		body?: any;
		body_raw?: string;
	};
	decoded_sse?: any[] | undefined;
	logged_at: string;
}
