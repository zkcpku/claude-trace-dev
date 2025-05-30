import { LitElement, html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type {
	MessageParam,
	TextBlockParam,
	ContentBlock,
	ContentBlockParam,
	Message,
	ToolUnion,
} from "@anthropic-ai/sdk/resources/messages";
import { SimpleConversation } from "../utils/simple-conversation-processor";
import { markdownToHtml } from "../utils/markdown";

@customElement("simple-conversation-view")
export class SimpleConversationView extends LitElement {
	@property({ type: Array }) conversations: SimpleConversation[] = [];

	// Disable shadow DOM to use global CSS
	createRenderRoot() {
		return this;
	}

	private toggleContent(e: Event) {
		const header = e.currentTarget as HTMLElement;
		const content = header.nextElementSibling as HTMLElement;
		const toggle = header.querySelector("span:first-child") as HTMLElement;

		if (content && toggle) {
			const isHidden = content.classList.contains("hidden");
			content.classList.toggle("hidden", !isHidden);
			toggle.textContent = isHidden ? "[-]" : "[+]";
		}
	}

	private formatContent(content: string | ContentBlockParam[]): TemplateResult {
		if (typeof content === "string") {
			return this.formatStringContent(content);
		}

		if (Array.isArray(content)) {
			return html`
				${content.map((block) => {
					if (block.type === "text") {
						return this.formatStringContent(block.text);
					} else if (block.type === "tool_result") {
						return html`
							<div class="mb-4">
								<div
									class="text-vs-function font-bold px-4 py-2 inline-block mb-2 cursor-pointer hover:text-white transition-colors"
									@click=${this.toggleContent}
								>
									<span class="mr-2">[+]</span>
									📤 Tool Result ${block.is_error ? "❌" : "✅"}
								</div>
								<div class="bg-vs-bg-secondary p-4 text-vs-text hidden">
									<pre class="whitespace-pre-wrap">
${typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2)}</pre
									>
								</div>
							</div>
						`;
					} else if (block.type === "tool_use") {
						return html`
							<div class="mb-4">
								<div
									class="text-vs-type font-bold  px-4 py-2 inline-block mb-2 cursor-pointer hover:text-white transition-colors"
									@click=${this.toggleContent}
								>
									<span class="mr-2">[+]</span>
									🔧 ${this.getToolDisplayName(block)}
								</div>
								<div class="bg-vs-bg-secondary p-4 text-vs-text hidden">
									<pre class="whitespace-pre-wrap">${JSON.stringify(block.input, null, 2)}</pre>
								</div>
							</div>
						`;
					}
					return html`<pre class="mb-4">${JSON.stringify(block, null, 2)}</pre>`;
				})}
			`;
		}

		return html`<pre>${JSON.stringify(content, null, 2)}</pre>`;
	}

	private formatStringContent(content: string): TemplateResult {
		// Check for system reminder blocks (handling HTML-escaped delimiters)
		const systemReminderRegex = /&lt;system-reminder&gt;([\s\S]*?)&lt;\/system-reminder&gt;/g;
		const systemReminders: string[] = [];
		let match;

		// Extract all system reminder blocks
		while ((match = systemReminderRegex.exec(content)) !== null) {
			systemReminders.push(match[1].trim());
		}

		// Remove system reminder blocks from main content
		const mainContent = content.replace(systemReminderRegex, "").trim();

		return html`
			${mainContent ? html`<div class="markdown-content">${unsafeHTML(markdownToHtml(mainContent))}</div>` : ""}
			${systemReminders.length > 0
				? html`
						<div class="mb-4">
							<div
								class="cursor-pointer text-vs-muted hover:text-white transition-colors"
								@click=${this.toggleContent}
							>
								<span class="mr-2">[+]</span>
								<span>System Reminder</span>
							</div>
							<div class="hidden mt-2 text-vs-muted">
								${systemReminders.map(
									(reminder, index) => html`
										<div>
											${systemReminders.length > 1
												? html`<div class="text-vs-function font-bold mb-2">Reminder ${index + 1}:</div>`
												: ""}
											<div class="markdown-content">${unsafeHTML(markdownToHtml(reminder))}</div>
										</div>
									`,
								)}
							</div>
						</div>
					`
				: ""}
		`;
	}

	private formatSystem(system: string | TextBlockParam[] | undefined): string {
		if (!system) return "";

		if (typeof system === "string") {
			return markdownToHtml(system);
		}

		if (Array.isArray(system)) {
			const textContent = system
				.map((block) => {
					if (block.type === "text") {
						return block.text;
					}
					return JSON.stringify(block, null, 2);
				})
				.join("\n");
			return markdownToHtml(textContent);
		}

		return JSON.stringify(system, null, 2);
	}

	private formatResponseContent(response: Message): TemplateResult {
		if (!response) return html``;

		if (response.content && Array.isArray(response.content)) {
			return html`
				${response.content.map((block) => {
					if (block.type === "text") {
						return html`<div class="markdown-content">${unsafeHTML(markdownToHtml(block.text))}</div>`;
					} else if (block.type === "tool_use") {
						return html`
							<div class="mb-4">
								<div
									class="text-vs-type font-bold  px-4 py-2 inline-block mb-2 cursor-pointer hover:text-white transition-colors"
									@click=${this.toggleContent}
								>
									<span class="mr-2">[+]</span>
									🔧 ${this.getToolDisplayName(block)}
								</div>
								<div class="bg-vs-bg-secondary p-4 text-vs-text hidden">
									<pre class="whitespace-pre-wrap">${JSON.stringify(block.input, null, 2)}</pre>
								</div>
							</div>
						`;
					}
					return html`<pre class="mb-4">${JSON.stringify(block, null, 2)}</pre>`;
				})}
			`;
		}

		return html`<pre>${JSON.stringify(response, null, 2)}</pre>`;
	}

	private getToolDisplayName(toolUse: any): TemplateResult {
		const toolName = toolUse.name;
		const input = toolUse.input;

		// HTML unescape function
		const unescapeHtml = (str: string): string => {
			const div = document.createElement("div");
			div.innerHTML = str;
			return div.textContent || div.innerText || "";
		};

		switch (toolName) {
			case "Read":
				return input?.file_path
					? html`${toolName}(<span class="text-vs-text">${unescapeHtml(input.file_path)}</span>)`
					: html`${toolName}`;
			case "Bash":
				return input?.command
					? html`${toolName}(<span class="text-vs-text">${unescapeHtml(input.command)}</span>)`
					: html`${toolName}`;
			default:
				return html`${toolName}`;
		}
	}

	private hasTools(conversation: SimpleConversation): boolean {
		return !!(conversation.finalPair.request.tools && conversation.finalPair.request.tools.length > 0);
	}

	private renderTools(tools: ToolUnion[]): TemplateResult {
		return html`
			${tools.map((tool) => {
				if ("name" in tool && tool.name) {
					const description = ("description" in tool && tool.description) || "No description";

					return html`
						<div class="mb-8">
							<div
								class="cursor-pointer text-vs-user font-bold mb-2 border border-vs-user px-4 py-2 inline-block hover:text-white transition-colors"
								@click=${this.toggleContent}
							>
								<span class="mr-2">[-]</span>
								${tool.name}
							</div>
							<div>
								<div class="text-vs-text mb-3 markdown-content">${unsafeHTML(markdownToHtml(description))}</div>

								${"input_schema" in tool && tool.input_schema && typeof tool.input_schema === "object"
									? (() => {
											const schema = tool.input_schema as any;
											if (schema.properties) {
												return html`
													<div class="text-vs-muted mb-2">Parameters:</div>
													${Object.entries(schema.properties).map(([paramName, paramDef]) => {
														const def = paramDef as any;
														const required = schema.required?.includes(paramName) ? " (required)" : "";
														const type = def.type ? ` [${def.type}]` : "";
														const desc = def.description ? ` - ${def.description}` : "";
														return html`
															<div class="ml-4 mb-1">
																<span class="text-vs-type">${paramName}</span>
																<span class="text-vs-muted">${type}${required}${desc}</span>
															</div>
														`;
													})}
												`;
											}
											return html``;
										})()
									: html``}
							</div>
						</div>
					`;
				}
				return html`<pre class="mb-4">${JSON.stringify(tool, null, 2)}</pre>`;
			})}
		`;
	}

	render() {
		if (this.conversations.length === 0) {
			return html`<div>No conversations found.</div>`;
		}

		return html`
			<div>
				${this.conversations.map(
					(conversation) => html`
						<div class="mt-8 first:mt-0">
							<!-- Conversation Header -->
							<div class="border border-vs-highlight p-4 mb-0">
								<div class="text-vs-assistant font-bold">${Array.from(conversation.models).join(", ")}</div>
								<div class="text-vs-muted">
									${new Date(conversation.metadata.startTime).toLocaleString()} •
									${conversation.messages.length + 1} messages
								</div>
							</div>

							<!-- System Prompt (Expandable) -->
							${conversation.system
								? html`
										<div class="px-4 mt-4">
											<div
												class="cursor-pointer text-vs-assistant hover:text-white transition-colors"
												@click=${this.toggleContent}
											>
												<span class="mr-2">[+]</span>
												<span>System Prompt</span>
											</div>
											<div class="hidden mt-4">
												<div class="text-vs-text markdown-content">
													${unsafeHTML(this.formatSystem(conversation.system))}
												</div>
											</div>
										</div>
									`
								: ""}

							<!-- Tools (Expandable) -->
							${this.hasTools(conversation)
								? html`
										<div class="px-4">
											<div
												class="cursor-pointer text-vs-assistant hover:text-white transition-colors"
												@click=${this.toggleContent}
											>
												<span class="mr-2">[+]</span>
												<span>Tools (${conversation.finalPair.request.tools?.length || 0})</span>
											</div>
											<div class="mt-4 hidden">
												<div class="text-vs-text">
													${this.renderTools(conversation.finalPair.request.tools || [])}
												</div>
											</div>
										</div>
									`
								: ""}

							<!-- Conversation Messages -->
							<div class="px-4 mt-4">
								${conversation.messages.map(
									(message, msgIndex) => html`
										<div class="mb-4">
											<div
												class="font-bold uppercase ${message.role === "user"
													? "text-vs-user"
													: "text-vs-assistant"}"
											>
												<span>${message.role}</span>
												<span class="ml-1">${msgIndex + 1}</span>
											</div>
											<div class="text-vs-text">${this.formatContent(message.content)}</div>
										</div>
									`,
								)}

								<!-- Assistant Response -->
								<div class="mb-4">
									<div class="font-bold uppercase text-vs-assistant">
										<span>assistant</span>
										<span class="ml-1">${conversation.messages.length + 1}</span>
										<span class="font-normal lowercase text-vs-muted ml-2">
											(${conversation.metadata.inputTokens} in, ${conversation.metadata.outputTokens} out)
										</span>
									</div>
									<div class="text-vs-text">${this.formatResponseContent(conversation.response)}</div>
								</div>
							</div>

							<!-- Pair Details (Expandable) -->
							${conversation.metadata.totalPairs > 1
								? html`
										<div>
											<div @click=${this.toggleContent}>
												<span>[+]</span>
												<span>All ${conversation.metadata.totalPairs} API Pairs</span>
											</div>
											<div class="hidden">
												<div>
													${conversation.allPairs.map(
														(pair, pairIndex) => html`
															<div>
																<strong>Pair ${pairIndex + 1}:</strong>
																${pair.request.messages?.length || 0} messages,
																${pair.isStreaming ? "streaming" : "non-streaming"},
																${new Date(pair.timestamp).toLocaleString()}
															</div>
														`,
													)}
												</div>
											</div>
										</div>
									`
								: ""}
						</div>
					`,
				)}
			</div>
		`;
	}
}
