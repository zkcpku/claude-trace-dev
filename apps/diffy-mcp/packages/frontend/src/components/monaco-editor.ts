import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Monaco editor component wrapper (placeholder)
 */
@customElement("diffy-monaco-editor")
export class MonacoEditor extends LitElement {
	static styles = css`
		:host {
			display: block;
			width: 100%;
			height: 100%;
		}
	`;

	render() {
		return html`<div>Monaco Editor Component</div>`;
	}
}
