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
						if (block.name === "TodoWrite") {
							return html`
								<div class="mb-4">
									<div class="text-vs-type font-bold  px-4 py-2 inline-block mb-2">
										🔧 ${this.getToolDisplayName(block)}
									</div>
									<div class="bg-vs-bg-secondary p-4 text-vs-text">${this.renderToolUseContent(block)}</div>
								</div>
							`;
						}
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
									${this.renderToolUseContent(block)}
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
						if (block.name === "TodoWrite") {
							return html`
								<div class="mb-4">
									<div class="text-vs-type font-bold  px-4 py-2 inline-block mb-2">
										🔧 ${this.getToolDisplayName(block)}
									</div>
									<div class="bg-vs-bg-secondary p-4 text-vs-text">${this.renderToolUseContent(block)}</div>
								</div>
							`;
						}
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
									${this.renderToolUseContent(block)}
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
			case "Write":
				return input?.file_path
					? html`${toolName}(<span class="text-vs-text">${unescapeHtml(input.file_path)}</span>)`
					: html`${toolName}`;
			case "Glob":
				if (input?.pattern) {
					const pattern = unescapeHtml(input.pattern);
					const path = input?.path ? unescapeHtml(input.path) : null;
					return path
						? html`${toolName}(<span class="text-vs-text">${pattern}</span>,
								<span class="text-vs-text">${path}</span>)`
						: html`${toolName}(<span class="text-vs-text">${pattern}</span>)`;
				}
				return html`${toolName}`;
			case "Grep":
				if (input?.pattern) {
					const pattern = unescapeHtml(input.pattern);
					const include = input?.include ? unescapeHtml(input.include) : null;
					const path = input?.path ? unescapeHtml(input.path) : null;

					let params = pattern;
					if (include) params += `, ${include}`;
					if (path) params += `, ${path}`;

					return html`${toolName}(<span class="text-vs-text">${params}</span>)`;
				}
				return html`${toolName}`;
			case "LS":
				if (input?.path) {
					const path = unescapeHtml(input.path);
					const ignore = input?.ignore ? input.ignore.map((p: string) => unescapeHtml(p)).join(", ") : null;

					return ignore
						? html`${toolName}(<span class="text-vs-text">${path}</span>, ignore:
								<span class="text-vs-text">${ignore}</span>)`
						: html`${toolName}(<span class="text-vs-text">${path}</span>)`;
				}
				return html`${toolName}`;
			case "Edit":
				return input?.file_path
					? html`${toolName}(<span class="text-vs-text">${unescapeHtml(input.file_path).split("/").pop()}</span>)`
					: html`${toolName}`;
			case "MultiEdit":
				if (input?.file_path) {
					const fileName = unescapeHtml(input.file_path).split("/").pop();
					const editCount = input?.edits ? input.edits.length : 0;
					return html`${toolName}(<span class="text-vs-text">${fileName}</span>,
						<span class="text-vs-text">${editCount} edits</span>)`;
				}
				return html`${toolName}`;
			case "NotebookRead":
				return input?.notebook_path
					? html`${toolName}(<span class="text-vs-text">${unescapeHtml(input.notebook_path).split("/").pop()}</span
							>)`
					: html`${toolName}`;
			case "NotebookEdit":
				if (input?.notebook_path && input?.cell_number !== undefined) {
					const fileName = unescapeHtml(input.notebook_path).split("/").pop();
					const cellNum = input.cell_number;
					const mode = input?.edit_mode || "replace";
					return html`${toolName}(<span class="text-vs-text">${fileName}</span>, cell
						<span class="text-vs-text">${cellNum}</span>, <span class="text-vs-text">${mode}</span>)`;
				}
				return html`${toolName}`;
			default:
				return html`${toolName}`;
		}
	}

	private renderToolUseContent(toolUse: any): TemplateResult {
		const toolName = toolUse.name;
		const input = toolUse.input;

		// HTML unescape function
		const unescapeHtml = (str: string): string => {
			const div = document.createElement("div");
			div.innerHTML = str;
			return div.textContent || div.innerText || "";
		};

		if (toolName === "TodoWrite" && input?.todos) {
			const todos = input.todos;

			return html`
				<div class="overflow-x-auto">
					${todos.map((todo: any) => {
						const statusClass =
							todo.status === "completed"
								? "line-through text-vs-text"
								: todo.status === "in_progress"
									? "text-green-400"
									: "text-vs-muted";

						return html`
							<div class="mb-1 overflow-hidden whitespace-nowrap text-ellipsis ${statusClass}">
								• ${todo.content}
							</div>
						`;
					})}
				</div>
			`;
		}

		if (toolName === "NotebookEdit" && input?.new_source) {
			const content = unescapeHtml(input.new_source);

			return html`
				<div class="overflow-x-auto">
					<pre class="whitespace-pre text-vs-text m-0">${content}</pre>
				</div>
			`;
		}

		if (toolName === "Write" && input?.content) {
			const content = unescapeHtml(input.content);

			return html`
				<div class="overflow-x-auto">
					<pre class="whitespace-pre text-vs-text m-0">${content}</pre>
				</div>
			`;
		}

		if (toolName === "MultiEdit" && input?.edits) {
			const edits = input.edits;

			return html`
				<div class="overflow-x-auto">
					${edits.map((edit: any, index: number) => {
						const oldStr = unescapeHtml(edit.old_string);
						const newStr = unescapeHtml(edit.new_string);

						// Split into lines for line-by-line diff
						const oldLines = oldStr.split("\n");
						const newLines = newStr.split("\n");
						const maxLines = Math.max(oldLines.length, newLines.length);

						const diffLines = [];
						for (let i = 0; i < maxLines; i++) {
							const oldLine = oldLines[i];
							const newLine = newLines[i];

							// Show removed lines
							if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
								diffLines.push(
									html`<div class="bg-red-600/20"><pre class="text-vs-text m-0">${oldLine}</pre></div>`,
								);
							}

							// Show added lines
							if (newLine !== undefined && (oldLine === undefined || oldLine !== newLine)) {
								diffLines.push(
									html`<div class="bg-green-600/20"><pre class="text-vs-text m-0">${newLine}</pre></div>`,
								);
							}

							// Show unchanged lines (if both exist and are the same)
							if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
								diffLines.push(html`<div><pre class="text-vs-text m-0">${oldLine}</pre></div>`);
							}
						}

						return html`
							<div class="mb-4">
								<div class="text-vs-muted mb-2">Edit ${index + 1}:</div>
								<div>${diffLines}</div>
							</div>
						`;
					})}
				</div>
			`;
		}

		if (toolName === "Edit" && input?.old_string && input?.new_string) {
			const oldStr = unescapeHtml(input.old_string);
			const newStr = unescapeHtml(input.new_string);

			// Split into lines for line-by-line diff
			const oldLines = oldStr.split("\n");
			const newLines = newStr.split("\n");
			const maxLines = Math.max(oldLines.length, newLines.length);

			const diffLines = [];
			for (let i = 0; i < maxLines; i++) {
				const oldLine = oldLines[i];
				const newLine = newLines[i];

				// Show removed lines
				if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
					diffLines.push(html`<div class="bg-red-600/20"><pre class="text-vs-text m-0">${oldLine}</pre></div>`);
				}

				// Show added lines
				if (newLine !== undefined && (oldLine === undefined || oldLine !== newLine)) {
					diffLines.push(html`<div class="bg-green-600/20"><pre class="text-vs-text m-0">${newLine}</pre></div>`);
				}

				// Show unchanged lines (if both exist and are the same)
				if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
					diffLines.push(html`<div><pre class="text-vs-text m-0">${oldLine}</pre></div>`);
				}
			}

			return html` <div class="overflow-x-auto">${diffLines}</div> `;
		}

		// Default: show JSON parameters
		return html`
			<div class="overflow-x-auto">
				<pre class="whitespace-pre">${JSON.stringify(input, null, 2)}</pre>
			</div>
		`;
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
