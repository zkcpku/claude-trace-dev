import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ClaudeData, ProcessedConversation } from "./types/claude-data";
import { ConversationProcessor } from "./utils/conversation-processor";

@customElement("claude-app")
export class ClaudeApp extends LitElement {
	@state() private data: ClaudeData = { rawPairs: [] };
	@state() private conversations: ProcessedConversation[] = [];
	@state() private currentView: "conversations" | "raw" = "conversations";
	@state() private selectedModels: Set<string> = new Set();

	// Disable shadow DOM to use global Tailwind styles
	createRenderRoot() {
		return this;
	}

	connectedCallback() {
		super.connectedCallback();
		this.data = window.claudeData || { rawPairs: [] };
		this.processData();
	}

	private processData() {
		const processor = new ConversationProcessor();
		this.conversations = processor.mergeConversations(this.data.rawPairs);

		// Initialize with all models selected
		const allModels = new Set(this.conversations.map((c) => c.model));
		this.selectedModels = allModels;
	}

	private switchView(view: "conversations" | "raw") {
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
		return this.conversations.filter((c) => this.selectedModels.has(c.model));
	}

	private get modelCounts() {
		const counts = new Map<string, number>();
		this.conversations.forEach((c) => {
			counts.set(c.model, (counts.get(c.model) || 0) + 1);
		});
		return counts;
	}

	render() {
		const modelCounts = this.modelCounts;
		const filteredConversations = this.filteredConversations;

		return html`
			<div class="terminal">
				<div class="header-container">
					<div class="terminal-header">
						<span>~</span>
						<span>claude-traffic</span>
						<div class="status">
							<span>${this.data.timestamp || new Date().toISOString()}</span>
						</div>
					</div>

					<div class="terminal-nav">
						<span
							class="nav-item ${this.currentView === "conversations" ? "active" : ""}"
							@click=${() => this.switchView("conversations")}
						>
							conversations (${filteredConversations.length})
						</span>
						<span
							class="nav-item ${this.currentView === "raw" ? "active" : ""}"
							@click=${() => this.switchView("raw")}
						>
							raw calls (${this.data.rawPairs.length})
						</span>
					</div>

					${modelCounts.size > 1
						? html`
								<div class="model-filters-container">
									<div class="model-filters">
										<span class="filter-label">models:</span>
										${Array.from(modelCounts.entries()).map(([model, count]) => {
											const shortModel = model
												.replace("claude-3-5-", "")
												.replace("claude-3-", "")
												.replace("-20241022", "")
												.replace("-20240620", "");
											return html`
												<span class="model-filter">
													<input
														type="checkbox"
														.checked=${this.selectedModels.has(model)}
														@change=${() => this.toggleModel(model)}
													/>
													${shortModel}
												</span>
											`;
										})}
									</div>
								</div>
							`
						: ""}
				</div>

				<div class="terminal-content">
					<div class="view ${this.currentView === "conversations" ? "active" : ""}" id="conversations-view">
						${filteredConversations.length === 0
							? html`<div class="text-muted">No conversations found for selected models.</div>`
							: html` <conversation-view .conversations=${filteredConversations}></conversation-view> `}
					</div>

					<div class="view ${this.currentView === "raw" ? "active" : ""}" id="raw-view">
						<raw-pairs-view .rawPairs=${this.data.rawPairs}></raw-pairs-view>
					</div>
				</div>
			</div>
		`;
	}
}
