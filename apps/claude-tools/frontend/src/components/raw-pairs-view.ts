import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { RawPair } from "../types/claude-data";

@customElement("raw-pairs-view")
export class RawPairsView extends LitElement {
	@property({ type: Array }) rawPairs: RawPair[] = [];

	// Disable shadow DOM to use global Tailwind styles
	createRenderRoot() {
		return this;
	}

	render() {
		if (this.rawPairs.length === 0) {
			return html`<div class="text-muted">No raw pairs found.</div>`;
		}

		return html`
			${this.rawPairs.map(
				(pair, index) => html`
					<div class="raw-pair">
						<div class="raw-pair-header">
							Raw Pair ${index + 1} - ${pair.request.method} ${this.getUrlPath(pair.request.url)}
							(${pair.response.status})
						</div>

						<div class="raw-content">
							<div class="expandable-header" @click=${(e: Event) => this.toggleContent(e)}>
								<span class="expandable-toggle">[+]</span>
								Request
							</div>
							<div class="expandable-content hidden">
								<div class="raw-json">${this.formatJson(pair.request)}</div>
							</div>
						</div>

						<div class="raw-content">
							<div class="expandable-header" @click=${(e: Event) => this.toggleContent(e)}>
								<span class="expandable-toggle">[+]</span>
								Response
							</div>
							<div class="expandable-content hidden">
								<div class="raw-json">${this.formatJson(pair.response)}</div>
							</div>
						</div>

						${pair.response.events && pair.response.events.length > 0
							? html`
									<div class="raw-content">
										<div class="expandable-header" @click=${(e: Event) => this.toggleContent(e)}>
											<span class="expandable-toggle">[+]</span>
											SSE Events (${pair.response.events.length})
										</div>
										<div class="expandable-content hidden">
											<div class="sse-structure">${this.formatJson(pair.response.events)}</div>
										</div>
									</div>
								`
							: ""}
					</div>
				`,
			)}
		`;
	}

	private getUrlPath(url: string): string {
		try {
			return new URL(url).pathname;
		} catch {
			return url;
		}
	}

	private formatJson(obj: any): string {
		try {
			return JSON.stringify(obj, null, 2);
		} catch {
			return String(obj);
		}
	}

	private toggleContent(e: Event) {
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
