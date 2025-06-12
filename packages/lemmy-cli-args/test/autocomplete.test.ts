import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
	generateProviderCompletions,
	generateModelCompletions,
	generateOptionCompletions,
	generateEnumCompletions,
	generateContextualCompletions,
	generateCompletions,
	formatForShell,
	createCompletionFunction,
	getModelSuggestions,
} from "../src/autocomplete.js";
import type { AutocompleteConfig, CompletionContext } from "../src/autocomplete.js";
import type { Provider, ModelData } from "@mariozechner/lemmy";

// Mock model data for testing
const mockModelData: Record<string, ModelData> = {
	"claude-3-5-sonnet-20241022": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 200000,
		maxOutputTokens: 8192,
		pricing: { inputPerMillion: 3, outputPerMillion: 15 },
	},
	"gpt-4o": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 128000,
		maxOutputTokens: 16384,
		pricing: { inputPerMillion: 5, outputPerMillion: 15 },
	},
	"gemini-2.0-flash": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 1000000,
		maxOutputTokens: 8192,
		pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
	},
};

const mockModelToProvider: Record<string, Provider> = {
	"claude-3-5-sonnet-20241022": "anthropic",
	"gpt-4o": "openai",
	"gemini-2.0-flash": "google",
};

const MockBaseSchema = z.object({
	apiKey: z.string().describe("API key for authentication"),
	baseURL: z.string().optional().describe("Custom API base URL"),
});

const MockAnthropicSchema = z.object({
	model: z.string().describe("Anthropic model to use"),
	thinkingEnabled: z.coerce.boolean().optional().describe("Enable thinking mode"),
	toolChoice: z.enum(["auto", "any", "none"]).optional().describe("Tool choice strategy"),
});

const MockOpenAISchema = z.object({
	model: z.string().describe("OpenAI model to use"),
	reasoningEffort: z.enum(["low", "medium", "high"]).optional().describe("Reasoning effort level"),
});

const mockSchemas = {
	base: MockBaseSchema,
	anthropic: MockAnthropicSchema,
	openai: MockOpenAISchema,
};

const mockConfig: AutocompleteConfig = {
	modelConfig: {
		allowUnknownModels: true,
		modelRegistries: {
			anthropic: { "claude-3-5-sonnet-20241022": mockModelData["claude-3-5-sonnet-20241022"] },
			openai: { "gpt-4o": mockModelData["gpt-4o"] },
			google: { "gemini-2.0-flash": mockModelData["gemini-2.0-flash"] },
		},
		modelToProvider: mockModelToProvider,
	},
	schemas: mockSchemas,
	maxSuggestions: 10,
};

