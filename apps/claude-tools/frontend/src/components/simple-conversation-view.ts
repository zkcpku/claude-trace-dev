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

	private formatContent(content: string | ContentBlockParam[]): string {
		if (typeof content === "string") {
			return markdownToHtml(content);
		}

		if (Array.isArray(content)) {
			const textContent = content
				.map((block) => {
					if (block.type === "text") {
						return block.text;
					}
					return JSON.stringify(block, null, 2);
				})
				.join("\n");
			return markdownToHtml(textContent);
		}

		return JSON.stringify(content, null, 2);
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

	private formatResponseContent(response: Message): string {
		if (!response) return "";

		if (response.content && Array.isArray(response.content)) {
			const textContent = response.content
				.filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
				.map((block) => block.text)
				.join("\n");
			return markdownToHtml(textContent);
		}

		return JSON.stringify(response, null, 2);
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
							<div class="text-vs-user font-bold mb-4 border border-vs-user px-4 py-2 inline-block">
								${tool.name}
							</div>
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
											<div class="hidden">
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
												<span class="mr-2">[-]</span>
												<span>Tools (${conversation.finalPair.request.tools?.length || 0})</span>
											</div>
											<div class="pl-4 mt-4">
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
												class="cursor-pointer font-bold uppercase ${message.role === "user"
													? "text-vs-user"
													: "text-vs-assistant"} hover:text-white transition-colors"
												@click=${this.toggleContent}
											>
												<span class="mr-2">[-]</span>
												<span>${message.role}</span>
												<span class="ml-1">${msgIndex + 1}</span>
											</div>
											<div class="text-vs-text markdown-content">
												${unsafeHTML(this.formatContent(message.content))}
											</div>
										</div>
									`,
								)}

								<!-- Assistant Response -->
								<div class="mb-4">
									<div
										class="cursor-pointer font-bold uppercase text-vs-assistant hover:text-white transition-colors"
										@click=${this.toggleContent}
									>
										<span class="mr-2">[-]</span>
										<span>assistant</span>
										<span class="ml-1">${conversation.messages.length + 1}</span>
										<span class="font-normal lowercase text-vs-muted ml-2">
											(${conversation.metadata.inputTokens} in, ${conversation.metadata.outputTokens} out)
										</span>
									</div>
									<div class="text-vs-text markdown-content">
										${unsafeHTML(this.formatResponseContent(conversation.response))}
									</div>
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
