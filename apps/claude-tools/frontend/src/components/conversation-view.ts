import { LitElement, html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ProcessedConversation } from "../types/claude-data";

@customElement("conversation-view")
export class ConversationView extends LitElement {
	@property({ type: Array }) conversations: ProcessedConversation[] = [];

	// Disable shadow DOM to use global Tailwind styles
	createRenderRoot() {
		return this;
	}

	render() {
		if (this.conversations.length === 0) {
			return html`<div class="text-muted">No conversations found.</div>`;
		}

		return html`
			${this.conversations.map(
				(conversation, index) => html`
					<div class="conversation">
						<div class="conversation-header">
							<div class="conversation-title">${conversation.model}</div>
							${this.renderExpandableSystemPrompt(conversation.system)}
							${this.renderExpandableTools(conversation)}
							<div class="conversation-meta">
								<span>${conversation.messages.length} messages</span>
								${conversation.metadata.totalTokens
									? html`<span>${conversation.metadata.totalTokens} tokens</span>`
									: ""}
							</div>
						</div>
						<div class="conversation-body">
							${conversation.messages.map((message) => this.renderMessage(message))}
							${conversation.latestResponse ? this.renderLatestResponse(conversation.latestResponse) : ""}
						</div>
					</div>
				`,
			)}
		`;
	}

	private renderExpandableSystemPrompt(system: any) {
		if (!system) return "";

		let systemText = "";
		if (typeof system === "string") {
			systemText = system;
		} else if (Array.isArray(system)) {
			systemText = system
				.filter((item: any) => item.type === "text")
				.map((item: any) => item.text)
				.join("\n");
		} else {
			systemText = JSON.stringify(system);
		}

		const preview = systemText.length > 80 ? systemText.substring(0, 80) + "..." : systemText;
		const expandId = "system-" + Math.random().toString(36).substr(2, 9);

		return html`
			<div class="expandable-section">
				<div class="expandable-header system-header" @click=${(e: Event) => this.toggleExpandById(expandId)}>
					<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
					System: ${this.escapeHtml(preview)}
				</div>
				<div class="expandable-content hidden" id="${expandId}-content">
					${this.formatTextWithBreaks(systemText)}
				</div>
			</div>
		`;
	}

	private renderExpandableTools(conversation: any) {
		if (!conversation.pairs || conversation.pairs.length === 0) return "";

		const firstPair = conversation.pairs[0];
		const tools = firstPair.request.body?.tools || [];

		if (tools.length === 0) return "";

		const expandId = "tools-" + Math.random().toString(36).substr(2, 9);

		return html`
			<div class="expandable-section">
				<div class="expandable-header" @click=${(e: Event) => this.toggleExpandById(expandId)}>
					<span class="expandable-toggle" id="${expandId}-toggle">[+]</span>
					Tools: ${tools.length} available
				</div>
				<div class="expandable-content hidden" id="${expandId}-content">${this.renderToolDefinitions(tools)}</div>
			</div>
		`;
	}

	private renderToolDefinitions(tools: any[]) {
		return tools.map((tool) => {
			const name = tool.name || tool.type || "unknown";
			const description = tool.description || this.getToolDescription(tool);

			return html`
				<div class="tool-definition">
					<div class="tool-name">${this.escapeHtml(name)}</div>
					<div class="tool-description">${this.escapeHtml(description)}</div>
				</div>
			`;
		});
	}

	private getToolDescription(tool: any): string {
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

	private renderMessage(message: any) {
		let content = "";
		if (typeof message.content === "string") {
			content = message.content;
		} else if (Array.isArray(message.content)) {
			content = message.content
				.filter((item: any) => item.type === "text")
				.map((item: any) => item.text)
				.join("");
		} else {
			content = JSON.stringify(message.content);
		}

		return html`
			<div class="message ${message.role}">
				<div class="message-role">${message.role}</div>
				<div class="message-content">${content}</div>
			</div>
		`;
	}

	private renderLatestResponse(response: string) {
		return html`
			<div class="message assistant">
				<div class="message-role">assistant</div>
				<div class="message-content">${response}</div>
			</div>
		`;
	}

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	private formatTextWithBreaks(text: string): TemplateResult {
		const escaped = this.escapeHtml(text);
		const parts = escaped.split("\n");
		const result = [];
		for (let i = 0; i < parts.length; i++) {
			result.push(parts[i]);
			if (i < parts.length - 1) {
				result.push(html`<br />`);
			}
		}
		return html`${result}`;
	}

	private toggleExpandById(id: string) {
		const toggle = document.getElementById(`${id}-toggle`);
		const content = document.getElementById(`${id}-content`);

		if (toggle && content) {
			if (content.classList.contains("hidden")) {
				content.classList.remove("hidden");
				toggle.textContent = "[-]";
			} else {
				content.classList.add("hidden");
				toggle.textContent = "[+]";
			}
		}
	}

	private toggleThinking(e: Event) {
		this.toggleExpandable(e);
	}

	private toggleToolCall(e: Event) {
		this.toggleExpandable(e);
	}

	private toggleExpandable(e: Event) {
		const header = e.currentTarget as HTMLElement;
		const toggle = header.querySelector(".expandable-toggle") as HTMLElement;
		const content = header.nextElementSibling as HTMLElement;

		if (content.classList.contains("hidden")) {
			content.classList.remove("hidden");
			toggle.textContent = "[-]";
		} else {
			content.classList.add("hidden");
			toggle.textContent = "[+]";
		}
	}
}
