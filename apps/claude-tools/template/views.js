// Claude API Traffic Viewer - View Rendering Logic

class ClaudeViewRenderer {
	constructor(viewer) {
		this.viewer = viewer;
	}

	renderConversations() {
		const container = document.querySelector("#conversations-view");
		if (!container) return;

		if (this.viewer.conversations.length === 0) {
			container.innerHTML = '<div class="text-muted">No conversations found</div>';
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
		const container = document.querySelector("#conversations-view");
		if (!container) return;

		if (!this.viewer.filteredConversations || this.viewer.filteredConversations.length === 0) {
			container.innerHTML = '<div class="text-muted">No conversations found with selected models</div>';
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
		const { model, messages, latestResponse, metadata, compacted } = conversation;

		return `
            <div class="conversation">
                <div class="conversation-header">
                    <div class="conversation-title">
                        ${this.escapeHtml(model)}
                    </div>
                    ${this.renderExpandableSystemPrompt(conversation.system)}
                    ${this.renderExpandableTools(conversation)}
                    <div class="conversation-meta">
                        <span>${messages.length} messages</span>
                        <span>${this.formatDuration(metadata.startTime, metadata.endTime)}</span>
                    </div>
                </div>
                <div class="conversation-body">
                    ${this.renderMessages(messages)}
                    ${this.renderLatestResponse(latestResponse)}
                </div>
                ${compacted ? '<div class="compacted-indicator">COMPACTED</div>' : ""}
            </div>
        `;
	}

	formatDuration(startTime, endTime) {
		const start = new Date(startTime);
		const end = new Date(endTime);
		const duration = Math.round((end - start) / 1000 / 60); // minutes
		return `${duration} minutes`;
	}

	renderExpandableSystemPrompt(system) {
		if (!system) return "";

		let systemText = "";
		if (typeof system === "string") {
			systemText = system;
		} else if (Array.isArray(system)) {
			// Extract text from array of objects like [{"type":"text","text":"..."}]
			systemText = system
				.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n");
		} else {
			systemText = JSON.stringify(system);
		}

		const preview = systemText.length > 80 ? systemText.substring(0, 80) + "..." : systemText;
		const expandId = "system-" + Math.random().toString(36).substr(2, 9);

		return `
			<div class="expandable-section">
				<div class="expandable-header system-header" onclick="toggleExpand('${expandId}')">
					<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
					System: ${this.escapeHtml(preview)}
				</div>
				<div class="expandable-content hidden" id="${expandId}-content">
					${this.escapeHtml(systemText).replace(/\n/g, "<br>")}
				</div>
			</div>
		`;
	}

	renderExpandableTools(conversation) {
		// Extract tools from the first pair's request
		if (!conversation.pairs || conversation.pairs.length === 0) return "";

		const firstPair = conversation.pairs[0];
		const tools = firstPair.request.body?.tools || [];

		if (tools.length === 0) return "";

		const expandId = "tools-" + Math.random().toString(36).substr(2, 9);

		return `
			<div class="expandable-section">
				<div class="expandable-header" onclick="toggleExpand('${expandId}')">
					<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
					Tools: ${tools.length} available
				</div>
				<div class="expandable-content hidden" id="${expandId}-content">
					${this.renderToolDefinitions(tools)}
				</div>
			</div>
		`;
	}

	renderToolDefinitions(tools) {
		return tools
			.map((tool) => {
				const name = tool.name || tool.type || "unknown";
				const description = tool.description || this.getToolDescription(tool);
				const params = this.getToolParameters(tool);

				return `
<div class="tool-definition">
<div class="tool-name">${this.escapeHtml(name)}</div>
<div class="tool-description">${this.escapeHtml(description)}</div>
${params ? params : ""}
</div>`;
			})
			.join("");
	}

	getToolDescription(tool) {
		// Handle built-in tool types
		switch (tool.type) {
			case "bash_20250124":
				return "Execute bash commands in persistent shell";
			case "text_editor_20250124":
				return "Perform exact string replacements in files";
			case "web_search_20250305":
				return "Search the web for information";
			default:
				return tool.description || "No description available";
		}
	}

	getToolParameters(tool) {
		if (tool.input_schema && tool.input_schema.properties) {
			const props = tool.input_schema.properties;
			const required = tool.input_schema.required || [];

			return Object.entries(props)
				.map(([name, schema]) => {
					const isRequired = required.includes(name);
					const description = schema.description || "";
					return `<div class="tool-param">• ${name}${isRequired ? " (required)" : ""}: ${this.escapeHtml(description)}</div>`;
				})
				.join("");
		}

		// Handle built-in tools with known parameters
		switch (tool.type) {
			case "bash_20250124":
				return `
					<div class="tool-param">• command (required): The command to execute</div>
					<div class="tool-param">• description: Clear description of what command does</div>
					<div class="tool-param">• timeout: Optional timeout in milliseconds</div>
				`;
			case "text_editor_20250124":
				return `
					<div class="tool-param">• file_path (required): Absolute path to file to modify</div>
					<div class="tool-param">• old_string (required): Text to replace</div>
					<div class="tool-param">• new_string (required): Text to replace it with</div>
					<div class="tool-param">• expected_replacements: Expected number of replacements</div>
				`;
			case "web_search_20250305":
				return `
					<div class="tool-param">• query (required): Search query</div>
					<div class="tool-param">• allowed_domains: Only include these domains</div>
					<div class="tool-param">• blocked_domains: Never include these domains</div>
				`;
			default:
				return "";
		}
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
                <div class="message-role">Assistant</div>
                <div class="message-content">
                    ${content}
                    ${usage ? this.renderUsageInfo(usage) : ""}
                </div>
            </div>
        `;
	}

	formatMessageContent(content) {
		if (typeof content === "string") {
			return this.escapeHtml(content).replace(/\n/g, "<br>");
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
				const text = block.text || "";
				return `<div class="content-block text">${this.escapeHtml(text).replace(/\n/g, "<br>")}</div>`;

			case "thinking":
				return `
                    <div class="content-block thinking">
                        <div class="content-block-type">Thinking</div>
                        ${this.escapeHtml(block.thinking).replace(/\n/g, "<br>")}
                    </div>
                `;

			case "tool_use":
				return this.renderToolCall(block);

			case "tool_result":
				return this.renderToolResult(block);

			default:
				return `
                    <div class="content-block">
                        <div class="content-block-type">${this.escapeHtml(type)}</div>
                        <pre class="font-mono text-sm">${this.escapeHtml(JSON.stringify(block, null, 2))}</pre>
                    </div>
                `;
		}
	}

	renderToolCall(block) {
		const expandId = "tool-call-" + Math.random().toString(36).substr(2, 9);
		const toolName = this.escapeHtml(block.name);

		return `<div class="tool-call outbound">
<div class="tool-call-header" onclick="toggleExpand('${expandId}')">
<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
> ${toolName}
</div>
<div class="tool-call-content hidden" id="${expandId}-content">
<div class="tool-call-params">${this.formatToolInput(block.input)}</div>
</div>
</div>`;
	}

	renderToolResult(block) {
		const expandId = "tool-result-" + Math.random().toString(36).substr(2, 9);
		const status = block.is_error ? "Error" : "Success";
		const statusClass = block.is_error ? "error" : "success";

		return `<div class="tool-call inbound ${statusClass}">
<div class="tool-call-header" onclick="toggleExpand('${expandId}')">
<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
< Tool Result ${status}
</div>
<div class="tool-call-content hidden" id="${expandId}-content">
<div class="tool-call-result">${this.formatToolResult(block.content)}</div>
</div>
</div>`;
	}

	formatToolInput(input) {
		if (typeof input === "object") {
			return Object.entries(input)
				.map(([key, value]) => {
					if (typeof value === "string") {
						return `${key}: ${this.escapeHtml(value)}`;
					} else {
						// Format JSON with proper indentation, then escape
						const jsonStr = JSON.stringify(value, null, 2);
						const escaped = this.escapeHtml(jsonStr);
						return `${key}: ${escaped}`;
					}
				})
				.join("\n");
		}
		return this.escapeHtml(String(input));
	}

	formatResponseContent(response) {
		if (!response || !response.content) return "";

		return response.content.map((block) => this.formatContentBlock(block)).join("");
	}

	formatToolResult(content) {
		if (typeof content === "string") {
			return this.escapeHtml(content);
		}
		// Format JSON properly and escape it
		const jsonStr = JSON.stringify(content, null, 2);
		return this.escapeHtml(jsonStr);
	}

	renderUsageInfo(usage) {
		// Token usage removed - not needed
		return "";
	}

	renderRawPairs() {
		const container = document.querySelector("#raw-view");
		if (!container) return;

		if (!this.viewer.data.rawPairs || this.viewer.data.rawPairs.length === 0) {
			container.innerHTML = '<div class="text-muted">No raw pairs found</div>';
			return;
		}

		const html = this.viewer.data.rawPairs
			.map((pair, idx) => {
				return this.renderRawPair(pair, idx);
			})
			.join("");

		container.innerHTML = html;
	}

	renderFilteredRawPairs() {
		const container = document.querySelector("#raw-view");
		if (!container) return;

		if (!this.viewer.filteredPairs || this.viewer.filteredPairs.length === 0) {
			container.innerHTML = '<div class="text-muted">No raw pairs found with selected models</div>';
			return;
		}

		const html = this.viewer.filteredPairs
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
                    Call #${index + 1} - ${request.method} ${new URL(request.url).pathname} - ${response.status_code}
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
