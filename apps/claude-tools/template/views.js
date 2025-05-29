// Claude API Traffic Viewer - View Rendering Logic

class ClaudeViewRenderer {
	constructor(viewer) {
		this.viewer = viewer;
	}

	renderConversations() {
		const container = document.querySelector(".conversations-container");
		if (!container) return;

		if (this.viewer.conversations.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No conversations found</div>';
			return;
		}

		const html = this.viewer.conversations
			.map((conv, idx) => {
				return this.renderConversation(conv, idx);
			})
			.join("");

		container.innerHTML = html;
	}

	renderFilteredConversations() {
		const container = document.querySelector(".conversations-container");
		if (!container) return;

		if (!this.viewer.filteredConversations || this.viewer.filteredConversations.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No conversations found with selected models</div>';
			return;
		}

		const html = this.viewer.filteredConversations
			.map((conv, idx) => {
				return this.renderConversation(conv, idx);
			})
			.join("");

		container.innerHTML = html;
	}

	renderConversation(conversation, index) {
		const { model, messages, latestResponse, metadata } = conversation;

		return `
            <div class="conversation">
                <div class="conversation-header">
                    <div class="conversation-title">
                        Conversation #${index + 1} - ${this.escapeHtml(model)}
                    </div>
                    <div class="conversation-meta">
                        <span>${messages.length} messages</span>
                        <span>${this.formatTokenUsage(metadata.usage)}</span>
                        <span>${new Date(metadata.startTime).toLocaleString()}</span>
                    </div>
                </div>
                <div class="conversation-body">
                    ${conversation.system ? this.renderSystemMessage(conversation.system) : ""}
                    ${this.renderMessages(messages)}
                    ${this.renderLatestResponse(latestResponse)}
                </div>
            </div>
        `;
	}

	formatTokenUsage(usage) {
		if (!usage) return "";

		const parts = [];
		if (usage.input_tokens) parts.push(`In: ${usage.input_tokens}`);
		if (usage.output_tokens) parts.push(`Out: ${usage.output_tokens}`);
		if (usage.cache_read_input_tokens) parts.push(`Cache Read: ${usage.cache_read_input_tokens}`);
		if (usage.cache_creation_input_tokens) parts.push(`Cache Created: ${usage.cache_creation_input_tokens}`);

		const total = (usage.input_tokens || 0) + (usage.output_tokens || 0);
		return parts.length > 0 ? `${total} tokens (${parts.join(", ")})` : "";
	}

	renderSystemMessage(system) {
		let content = typeof system === "string" ? system : JSON.stringify(system);

		// Truncate long system messages to first 200 characters
		if (content.length > 200) {
			content = content.substring(0, 200) + "...";
		}

		return `
            <div class="message system">
                <div class="message-role">System</div>
                <div class="message-content">${this.escapeHtml(content).replace(/\n/g, "<br>")}</div>
            </div>
        `;
	}

	renderMessages(messages) {
		return messages
			.map((msg) => {
				const role = msg.role;
				const content = this.formatMessageContent(msg.content);

				return `
                <div class="message ${role}">
                    <div class="message-role">${role}</div>
                    <div class="message-content">${content}</div>
                </div>
            `;
			})
			.join("");
	}

	renderLatestResponse(response) {
		if (!response) return "";

		const content = this.formatResponseContent(response);
		const usage = response.usage;

		return `
            <div class="message assistant latest-response">
                <div class="message-role">Assistant (Latest)</div>
                <div class="message-content">
                    ${content}
                    ${usage ? this.renderUsageInfo(usage) : ""}
                </div>
            </div>
        `;
	}

	formatMessageContent(content) {
		if (typeof content === "string") {
			let text = content;
			if (text.length > 200) {
				text = text.substring(0, 200) + "...";
			}
			return this.escapeHtml(text).replace(/\n/g, "<br>");
		}

		if (Array.isArray(content)) {
			return content.map((block) => this.formatContentBlock(block)).join("");
		}

		return '<pre class="font-mono text-sm">' + this.escapeHtml(JSON.stringify(content, null, 2)) + "</pre>";
	}

