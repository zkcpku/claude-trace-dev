import type { SerializedContext, ChatClient } from "@mariozechner/lemmy";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { AnthropicConfig, OpenAIConfig, GoogleConfig } from "@mariozechner/lemmy";
import type { ModelData } from "@mariozechner/lemmy";

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

export type Provider = "anthropic" | "openai" | "google";

export interface BridgeConfig {
	provider: Provider;
	model: string;
	apiKey?: string | undefined;
	baseURL?: string | undefined;
	maxRetries?: number | undefined;
	logDirectory?: string | undefined;
	logLevel?: "debug" | "info" | "warn" | "error" | undefined;
}

export interface CapabilityValidationResult {
	valid: boolean;
	warnings: string[];
	adjustments: {
		maxOutputTokens?: number;
		thinkingEnabled?: boolean;
		toolsDisabled?: boolean;
		imagesIgnored?: boolean;
	};
}

export interface ProviderClientInfo {
	client: ChatClient;
	provider: Provider;
	model: string;
	modelData: ModelData;
}

export type ProviderConfig = AnthropicConfig | OpenAIConfig | GoogleConfig;

export interface TransformationEntry {
	timestamp: number;
	request_id: string;
	raw_request: MessageCreateParamsBase;
	lemmy_context: SerializedContext;
	bridge_config: {
		provider: Provider;
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
