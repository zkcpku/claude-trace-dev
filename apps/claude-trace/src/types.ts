// Types matching the frontend expectations for compatibility

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
	} | null; // null for orphaned requests
	logged_at: string;
	note?: string; // For orphaned requests
}

export interface SSEEvent {
	event: string;
	data: any;
	timestamp: string;
}

export interface ClaudeData {
	rawPairs: RawPair[];
	timestamp?: string;
	metadata?: Record<string, any>;
}

// Internal types for HTML generation
export interface HTMLGenerationData {
	rawPairs: RawPair[];
	timestamp: string;
	title?: string;
}

export interface TemplateReplacements {
	__CLAUDE_LOGGER_BUNDLE_REPLACEMENT_UNIQUE_9487__: string;
	__CLAUDE_LOGGER_DATA_REPLACEMENT_UNIQUE_9487__: string;
	__CLAUDE_LOGGER_TITLE_REPLACEMENT_UNIQUE_9487__: string;
}