	formatContentBlock(block) {
		const type = block.type;

		switch (type) {
			case "text":
				let text = block.text || "";
				if (text.length > 200) {
					text = text.substring(0, 200) + "...";
				}
				return `<div class="content-block text">${this.escapeHtml(text).replace(/\n/g, "<br>")}</div>`;

			case "thinking":
				return `
                    <div class="content-block thinking">
                        <div class="content-block-type">Thinking</div>
                        ${this.escapeHtml(block.thinking).replace(/\n/g, "<br>")}
                    </div>
                `;

			case "tool_use":
				return `
                    <div class="content-block tool-use">
                        <div class="content-block-type">Tool Use</div>
                        <div class="tool-info">
                            <span class="tool-name">${this.escapeHtml(block.name)}</span>
                            <span class="text-muted">(${this.escapeHtml(block.id)})</span>
                        </div>
                        <div class="tool-input">${this.escapeHtml(JSON.stringify(block.input, null, 2))}</div>
                    </div>
                `;

			case "tool_result":
				return `
                    <div class="content-block tool-result">
                        <div class="content-block-type">Tool Result</div>
                        <div class="tool-info">
                            Tool ID: <span class="font-mono text-sm">${this.escapeHtml(block.tool_use_id)}</span>
                            ${block.is_error ? ' <span style="color: #dc2626;">(Error)</span>' : ""}
                        </div>
                        <div class="tool-input">${this.formatToolResult(block.content)}</div>
                    </div>
                `;

			default:
				return `
                    <div class="content-block">
                        <div class="content-block-type">${this.escapeHtml(type)}</div>
                        <pre class="font-mono text-sm">${this.escapeHtml(JSON.stringify(block, null, 2))}</pre>
                    </div>
                `;
		}
	}

	formatResponseContent(response) {
		if (!response || !response.content) return "";

		return response.content.map((block) => this.formatContentBlock(block)).join("");
	}

	formatToolResult(content) {
		if (typeof content === "string") {
			return this.escapeHtml(content);
		}
		return this.escapeHtml(JSON.stringify(content, null, 2));
	}

	renderUsageInfo(usage) {
		const parts = [];
		if (usage.input_tokens) parts.push(`Input: ${usage.input_tokens}`);
		if (usage.output_tokens) parts.push(`Output: ${usage.output_tokens}`);
		if (usage.cache_read_input_tokens) parts.push(`Cache Read: ${usage.cache_read_input_tokens}`);
		if (usage.cache_creation_input_tokens) parts.push(`Cache Created: ${usage.cache_creation_input_tokens}`);

		return `<div class="usage-info">🔢 Tokens: ${parts.join(", ")}</div>`;
	}

	renderRawPairs() {
		const container = document.querySelector(".raw-container");
		if (!container) return;

		if (!this.viewer.data.rawPairs || this.viewer.data.rawPairs.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No raw pairs found</div>';
			return;
		}

		const html = this.viewer.data.rawPairs
			.map((pair, idx) => {
				return this.renderRawPair(pair, idx);
			})
			.join("");

		container.innerHTML = html;
	}

	renderRawPair(pair, index) {
		const { request, response } = pair;

		return `
            <div class="raw-pair">
                <div class="raw-pair-header">
                    Pair #${index + 1} - ${request.method} ${new URL(request.url).pathname} - ${response.status_code}
                </div>
                <div class="raw-content">
                    <div style="margin-bottom: 1rem;">
                        <strong>Request:</strong>
                        <div class="raw-json">${this.formatJson(request)}</div>
                    </div>
                    <div>
                        <strong>Response:</strong>
                        <div class="raw-json">${this.formatJson(response)}</div>
                        ${this.renderSSEStructure(response)}
                    </div>
                </div>
            </div>
        `;
	}

	renderSSEStructure(response) {
		// Check if this response has SSE data
		const bodyRaw = response.body_raw;
		if (!bodyRaw || !bodyRaw.includes("event:") || !bodyRaw.includes("data:")) {
			return "";
		}

		// Parse SSE into structured events
		const events = this.parseSSEToEvents(bodyRaw);
		if (events.length === 0) return "";

		return `
			<div style="margin-top: 1rem;">
				<strong>SSE Event Structure:</strong>
				<div class="sse-structure">${this.formatSSEEvents(events)}</div>
			</div>
		`;
	}

	parseSSEToEvents(sseData) {
		const events = [];
		const lines = sseData.trim().split("\n");
		let currentEvent = {};

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				if (Object.keys(currentEvent).length > 0) {
					events.push(currentEvent);
					currentEvent = {};
				}
				continue;
			}

			if (trimmed.startsWith("event: ")) {
				currentEvent.event = trimmed.substring(7);
			} else if (trimmed.startsWith("data: ")) {
				const dataStr = trimmed.substring(6);
				currentEvent.data_raw = dataStr;
				if (dataStr !== "[DONE]") {
					try {
						currentEvent.data_parsed = JSON.parse(dataStr);
					} catch {
						currentEvent.data_parsed = dataStr;
					}
				}
			}
		}

		if (Object.keys(currentEvent).length > 0) {
			events.push(currentEvent);
		}

		return events;
	}

	formatSSEEvents(events) {
		return events
			.map((event) => {
				const eventType = event.event || "unknown";
				const dataStr = event.data_raw || "";
				return `event: ${eventType}\ndata: ${this.escapeHtml(dataStr)}`;
			})
			.join("\n\n");
	}

	formatJson(obj) {
		return this.escapeHtml(JSON.stringify(obj, null, 2));
	}

	escapeHtml(unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}
