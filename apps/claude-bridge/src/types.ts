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
