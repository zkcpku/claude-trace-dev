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
		// Update nav button counts
		this.updateNavCounts(this.conversations.length, this.data.rawPairs.length);
	}

	setupNavigation() {
		const navItems = document.querySelectorAll(".nav-item");
		navItems.forEach((item) => {
			item.addEventListener("click", (e) => {
				const view = e.target.dataset.view;
				this.switchView(view);
			});
		});
	}

	switchView(view) {
		if (view === this.currentView) return;

		// Update nav items
		document.querySelectorAll(".nav-item").forEach((item) => {
			item.classList.toggle("active", item.dataset.view === view);
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
		const filterContainerParent = document.querySelector(".model-filters-container");
		const filterContainer = document.createElement("div");
		filterContainer.className = "model-filters";
		filterContainer.innerHTML = `
			<span class="filter-label">models:</span>
			${models
				.map((model) => {
					const isHaiku = model.toLowerCase().includes("haiku");
					const checked = !isHaiku; // Haiku off by default
					const shortModel = model
						.replace("claude-3-5-", "")
						.replace("claude-3-", "")
						.replace("-20241022", "")
						.replace("-20240620", "");
					return `
					<span class="model-filter">
						<input type="checkbox" value="${model}" ${checked ? "checked" : ""}>
						${shortModel}
					</span>
				`;
				})
				.join("")}
		`;

		filterContainerParent.appendChild(filterContainer);

		// Add event listeners for filter changes
		filterContainer.addEventListener("click", (e) => {
			if (e.target.classList.contains("model-filter")) {
				const checkbox = e.target.querySelector("input[type='checkbox']");
				if (checkbox) {
					checkbox.checked = !checkbox.checked;
					this.applyModelFilters();
				}
			}
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

		// Store filtered pairs for raw view
		this.filteredPairs = filteredPairs;

		// Merge conversations from filtered pairs
		this.filteredConversations = this.mergeConversations(filteredPairs);

		// Update stats
		this.updateFilteredStats();

		// Re-render current view
		this.renderCurrentView();
	}

	updateFilteredStats() {
		// Update nav button counts with filtered data
		const convCount = this.filteredConversations ? this.filteredConversations.length : this.conversations.length;
		const pairCount = this.filteredPairs ? this.filteredPairs.length : this.data.rawPairs.length;
		this.updateNavCounts(convCount, pairCount);
	}

	updateNavCounts(convCount, pairCount) {
		const convNavItem = document.querySelector('.nav-item[data-view="conversations"]');
		const rawNavItem = document.querySelector('.nav-item[data-view="raw"]');

		if (convNavItem) {
			convNavItem.textContent = `[conversations (${convCount})]`;
		}
		if (rawNavItem) {
			rawNavItem.textContent = `[raw calls (${pairCount})]`;
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
			// Use filtered pairs if filters are active, otherwise use all
			if (this.filteredPairs !== undefined) {
				this.renderer.renderFilteredRawPairs();
			} else {
				this.renderer.renderRawPairs();
			}
		}
	}

	mergeConversations(pairs) {
		if (!pairs || pairs.length === 0) return [];

		// First, group pairs by system instructions + model
		const pairsBySystem = new Map();
		for (const pair of pairs) {
			const requestBody = pair.request.body || {};
			const model = requestBody.model || "unknown";
			const system = requestBody.system;

			// Create a key based on system instructions + model
			const systemKey = JSON.stringify({ system, model });

			if (!pairsBySystem.has(systemKey)) {
				pairsBySystem.set(systemKey, []);
			}
			pairsBySystem.get(systemKey).push(pair);
		}

		const allConversations = [];

		// Process each system group separately
		for (const [systemKey, systemPairs] of pairsBySystem) {
			const firstPair = systemPairs[0];
			const model = firstPair.request.body?.model || "unknown";

			// Skip logging for haiku models to reduce noise
			if (!model.toLowerCase().includes("haiku")) {
				console.log(
					`Processing ${systemPairs.length} pairs for model: ${model} with system: ${systemKey.substring(0, 100)}...`,
				);
			}

			// Sort pairs by timestamp within system group
			const sortedPairs = [...systemPairs].sort((a, b) => a.request.timestamp - b.request.timestamp);

			// Group pairs by conversation thread based on message history
			const conversationThreads = new Map(); // Maps first user message hash -> array of pairs

			for (const pair of sortedPairs) {
				const requestBody = pair.request.body || {};
				const messages = requestBody.messages || [];
				const system = requestBody.system;

				if (messages.length === 0) continue;

				// Use first user message as conversation identifier (normalize it)
				// Note: system is already grouped above, so we only need to normalize the first message
				const firstUserMessage = messages[0];
				const normalizedFirstMessage = this.normalizeMessageForGrouping(firstUserMessage);

				const conversationKey = JSON.stringify({
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
			const conversationList = [];
			for (const [conversationKey, threadPairs] of conversationThreads) {
				// Sort threadPairs by timestamp to get proper chronological order
				const sortedThreadPairs = [...threadPairs].sort((a, b) => a.request.timestamp - b.request.timestamp);

				// Find the pair with the longest message history (most complete conversation)
				const finalPair = sortedThreadPairs.reduce((longest, current) => {
					const currentMessages = current.request.body?.messages || [];
					const longestMessages = longest.request.body?.messages || [];
					return currentMessages.length > longestMessages.length ? current : longest;
				});

				console.log(
					`Conversation thread: ${sortedThreadPairs.length} pairs -> using final pair with ${finalPair.request.body?.messages?.length || 0} messages`,
				);

				// Create conversation from the final pair
				const requestBody = finalPair.request.body || {};
				const messages = requestBody.messages || [];
				const system = requestBody.system;
				const usage = this.extractTokenUsage(finalPair);

				// Calculate proper start and end times
				const startTime = new Date(sortedThreadPairs[0].request.timestamp * 1000).toISOString();
				const endTime = new Date(
					(finalPair.response.timestamp || finalPair.request.timestamp) * 1000,
				).toISOString();

				const conversation = {
					model: model,
					messages: messages,
					system: system,
					latestResponse: this.extractResponseContent(finalPair.response),
					pairs: sortedThreadPairs, // Keep all pairs for reference, but now sorted
					metadata: {
						startTime: startTime,
						endTime: endTime,
						totalPairs: sortedThreadPairs.length,
						totalTokens: this.extractTotalTokens(finalPair.response),
						usage: usage,
					},
				};

				conversationList.push(conversation);
			}

			// Add conversations to the global list (we'll detect compact patterns later)
			allConversations.push(...conversationList);
		}

		// Now detect and merge compact conversations across all system groups
		return this.detectAndMergeCompactConversations(allConversations);
	}

	detectAndMergeCompactConversations(conversations) {
		if (conversations.length <= 1) return conversations;

		// Sort by start time to process in chronological order
		const sortedConversations = [...conversations].sort(
			(a, b) => new Date(a.metadata.startTime) - new Date(b.metadata.startTime),
		);
		// .filter((conv) => !conv.model.toLowerCase().includes("haiku"));

		console.log(`Sorted conversations by timestamp:`);
		sortedConversations.forEach((conv, i) => {
			console.log(
				`  ${i}: ${conv.pairs.length} pairs, ${conv.messages.length} messages, start: ${conv.metadata.startTime}`,
			);
		});

		const usedConversations = new Set();
		const mergedConversations = [];

		// Look for compact conversations (1 pair, many messages)
		for (let i = 0; i < sortedConversations.length; i++) {
			const currentConv = sortedConversations[i];

			if (usedConversations.has(i)) continue;

			// Check if this is a compact conversation (1 pair with many messages)
			if (currentConv.pairs.length === 1) {
				console.log(
					`Found potential compact conversation ${i}: ${currentConv.pairs.length} pairs, ${currentConv.messages.length} messages`,
				);

				// Look for the original conversation with same system message and 2 fewer messages
				let originalConv = null;
				let originalIndex = -1;

				for (let j = 0; j < sortedConversations.length; j++) {
					if (j === i || usedConversations.has(j)) continue;

					const otherConv = sortedConversations[j];

					// Check if system messages match and other conversation has exactly 2 fewer messages
					if (otherConv.messages.length === currentConv.messages.length - 2) {
						console.log(
							`Checking potential original conversation ${j}: ${otherConv.pairs.length} pairs, ${otherConv.messages.length} messages`,
						);

						// Check if all messages in otherConv (except first) match messages in currentConv (except first)
						// Skip first message in both conversations when comparing
						let messagesMatch = true;
						for (let k = 1; k < otherConv.messages.length; k++) {
							if (!this.messagesRoughlyEqual(otherConv.messages[k], currentConv.messages[k])) {
								messagesMatch = false;
								break;
							}
						}

						if (messagesMatch) {
							console.log(`Found matching original conversation ${j}: messages match after first`);
							originalConv = otherConv;
							originalIndex = j;
							break;
						}
					}
				}

				if (originalConv) {
					console.log(`✓ Merging compact conversation ${i} with original conversation ${originalIndex}`);
					const mergedConv = this.mergeCompactConversation(originalConv, currentConv);
					mergedConversations.push(mergedConv);
					usedConversations.add(i);
					usedConversations.add(originalIndex);
				} else {
					console.log(`✗ No matching original conversation found for compact conversation ${i}`);
					mergedConversations.push(currentConv);
					usedConversations.add(i);
				}
			}
		}

		// Add remaining conversations that weren't part of compact patterns
		for (let i = 0; i < sortedConversations.length; i++) {
			if (!usedConversations.has(i)) {
				console.log(
					`Adding non-compact conversation ${i}: ${sortedConversations[i].pairs.length} pairs, ${sortedConversations[i].messages.length} messages`,
				);
				mergedConversations.push(sortedConversations[i]);
			}
		}

		// Sort final merged conversations by startTime to ensure chronological order
		return mergedConversations.sort((a, b) => new Date(a.metadata.startTime) - new Date(b.metadata.startTime));
	}

	isCompactConversation(currentConv, nextConv) {
		console.log(`    Checking compact pattern:`);

		const currentMessages = currentConv.messages || [];
		const nextMessages = nextConv.messages || [];

		console.log(`    Current: ${currentConv.pairs.length} pairs, ${currentMessages.length} messages`);
		console.log(`    Next: ${nextConv.pairs.length} pairs, ${nextMessages.length} messages`);

		// Compact conversation should have exactly 1 pair and MORE messages than original
		// (the compact conversation contains the merged result)
		if (nextConv.pairs.length !== 1) {
			console.log(`    ✗ Next should have exactly 1 pair (compact pattern)`);
			return false;
		}

		if (nextMessages.length <= currentMessages.length) {
			console.log(`    ✗ Next should have more messages (compact pattern contains merged result)`);
			return false;
		}

		// For compact conversations, check if the beginning of the next conversation
		// matches the beginning of the current conversation
		const compareLength = Math.min(currentMessages.length, nextMessages.length);
		console.log(`    Comparing first ${compareLength} messages:`);

		// Check if messages 0-N of next match current's messages 0-N
		for (let i = 0; i < compareLength; i++) {
			const match = this.messagesRoughlyEqual(currentMessages[i], nextMessages[i]);
			console.log(
				`    Message ${i}: ${match ? "✓" : "✗"} (roles: ${currentMessages[i]?.role} vs ${nextMessages[i]?.role})`,
			);
			if (!match) {
				return false;
			}
		}

		console.log(`    ✓ Compact pattern confirmed!`);
		return true;
	}

	mergeCompactConversation(currentConv, compactConv) {
		const currentMessages = currentConv.messages || [];
		const compactMessages = compactConv.messages || [];

		console.log(
			`Merging: current has ${currentMessages.length} messages, compact has ${compactMessages.length} messages`,
		);

		// The compact conversation contains the full merged result, but its first user message
		// is truncated/summarized. We need to replace it with the original first message.
		const mergedMessages = [...compactMessages];
		if (currentMessages.length > 0 && mergedMessages.length > 0) {
			mergedMessages[0] = currentMessages[0]; // Replace first message with original
			console.log(`Replaced first message from original conversation`);
		}

		// Combine and sort all pairs by timestamp
		const allPairs = [...currentConv.pairs, ...compactConv.pairs].sort(
			(a, b) => a.request.timestamp - b.request.timestamp,
		);

		// Calculate proper start and end times from all pairs
		const startTime = new Date(allPairs[0].request.timestamp * 1000).toISOString();
		const lastPair = allPairs[allPairs.length - 1];
		const endTime = new Date((lastPair.response.timestamp || lastPair.request.timestamp) * 1000).toISOString();

		const mergedConv = {
			model: compactConv.model,
			system: currentConv.system, // Use original system message
			messages: mergedMessages,
			latestResponse: compactConv.latestResponse,
			pairs: allPairs,
			compacted: true,
			metadata: {
				startTime: startTime,
				endTime: endTime,
				totalPairs: allPairs.length,
				totalTokens: currentConv.metadata.totalTokens + compactConv.metadata.totalTokens,
				usage: {
					input_tokens:
						(currentConv.metadata.usage.input_tokens || 0) + (compactConv.metadata.usage.input_tokens || 0),
					output_tokens:
						(currentConv.metadata.usage.output_tokens || 0) + (compactConv.metadata.usage.output_tokens || 0),
					cache_read_input_tokens:
						(currentConv.metadata.usage.cache_read_input_tokens || 0) +
						(compactConv.metadata.usage.cache_read_input_tokens || 0),
					cache_creation_input_tokens:
						(currentConv.metadata.usage.cache_creation_input_tokens || 0) +
						(compactConv.metadata.usage.cache_creation_input_tokens || 0),
				},
			},
		};

		console.log(`Merged result: ${mergedConv.messages.length} messages, ${mergedConv.pairs.length} pairs`);
		return mergedConv;
	}

	messagesRoughlyEqual(msg1, msg2) {
		if (msg1.role !== msg2.role) return false;

		// Simple content comparison - just check if both are strings or both are arrays
		const content1 = msg1.content;
		const content2 = msg2.content;

		if (typeof content1 !== typeof content2) return false;
		if (Array.isArray(content1) !== Array.isArray(content2)) return false;

		// For now, just assume they match if roles and content types are the same
		// Could add more sophisticated comparison later
		return true;
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

// Global function for expandable sections
function toggleExpand(expandId) {
	const content = document.getElementById(expandId + "-content");
	const toggle = document.getElementById(expandId + "-toggle");

	if (content && toggle) {
		const isHidden = content.classList.contains("hidden");
		content.classList.toggle("hidden", !isHidden);
		toggle.textContent = isHidden ? "[-]" : "[+]";
	}
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	new ClaudeViewer();
});
