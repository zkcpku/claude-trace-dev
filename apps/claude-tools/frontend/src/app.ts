import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ClaudeData } from "./types/claude-data";
import { processRawPairs, ProcessedPair, RawPairData } from "./utils/data";
import { SimpleConversationProcessor, SimpleConversation } from "./utils/simple-conversation-processor";

@customElement("claude-app")
export class ClaudeApp extends LitElement {
	@state() private data: ClaudeData = { rawPairs: [] };
	@state() private conversations: SimpleConversation[] = [];
	@state() private processedPairs: ProcessedPair[] = [];
	@state() private currentView: "conversations" | "raw" | "json" = "conversations";
	@state() private selectedModels: Set<string> = new Set();

	// Disable shadow DOM to use global Tailwind styles
	createRenderRoot() {
		console.log("createRenderRoot");
		return this;
	}

	connectedCallback() {
		super.connectedCallback();
		this.data = window.claudeData || { rawPairs: [] };
		this.processData();
	}

	private processData() {
		const start = performance.now();
		// Process raw pairs with new typed approach
		const rawPairData: RawPairData[] = this.data.rawPairs.map((pair) => ({
			request_body: pair.request.body,
			response_body: pair.response.body,
			body_raw: (pair.response as any).body_raw, // SSE data if available
			response_headers: pair.response.headers,
			timestamp: pair.timestamp,
		}));

		this.processedPairs = processRawPairs(rawPairData);

		// Process conversations using new simple processor
		const processor = new SimpleConversationProcessor();
		this.conversations = processor.mergeConversations(this.processedPairs);

		// Initialize with all models selected except haiku models
		const conversationModels = new Set(this.conversations.flatMap((c) => Array.from(c.models)));
		const processedPairModels = new Set(this.processedPairs.map((p) => p.model));
		const rawPairModels = new Set(this.data.rawPairs.map((pair) => pair.request?.body?.model || "unknown"));
		const allModels = new Set([...conversationModels, ...processedPairModels, ...rawPairModels]);

		// Filter out haiku models by default
		const selectedModels = new Set([...allModels].filter((model) => !model.toLowerCase().includes("haiku")));
		this.selectedModels = selectedModels;
		console.log(`Processed data in ${performance.now() - start}ms`);
	}

	private switchView(view: "conversations" | "raw" | "json") {
		this.currentView = view;
	}

	private toggleModel(model: string) {
		const newSelectedModels = new Set(this.selectedModels);
		if (newSelectedModels.has(model)) {
			newSelectedModels.delete(model);
		} else {
			newSelectedModels.add(model);
		}
		this.selectedModels = newSelectedModels;
	}

	private get filteredConversations() {
		return this.conversations.filter((c) => {
			// Show conversation if ANY of its models are selected
			return Array.from(c.models).some((model) => this.selectedModels.has(model));
		});
	}

	private get filteredProcessedPairs() {
		return this.processedPairs.filter((pair) => this.selectedModels.has(pair.model));
	}

	private get filteredRawPairs() {
		return this.data.rawPairs.filter((pair) => {
			const model = pair.request?.body?.model || "unknown";
			return this.selectedModels.has(model);
		});
	}

	private get modelCounts() {
		const counts = new Map<string, number>();
		this.conversations.forEach((c) => {
			// Count each model used in conversations
			Array.from(c.models).forEach((model) => {
				counts.set(model, (counts.get(model) || 0) + 1);
			});
		});
		return counts;
	}

	render() {
		const modelCounts = this.modelCounts;
		const filteredConversations = this.filteredConversations;

		return html`
			<div class="min-h-screen bg-vs-bg text-vs-text font-mono">
				<div class="max-w-[600px] mx-auto p-4">
					<div class="text-center mb-8 mt-4">
						<div class="mb-4">
							<span>~</span>
							<span>claude-traffic</span>
							<div>
								<span class="text-vs-muted">${this.data.timestamp || new Date().toISOString()}</span>
							</div>
						</div>

						<div class="mb-8">
							<span
								@click=${() => this.switchView("conversations")}
								class="cursor-pointer py-2 px-4 mr-4 inline-block leading-tight ${this.currentView ===
								"conversations"
									? "bg-vs-nav-active text-black"
									: "bg-vs-nav text-vs-text hover:bg-vs-nav-hover"}"
							>
								conversations (${filteredConversations.length})
							</span>
							<span
								@click=${() => this.switchView("raw")}
								class="cursor-pointer py-2 px-4 mr-4 inline-block leading-tight ${this.currentView === "raw"
									? "bg-vs-nav-active text-black"
									: "bg-vs-nav text-vs-text hover:bg-vs-nav-hover"}"
							>
								raw calls (${this.filteredRawPairs.length})
							</span>
							<span
								@click=${() => this.switchView("json")}
								class="cursor-pointer py-2 px-4 mr-4 inline-block leading-tight ${this.currentView === "json"
									? "bg-vs-nav-active text-black"
									: "bg-vs-nav text-vs-text hover:bg-vs-nav-hover"}"
							>
								json debug (${this.filteredProcessedPairs.length})
							</span>
						</div>

						${modelCounts.size > 1
							? html`
									<div>
										<div>
											${Array.from(modelCounts.entries()).map(([model, _count]) => {
												return html`
													<span
														@click=${() => this.toggleModel(model)}
														class="cursor-pointer mr-4 hover:text-vs-accent"
													>
														${this.selectedModels.has(model) ? "[x]" : "[ ]"} ${model}
													</span>
												`;
											})}
										</div>
									</div>
								`
							: ""}
					</div>

					<div>
						${this.currentView === "conversations"
							? html`
									<div id="conversations-view">
										${filteredConversations.length === 0
											? html`<div>No conversations found for selected models.</div>`
											: html`<simple-conversation-view
													.conversations=${filteredConversations}
												></simple-conversation-view>`}
									</div>
								`
							: ""}
						${this.currentView === "raw"
							? html`
									<div id="raw-view">
										${this.filteredRawPairs.length === 0
											? html`<div>No raw pairs found for selected models.</div>`
											: html`<raw-pairs-view .rawPairs=${this.filteredRawPairs}></raw-pairs-view>`}
									</div>
								`
							: ""}
						${this.currentView === "json"
							? html`
									<div id="json-view">
										${this.filteredProcessedPairs.length === 0
											? html`<div>No processed pairs found for selected models.</div>`
											: html`<json-view .processedPairs=${this.filteredProcessedPairs}></json-view>`}
									</div>
								`
							: ""}
					</div>
				</div>
			</div>
		`;
	}
}
