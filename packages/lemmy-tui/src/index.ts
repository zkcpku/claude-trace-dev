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

// Select list component
export { SelectList, type SelectItem } from "./select-list.js";

// Autocomplete support
export {
	type AutocompleteProvider,
	type AutocompleteItem,
	type SlashCommand,
	CombinedAutocompleteProvider,
} from "./autocomplete.js";

// Logger for debugging
export { logger, type LoggerConfig } from "./logger.js";
