// Core TUI interfaces and classes
export {
	TUI,
	Container,
	type Component,
	type ComponentRenderResult,
	type ContainerRenderResult,
	type Padding,
} from "./tui.js";

// Text editor component
export { TextEditor, type TextEditorConfig } from "./text-editor.js";

// Text component
export { TextComponent } from "./text-component.js";

// Markdown component
export { MarkdownComponent } from "./markdown-component.js";

// Logger for debugging
export { logger, type LoggerConfig } from "./logger.js";
