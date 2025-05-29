// Claude API Traffic Viewer - Frontend Logic

class ClaudeViewer {
	constructor() {
		this.data = window.claudeData || { rawPairs: [] };
		this.currentView = "conversations";
		this.conversations = [];
		this.renderer = new ClaudeViewRenderer(this);
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
			this.renderer.renderFilteredConversations();
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
				this.renderer.renderFilteredConversations();
			} else {
				this.renderer.renderConversations();
			}
		} else if (this.currentView === "raw") {
			this.renderer.renderRawPairs();
		}
	}

	mergeConversations(pairs) {
		if (!pairs || pairs.length === 0) return [];

		// First, group pairs by model
		const pairsByModel = new Map();
		for (const pair of pairs) {
			const requestBody = pair.request.body || {};
			const model = requestBody.model || "unknown";

			if (!pairsByModel.has(model)) {
				pairsByModel.set(model, []);
			}
			pairsByModel.get(model).push(pair);
		}

		const allConversations = [];

		// Process each model group separately
		for (const [model, modelPairs] of pairsByModel) {
			console.log(`Processing ${modelPairs.length} pairs for model: ${model}`);

			// Sort pairs by timestamp within model
			const sortedPairs = [...modelPairs].sort((a, b) => a.request.timestamp - b.request.timestamp);

			// Group pairs by conversation thread based on message history
			const conversationThreads = new Map(); // Maps first user message hash -> array of pairs

			for (const pair of sortedPairs) {
				const requestBody = pair.request.body || {};
				const messages = requestBody.messages || [];
				const system = requestBody.system;

				if (messages.length === 0) continue;

				// Use first user message as conversation identifier (but normalize it first)
				const firstUserMessage = messages[0];
				const normalizedFirstMessage = this.normalizeMessageForGrouping(firstUserMessage);
				const normalizedSystem = this.normalizeSystemForGrouping(system);

				const conversationKey = JSON.stringify({
					system: normalizedSystem,
					firstMessage: normalizedFirstMessage,
				});

				const keyHash = this.hashString(conversationKey);
				console.log(
					`Pair with ${messages.length} messages -> key hash: ${keyHash}, first 100 chars: ${conversationKey.substring(0, 100)}`,
				);

				if (!conversationThreads.has(keyHash)) {
					conversationThreads.set(keyHash, []);
					console.log(`Created new thread for hash: ${keyHash}`);
				} else {
					console.log(`Adding to existing thread for hash: ${keyHash}`);
				}
				conversationThreads.get(keyHash).push(pair);
			}

			// For each conversation thread, only keep the final pair (longest message history)
			for (const [conversationKey, threadPairs] of conversationThreads) {
				// Find the pair with the longest message history (most complete conversation)
				const finalPair = threadPairs.reduce((longest, current) => {
					const currentMessages = current.request.body?.messages || [];
					const longestMessages = longest.request.body?.messages || [];
					return currentMessages.length > longestMessages.length ? current : longest;
				});

				console.log(
					`Conversation thread: ${threadPairs.length} pairs -> using final pair with ${finalPair.request.body?.messages?.length || 0} messages`,
				);

				// Create conversation from the final pair
				const requestBody = finalPair.request.body || {};
				const messages = requestBody.messages || [];
				const system = requestBody.system;
				const usage = this.extractTokenUsage(finalPair);

				const conversation = {
					model: model,
					messages: messages,
					system: system,
					latestResponse: this.extractResponseContent(finalPair.response),
					pairs: threadPairs, // Keep all pairs for reference, but only show final result
					metadata: {
						startTime: new Date(threadPairs[0].request.timestamp * 1000).toISOString(),
						endTime: new Date(finalPair.request.timestamp * 1000).toISOString(),
						totalPairs: threadPairs.length,
						totalTokens: this.extractTotalTokens(finalPair.response),
						usage: usage,
					},
				};

				allConversations.push(conversation);
			}
		}

		return allConversations;
	}

	normalizeMessageForGrouping(message) {
		if (!message || !message.content) return message;

		const normalizedContent = Array.isArray(message.content)
			? message.content.map((block) => {
					if (block.type === "text" && block.text) {
						let text = block.text;
						// Remove dynamic content that might vary between calls
						text = text.replace(/Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, "Generated [TIMESTAMP]");
						text = text.replace(/The user opened the file [^\s]+ in the IDE\./g, "The user opened file in IDE.");
						text = text.replace(/<system-reminder>.*?<\/system-reminder>/gs, "[SYSTEM-REMINDER]");
						return { type: "text", text: text };
					}
					return block;
				})
			: message.content;

		return {
			role: message.role,
			content: normalizedContent,
		};
	}

	normalizeSystemForGrouping(system) {
		if (!system) return system;
		if (typeof system === "string") {
			return system.substring(0, 100); // Just first 100 chars for grouping
		}
		if (Array.isArray(system)) {
			return system.map((block) => {
				if (block.type === "text" && block.text) {
					return { type: "text", text: block.text.substring(0, 100) };
				}
				return block;
			});
		}
		return system;
	}

	hashString(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString();
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
			const events = this.renderer.parseSSEToEvents(response.body_raw);
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
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	new ClaudeViewer();
});
