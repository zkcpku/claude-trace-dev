import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * File tabs component (placeholder)
 */
@customElement("diffy-file-tabs")
export class FileTabs extends LitElement {
	static styles = css`
		:host {
			display: block;
		}
	`;

	render() {
		return html`<div>File Tabs Component</div>`;
	}
}
