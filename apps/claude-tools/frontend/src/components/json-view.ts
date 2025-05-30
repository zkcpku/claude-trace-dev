import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ProcessedPair } from "../utils/data";

@customElement("json-view")
export class JsonView extends LitElement {
	@property({ type: Array }) processedPairs: ProcessedPair[] = [];

	// Disable shadow DOM to use global CSS
	createRenderRoot() {
		return this;
	}

	render() {
		if (this.processedPairs.length === 0) {
			return html`<div>No processed pairs found.</div>`;
		}

		return html`
			${this.processedPairs.map(
				(pair, index) => html`
					<div>
						<div>
							Processed Pair ${index + 1} - ${pair.model} (${pair.isStreaming ? "streaming" : "non-streaming"})
						</div>

						<div>
							<div @click=${(e: Event) => this.toggleContent(e)}>
								<span>[-]</span>
								Request (MessageCreateParams)
							</div>
							<div>
								<div>${this.formatJson(pair.request)}</div>
							</div>
						</div>

						<div>
							<div @click=${(e: Event) => this.toggleContent(e)}>
								<span>[-]</span>
								Response (Message)${pair.isStreaming ? " - Reconstructed from SSE" : ""}
							</div>
							<div>
								<div>${this.formatJson(pair.response)}</div>
							</div>
						</div>
					</div>
				`,
			)}
		`;
	}

	private formatJson(obj: any): string {
		try {
			return JSON.stringify(obj, null, 2);
		} catch (e) {
			return `Error formatting JSON: ${e}`;
		}
	}

	private toggleContent(e: Event) {
		const header = e.currentTarget as HTMLElement;
		const toggle = header.querySelector("span") as HTMLElement;
		const content = header.nextElementSibling as HTMLElement;

		if (content && toggle) {
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
