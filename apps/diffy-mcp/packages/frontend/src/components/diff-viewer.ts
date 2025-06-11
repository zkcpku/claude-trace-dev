import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Diff viewer component (placeholder)
 */
@customElement("diffy-diff-viewer")
export class DiffViewer extends LitElement {
	static styles = css`
		:host {
			display: block;
		}
	`;

	render() {
		return html`<div>Diff Viewer Component</div>`;
	}
}
