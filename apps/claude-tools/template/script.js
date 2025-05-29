// Claude API Traffic Viewer - Frontend Logic

class ClaudeViewer {
	constructor() {
		this.data = window.claudeData || { rawPairs: [] };
		this.currentView = "conversations";
		this.conversations = [];
		this.init();
	}

	init() {
		// Process raw pairs into conversations
		this.conversations = this.mergeConversations(this.data.rawPairs);

		// Update header stats
		this.updateHeaderStats();

		this.setupNavigation();
		this.setupFilters();
		this.renderCurrentView();
	}

	updateHeaderStats() {
		const totalPairsEl = document.querySelector(".header-stats .stat:first-child");
		const totalConvsEl = document.querySelector(".header-stats .stat:nth-child(2)");

		if (totalPairsEl) totalPairsEl.textContent = `${this.data.rawPairs.length} API calls`;
		if (totalConvsEl) totalConvsEl.textContent = `${this.conversations.length} conversations`;
	}

	setupNavigation() {
		const navButtons = document.querySelectorAll(".nav-btn");
		navButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const view = e.target.dataset.view;
				this.switchView(view);
			});
		});
	}

	switchView(view) {
		if (view === this.currentView) return;

		// Update nav buttons
		document.querySelectorAll(".nav-btn").forEach((btn) => {
			btn.classList.toggle("active", btn.dataset.view === view);
		});

		// Update views
		document.querySelectorAll(".view").forEach((viewEl) => {
			viewEl.classList.toggle("active", viewEl.id === `${view}-view`);
		});

		this.currentView = view;
		this.renderCurrentView();
	}

	setupFilters() {
		// Create model filter controls
		this.createModelFilters();
	}

	createModelFilters() {
		// Get all unique models from pairs
		const models = [
			...new Set(
				this.data.rawPairs.map((pair) => {
					const requestBody = pair.request.body || {};
					return requestBody.model || "unknown";
				}),
			),
		].sort();

		if (models.length <= 1) return; // No need for filters if only one model

		// Create filter container
		const nav = document.querySelector(".nav");
		const filterContainer = document.createElement("div");
		filterContainer.className = "model-filters";
		filterContainer.innerHTML = `
			<span class="filter-label">Models:</span>
			${models
				.map((model) => {
					const isHaiku = model.toLowerCase().includes("haiku");
					const checked = !isHaiku; // Haiku off by default
					return `
					<label class="model-filter">
						<input type="checkbox" value="${model}" ${checked ? "checked" : ""}>
						<span>${model}</span>
					</label>
				`;
				})
				.join("")}
		`;

		nav.appendChild(filterContainer);

		// Add event listeners for filter changes
		filterContainer.addEventListener("change", () => {
			this.applyModelFilters();
		});

		// Store initial filter state
		this.modelFilters = new Set(models.filter((model) => !model.toLowerCase().includes("haiku")));

		// Apply initial filters
		this.applyModelFilters();
	}

	applyModelFilters() {
		// Get checked models
		const checkedModels = new Set();
		document.querySelectorAll(".model-filter input:checked").forEach((input) => {
			checkedModels.add(input.value);
		});

		this.modelFilters = checkedModels;

		// Filter conversations and re-render
		this.filterAndRenderConversations();
	}

	filterAndRenderConversations() {
		// Filter raw pairs by selected models
		const filteredPairs = this.data.rawPairs.filter((pair) => {
			const requestBody = pair.request.body || {};
			const model = requestBody.model || "unknown";
			return this.modelFilters.has(model);
		});

		// Merge conversations from filtered pairs
		this.filteredConversations = this.mergeConversations(filteredPairs);

		// Update stats
		this.updateFilteredStats();

		// Re-render if we're in conversations view
		if (this.currentView === "conversations") {
			this.renderFilteredConversations();
		}
	}

	updateFilteredStats() {
		const totalConvsEl = document.querySelector(".header-stats .stat:nth-child(2)");
		if (totalConvsEl && this.filteredConversations) {
			totalConvsEl.textContent = `${this.filteredConversations.length} conversations`;
		}
	}

	renderCurrentView() {
		if (this.currentView === "conversations") {
			// Use filtered conversations if filters are active, otherwise use all
			if (this.filteredConversations !== undefined) {
				this.renderFilteredConversations();
			} else {
				this.renderConversations();
			}
		} else if (this.currentView === "raw") {
			this.renderRawPairs();
		}
	}

	mergeConversations(pairs) {
		if (!pairs || pairs.length === 0) return [];

		const conversations = [];

		// Sort pairs by timestamp
		const sortedPairs = [...pairs].sort((a, b) => a.request.timestamp - b.request.timestamp);

		for (const pair of sortedPairs) {
			const requestBody = pair.request.body || {};
			const model = requestBody.model || "unknown";
			const messages = requestBody.messages || [];
			const system = requestBody.system;

			// Try to find existing conversation to merge with
			let mergedInto = false;

			for (const conv of conversations) {
				if (this.canMergeWithConversation(conv, messages, model)) {
					// Merge this pair into existing conversation
					conv.pairs.push(pair);
					conv.messages = messages; // Update to latest message history
					conv.latestResponse = this.extractResponseContent(pair.response);
					conv.metadata.endTime = new Date(pair.request.timestamp * 1000).toISOString();
					conv.metadata.totalPairs = conv.pairs.length;

					// Accumulate token usage
					const newUsage = this.extractTokenUsage(pair);
					conv.metadata.usage.input_tokens += newUsage.input_tokens || 0;
					conv.metadata.usage.output_tokens += newUsage.output_tokens || 0;
					conv.metadata.usage.cache_read_input_tokens += newUsage.cache_read_input_tokens || 0;
					conv.metadata.usage.cache_creation_input_tokens += newUsage.cache_creation_input_tokens || 0;
					conv.metadata.totalTokens = conv.metadata.usage.input_tokens + conv.metadata.usage.output_tokens;

					mergedInto = true;
					break;
				}
			}

			if (!mergedInto) {
				// Create new conversation
				const usage = this.extractTokenUsage(pair);
				const conversation = {
					model: model,
					messages: messages,
					system: system,
					latestResponse: this.extractResponseContent(pair.response),
					pairs: [pair],
					metadata: {
						startTime: new Date(pair.request.timestamp * 1000).toISOString(),
						endTime: new Date(pair.request.timestamp * 1000).toISOString(),
						totalPairs: 1,
						totalTokens: this.extractTotalTokens(pair.response),
						usage: usage,
					},
				};
				conversations.push(conversation);
			}
		}

		return conversations;
	}

	canMergeWithConversation(conversation, newMessages, model) {
		if (conversation.model !== model) return false;

		const existingMessages = conversation.messages;

		// Check if new messages are a continuation (longer message history with same prefix)
		if (newMessages.length > existingMessages.length) {
			// Check if existing messages are a prefix of new messages
			for (let i = 0; i < existingMessages.length; i++) {
				if (!this.messagesEqual(existingMessages[i], newMessages[i])) {
					return false;
				}
			}
			return true;
		}

		return false;
	}

	messagesEqual(msg1, msg2) {
		return msg1.role === msg2.role && JSON.stringify(msg1.content) === JSON.stringify(msg2.content);
	}

	extractResponseContent(response) {
		const body = response.body;
		if (body && typeof body === "object" && !body.event) {
			// Regular JSON response
			return body;
		}

		// Handle SSE streaming response
		const bodyRaw = response.body_raw || "";
		if (bodyRaw.includes("event:") && bodyRaw.includes("data:")) {
			return this.parseSSEResponse(bodyRaw);
		}

		return body || null;
	}

	parseSSEResponse(sseData) {
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
				if (dataStr !== "[DONE]") {
					try {
						currentEvent.data = JSON.parse(dataStr);
					} catch {
						currentEvent.data = dataStr;
					}
				}
			}
		}

		if (Object.keys(currentEvent).length > 0) {
			events.push(currentEvent);
		}

		// Extract final content from events by accumulating text deltas
		let textContent = "";
		let usage = null;
		let messageInfo = {};

		for (const event of events) {
			const eventType = event.event;
			const data = event.data || {};

			if (eventType === "message_start") {
				messageInfo = data.message || {};
			} else if (eventType === "content_block_delta") {
				const delta = data.delta || {};
				if (delta.type === "text_delta") {
					textContent += delta.text || "";
				}
			} else if (eventType === "message_delta") {
				usage = data.usage || null;
			}
		}

		// Create content in the format expected by the UI
		const content = textContent ? [{ type: "text", text: textContent }] : [];

		return { content, usage, message: messageInfo };
	}

	extractTotalTokens(response) {
		// Try to get usage from structured response first
		const body = response.body || {};
		if (typeof body === "object" && body.usage) {
			const usage = body.usage;
			const inputTokens = usage.input_tokens || 0;
			const outputTokens = usage.output_tokens || 0;
			return inputTokens + outputTokens;
		}

		// Fall back to SSE parsing
		const bodyRaw = response.body_raw || "";
		if (bodyRaw.includes("event:") && bodyRaw.includes("data:")) {
			const parsed = this.parseSSEResponse(bodyRaw);
			if (parsed.usage) {
				const inputTokens = parsed.usage.input_tokens || 0;
				const outputTokens = parsed.usage.output_tokens || 0;
				return inputTokens + outputTokens;
			}
		}

		return 0;
	}

	extractTokenUsage(pair) {
		// Extract token usage from both request and response
		const usage = {
			input_tokens: 0,
			output_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
		};

		// Get from response (SSE or structured)
		const response = pair.response;
		const responseBody = response.body || {};

		if (responseBody.usage) {
			// Structured response
			Object.assign(usage, responseBody.usage);
		} else if (response.body_raw && response.body_raw.includes("event:")) {
			// SSE response - look for both message_start and message_delta events
			const events = this.parseSSEToEvents(response.body_raw);
			for (const event of events) {
				if (
					event.event === "message_start" &&
					event.data_parsed &&
					event.data_parsed.message &&
					event.data_parsed.message.usage
				) {
					// Input tokens are in message_start event
					const messageUsage = event.data_parsed.message.usage;
					usage.input_tokens = messageUsage.input_tokens || 0;
					usage.cache_read_input_tokens = messageUsage.cache_read_input_tokens || 0;
					usage.cache_creation_input_tokens = messageUsage.cache_creation_input_tokens || 0;
				} else if (event.event === "message_delta" && event.data_parsed && event.data_parsed.usage) {
					// Output tokens are in message_delta event
					usage.output_tokens = event.data_parsed.usage.output_tokens || 0;
				}
			}
		}

		return usage;
	}

	renderConversations() {
		const container = document.querySelector(".conversations-container");
		if (!container) return;

		if (this.conversations.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No conversations found</div>';
			return;
		}

		const html = this.conversations
			.map((conv, idx) => {
				return this.renderConversation(conv, idx);
			})
			.join("");

		container.innerHTML = html;
	}

	renderFilteredConversations() {
		const container = document.querySelector(".conversations-container");
		if (!container) return;

		if (!this.filteredConversations || this.filteredConversations.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No conversations found with selected models</div>';
			return;
		}

		const html = this.filteredConversations
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
		const content = typeof system === "string" ? system : JSON.stringify(system);
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
				return `<div class="content-block text">${this.escapeHtml(block.text).replace(/\n/g, "<br>")}</div>`;

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

		if (!this.data.rawPairs || this.data.rawPairs.length === 0) {
			container.innerHTML = '<div class="text-center text-muted">No raw pairs found</div>';
			return;
		}

		const html = this.data.rawPairs
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

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	new ClaudeViewer();
});
