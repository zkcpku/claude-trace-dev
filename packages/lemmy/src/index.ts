import { AnthropicClient } from "./clients/anthropic.js";
import { GoogleClient } from "./clients/google.js";
import { OllamaClient } from "./clients/ollama.js";
import { OpenAIClient } from "./clients/openai.js";
import { AnthropicConfig, GoogleConfig, OllamaConfig, OpenAIConfig } from "./types.js";

// Main entry point for lemmy
export { Context } from "./context.js";
export * from "./models.js";
export * from "./model-registry.js";
export * from "./tools/index.js";
export * from "./types.js";

// Main lemmy object
export const lemmy = {
	anthropic: (config: AnthropicConfig) => new AnthropicClient(config),
	openai: (config: OpenAIConfig) => new OpenAIClient(config),
	google: (config: GoogleConfig) => new GoogleClient(config),
	ollama: (config: OllamaConfig) => new OllamaClient(config),
};
