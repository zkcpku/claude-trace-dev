// Core functionality exports
export * from "./schema-introspection.js";
export * from "./provider-validation.js";
export * from "./command-generation.js";
export * from "./autocomplete.js";

// Re-export types from lemmy core that are commonly used
export type { Provider, ModelData } from "@mariozechner/lemmy";

// Convenience exports for complete CLI functionality
export {
	createCompleteModelsCommand,
	createCompleteProviderCommand,
	createCompleteProviderCommands,
	type CLIApplicationConfig,
} from "./command-generation.js";