describe("Autocomplete Generation", () => {
	describe("generateProviderCompletions", () => {
		it("should generate completions for all valid providers", () => {
			const completions = generateProviderCompletions(mockConfig);

			expect(completions).toHaveLength(3);

			const providerValues = completions.map((c) => c.value);
			expect(providerValues).toContain("anthropic");
			expect(providerValues).toContain("openai");
			expect(providerValues).toContain("google");

			// Check completion structure
			const anthropicCompletion = completions.find((c) => c.value === "anthropic");
			expect(anthropicCompletion).toMatchObject({
				value: "anthropic",
				label: "anthropic",
				description: "Anthropic provider",
				type: "provider",
			});
		});
	});

	describe("generateModelCompletions", () => {
		it("should generate completions for provider models", () => {
			const completions = generateModelCompletions("anthropic", mockConfig);

			expect(completions.length).toBeGreaterThan(0);
			expect(completions[0].value).toBe("claude-3-5-sonnet-20241022");
			expect(completions[0].type).toBe("model");
			expect(completions[0].description).toContain("anthropic model");
			expect(completions[0].description).toContain("🔧 tools");
			expect(completions[0].description).toContain("🖼️ images");
		});

		it("should filter models by text", () => {
			const allCompletions = generateModelCompletions("anthropic", mockConfig);
			const filteredCompletions = generateModelCompletions("anthropic", mockConfig, "sonnet");

			expect(filteredCompletions.length).toBeLessThanOrEqual(allCompletions.length);
			expect(filteredCompletions.every((c) => c.value.toLowerCase().includes("sonnet"))).toBe(true);
		});

		it("should respect maxSuggestions limit", () => {
			const limitedConfig = { ...mockConfig, maxSuggestions: 1 };
			const completions = generateModelCompletions("anthropic", limitedConfig);

			expect(completions.length).toBeLessThanOrEqual(1);
		});

		it("should handle providers with no models", () => {
			const emptyConfig = {
				...mockConfig,
				modelConfig: {
					...mockConfig.modelConfig,
					modelRegistries: { anthropic: {}, openai: {}, google: {} },
				},
			};

			const completions = generateModelCompletions("anthropic", emptyConfig);
			expect(completions).toHaveLength(0);
		});
	});

	describe("generateOptionCompletions", () => {
		it("should generate completions for provider options", () => {
			const completions = generateOptionCompletions("anthropic", mockConfig);

			const optionValues = completions.map((c) => c.value);
			expect(optionValues).toContain("--apiKey");
			expect(optionValues).toContain("--model");
			expect(optionValues).toContain("--thinkingEnabled");
			expect(optionValues).toContain("--toolChoice");

			// Check completion structure
			const modelOption = completions.find((c) => c.value === "--model");
			expect(modelOption).toMatchObject({
				value: "--model",
				label: "--model",
				type: "option",
			});
		});

		it("should filter options by text", () => {
			const allCompletions = generateOptionCompletions("anthropic", mockConfig);
			const filteredCompletions = generateOptionCompletions("anthropic", mockConfig, "think");

			expect(filteredCompletions.length).toBeLessThanOrEqual(allCompletions.length);
			expect(filteredCompletions.every((c) => c.value.toLowerCase().includes("think"))).toBe(true);
		});

		it("should include base schema options", () => {
			const completions = generateOptionCompletions("anthropic", mockConfig);

			const optionValues = completions.map((c) => c.value);
			expect(optionValues).toContain("--apiKey");
			expect(optionValues).toContain("--baseURL");
		});
	});

	describe("generateEnumCompletions", () => {
		it("should generate completions for enum fields", () => {
			const completions = generateEnumCompletions("anthropic", "toolChoice", mockConfig);

			expect(completions).toHaveLength(3);

			const values = completions.map((c) => c.value);
			expect(values).toContain("auto");
			expect(values).toContain("any");
			expect(values).toContain("none");

			// Check completion structure
			expect(completions[0]).toMatchObject({
				value: "auto",
				label: "auto",
				description: "toolChoice option",
				type: "enum_value",
			});
		});

		it("should return empty array for non-enum fields", () => {
			const completions = generateEnumCompletions("anthropic", "model", mockConfig);
			expect(completions).toHaveLength(0);
		});

		it("should filter enum values by text", () => {
			const allCompletions = generateEnumCompletions("anthropic", "toolChoice", mockConfig);
			const filteredCompletions = generateEnumCompletions("anthropic", "toolChoice", mockConfig, "a");

			expect(filteredCompletions.length).toBeLessThanOrEqual(allCompletions.length);
			expect(filteredCompletions.every((c) => c.value.toLowerCase().includes("a"))).toBe(true);
		});
	});

	describe("generateContextualCompletions", () => {
		it("should complete providers when no args", () => {
			const context: CompletionContext = {
				args: [],
				cursorPosition: 0,
				partial: "",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			expect(completions.every((c) => c.type === "provider")).toBe(true);
			expect(completions.map((c) => c.value)).toContain("anthropic");
		});

		it("should complete models for second argument", () => {
			const context: CompletionContext = {
				args: ["anthropic"],
				cursorPosition: 1,
				partial: "claude",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			expect(completions.every((c) => c.type === "model")).toBe(true);
			expect(completions.every((c) => c.value.toLowerCase().includes("claude"))).toBe(true);
		});

		it("should complete options when partial starts with --", () => {
			const context: CompletionContext = {
				args: ["anthropic", "claude-3-5-sonnet-20241022"],
				cursorPosition: 2,
				partial: "--think",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			expect(completions.every((c) => c.type === "option")).toBe(true);
			expect(completions.every((c) => c.value.toLowerCase().includes("think"))).toBe(true);
		});

		it("should complete enum values after enum option", () => {
			const context: CompletionContext = {
				args: ["anthropic", "claude-3-5-sonnet-20241022", "--toolChoice"],
				cursorPosition: 3,
				partial: "a",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			expect(completions.every((c) => c.type === "enum_value")).toBe(true);
			expect(completions.every((c) => c.value.toLowerCase().includes("a"))).toBe(true);
		});

		it("should default to options for unknown context", () => {
			const context: CompletionContext = {
				args: ["anthropic", "some-model", "random-arg"],
				cursorPosition: 3,
				partial: "",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			expect(completions.every((c) => c.type === "option")).toBe(true);
		});

		it("should handle invalid provider gracefully", () => {
			const context: CompletionContext = {
				args: ["invalid-provider"],
				cursorPosition: 1,
				partial: "",
			};

			const completions = generateContextualCompletions(context, mockConfig);

			// Should fall back to provider completions
			expect(completions.every((c) => c.type === "provider")).toBe(true);
		});
	});

	describe("generateCompletions", () => {
		it("should parse command line and generate contextual completions", () => {
			const completions = generateCompletions("anthropic ", mockConfig);

			// Should complete models after provider
			expect(completions.every((c) => c.type === "model")).toBe(true);
		});

		it("should handle partial words at end", () => {
			const completions = generateCompletions("anthropic claude", mockConfig);

			// Should complete models matching "claude"
			expect(completions.every((c) => c.type === "model")).toBe(true);
			expect(completions.every((c) => c.value.toLowerCase().includes("claude"))).toBe(true);
		});

		it("should handle options", () => {
			const completions = generateCompletions("anthropic claude-3-5-sonnet-20241022 --think", mockConfig);

			// Should complete options matching "think"
			expect(completions.every((c) => c.type === "option")).toBe(true);
			expect(completions.every((c) => c.value.toLowerCase().includes("think"))).toBe(true);
		});
	});

	describe("formatForShell", () => {
		const sampleCompletions = [
			{ value: "anthropic", label: "anthropic", description: "Anthropic provider", type: "provider" as const },
			{ value: "openai", label: "openai", description: "OpenAI provider", type: "provider" as const },
		];

		it("should format for bash", () => {
			const formatted = formatForShell(sampleCompletions, "bash");
			expect(formatted).toBe("anthropic openai");
		});

		it("should format for zsh", () => {
			const formatted = formatForShell(sampleCompletions, "zsh");
			expect(formatted).toBe("anthropic:Anthropic provider\nopenai:OpenAI provider");
		});

		it("should format for fish", () => {
			const formatted = formatForShell(sampleCompletions, "fish");
			expect(formatted).toBe("anthropic\tAnthropic provider\nopenai\tOpenAI provider");
		});

		it("should default to bash format", () => {
			const formatted = formatForShell(sampleCompletions);
			expect(formatted).toBe("anthropic openai");
		});
	});

	describe("createCompletionFunction", () => {
		it("should create a function that returns completion values", () => {
			const completionFn = createCompletionFunction(mockConfig);

			const values = completionFn("anthropic ");
			expect(values).toBeInstanceOf(Array);
			expect(values.length).toBeGreaterThan(0);
			expect(values.every((v) => typeof v === "string")).toBe(true);
		});
	});

	describe("getModelSuggestions", () => {
		it("should get models for provider", () => {
			const suggestions = getModelSuggestions("anthropic", mockConfig);

			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions.every((s) => s.type === "model")).toBe(true);
		});

		it("should filter by capabilities", () => {
			const suggestions = getModelSuggestions("anthropic", mockConfig, {
				tools: true,
				images: true,
				minContextWindow: 150000,
			});

			// All mock models meet these requirements
			expect(suggestions.length).toBeGreaterThan(0);
		});

		it("should filter out models not meeting requirements", () => {
			const suggestions = getModelSuggestions("anthropic", mockConfig, {
				minContextWindow: 500000, // Very high requirement
			});

			// No models should meet this requirement
			expect(suggestions.length).toBe(0);
		});
	});

	describe("edge cases and error handling", () => {
		it("should handle empty command line", () => {
			const completions = generateCompletions("", mockConfig);

			expect(completions.every((c) => c.type === "provider")).toBe(true);
		});

		it("should handle whitespace-only command line", () => {
			const completions = generateCompletions("   ", mockConfig);

			expect(completions.every((c) => c.type === "provider")).toBe(true);
		});

		it("should handle config with no schemas", () => {
			const emptyConfig = {
				...mockConfig,
				schemas: {},
			};

			const completions = generateOptionCompletions("anthropic", emptyConfig);
			expect(completions).toHaveLength(0);
		});

		it("should handle missing model registry", () => {
			const emptyConfig = {
				...mockConfig,
				modelConfig: {
					...mockConfig.modelConfig,
					modelRegistries: {},
				},
			};

			const completions = generateModelCompletions("anthropic", emptyConfig);
			expect(completions).toHaveLength(0);
		});
	});
});
