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
			return html`<div>No conversations found.</div>`;
		}

		return html`
			${this.conversations.map(
				(conversation, index) => html`
					<div class="mt-8 first:mt-0">
						<!-- Conversation Header -->
						<div class="border border-vs-highlight p-4 mb-0">
							<div class="text-vs-function font-bold mb-2">${conversation.model}</div>
							${this.renderExpandableSystemPrompt(conversation.system)}
							${this.renderExpandableTools(conversation)}
							<div class="text-vs-muted text-sm mt-2">
								<span>${conversation.messages.length} messages</span>
								${conversation.metadata.totalTokens
									? html`<span class="ml-4">${conversation.metadata.totalTokens} tokens</span>`
									: ""}
							</div>
						</div>
						<!-- Conversation Messages -->
						<div class="border-l-2 border-r-2 border-b-2 border-vs-highlight">
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
		const expandId = "system-" + Math.random().toString(36).substring(2, 11);

		return html`
			<div class="mb-2">
				<div
					@click=${() => this.toggleExpandById(expandId)}
					class="cursor-pointer text-vs-function hover:text-white"
				>
					<span id="${expandId}-toggle">[+]</span>
					<span class="ml-1">System: ${this.escapeHtml(preview)}</span>
				</div>
				<div class="hidden mt-2 p-2 bg-vs-bg-secondary text-vs-muted" id="${expandId}-content">
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

		const expandId = "tools-" + Math.random().toString(36).substring(2, 11);

		return html`
			<div class="mb-2">
				<div
					@click=${() => this.toggleExpandById(expandId)}
					class="cursor-pointer text-vs-function hover:text-white"
				>
					<span id="${expandId}-toggle">[+]</span>
					<span class="ml-1">Tools: ${tools.length} available</span>
				</div>
				<div class="hidden mt-2 p-2 bg-vs-bg-secondary" id="${expandId}-content">
					${this.renderToolDefinitions(tools)}
				</div>
			</div>
		`;
	}

	private renderToolDefinitions(tools: any[]) {
		return tools.map((tool) => {
			const name = tool.name || tool.type || "unknown";
			const description = tool.description || this.getToolDescription(tool);

			return html`
				<div class="mb-2">
					<div class="text-vs-function font-bold">${this.escapeHtml(name)}</div>
					<div class="text-vs-muted text-sm">${this.escapeHtml(description)}</div>
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
			<div class="p-4 border-b border-vs-border last:border-b-0">
				<div
					class="font-bold text-sm uppercase mb-2 ${message.role === "user"
						? "text-vs-user"
						: "text-vs-assistant"}"
				>
					${message.role}
				</div>
				<div class="whitespace-pre-wrap break-words">${content}</div>
			</div>
		`;
	}

	private renderLatestResponse(response: string) {
		return html`
			<div class="p-4 border-b border-vs-border last:border-b-0">
				<div class="font-bold text-sm uppercase mb-2 text-vs-assistant">assistant</div>
				<div class="whitespace-pre-wrap break-words">${response}</div>
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
}
