import { describe, it, expect } from "vitest";
import {
	validateProvider,
	getValidProviders,
	validateProviderAndModel,
	filterProviders,
	getProviderValidationError,
	exhaustiveProviderSwitch,
	findModelData,
	getModelProvider,
	getCapableModels,
} from "../src/provider-validation.js";
import type { Provider, ModelData } from "@mariozechner/lemmy";
import type { ModelValidationConfig } from "../src/provider-validation.js";

// Mock model data for testing
const mockAnthropicModels: Record<string, ModelData> = {
	"claude-3-5-sonnet-20241022": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 200000,
		maxOutputTokens: 8192,
		pricing: {
			inputPerMillion: 3,
			outputPerMillion: 15,
		},
	},
	"claude-3-haiku-20240307": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 200000,
		maxOutputTokens: 4096,
		pricing: {
			inputPerMillion: 0.25,
			outputPerMillion: 1.25,
		},
	},
};

const mockOpenAIModels: Record<string, ModelData> = {
	"gpt-4o": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 128000,
		maxOutputTokens: 16384,
		pricing: {
			inputPerMillion: 5,
			outputPerMillion: 15,
		},
	},
	"gpt-4o-mini": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 128000,
		maxOutputTokens: 16384,
		pricing: {
			inputPerMillion: 0.15,
			outputPerMillion: 0.6,
		},
	},
};

const mockGoogleModels: Record<string, ModelData> = {
	"gemini-2.0-flash": {
		supportsTools: true,
		supportsImageInput: true,
		contextWindow: 1000000,
		maxOutputTokens: 8192,
		pricing: {
			inputPerMillion: 0.075,
			outputPerMillion: 0.3,
		},
	},
};

const mockModelToProvider: Record<string, Provider> = {
	"claude-3-5-sonnet-20241022": "anthropic",
	"claude-3-haiku-20240307": "anthropic",
	"gpt-4o": "openai",
	"gpt-4o-mini": "openai",
	"gemini-2.0-flash": "google",
};

const mockConfig: ModelValidationConfig = {
	allowUnknownModels: true,
	modelRegistries: {
		anthropic: mockAnthropicModels,
		openai: mockOpenAIModels,
		google: mockGoogleModels,
	},
	modelToProvider: mockModelToProvider,
};

describe("Provider Validation", () => {
	describe("validateProvider", () => {
		it("should validate known providers", () => {
			const validProviders = getValidProviders();

			expect(validateProvider("anthropic", validProviders)).toBe(true);
			expect(validateProvider("openai", validProviders)).toBe(true);
			expect(validateProvider("google", validProviders)).toBe(true);
		});

		it("should reject unknown providers", () => {
			const validProviders = getValidProviders();

			expect(validateProvider("unknown", validProviders)).toBe(false);
			expect(validateProvider("", validProviders)).toBe(false);
			expect(validateProvider("mistral", validProviders)).toBe(false);
		});

		it("should be case sensitive", () => {
			const validProviders = getValidProviders();

			expect(validateProvider("Anthropic", validProviders)).toBe(false);
			expect(validateProvider("OPENAI", validProviders)).toBe(false);
			expect(validateProvider("Google", validProviders)).toBe(false);
		});
	});

	describe("getValidProviders", () => {
		it("should return all valid providers", () => {
			const providers = getValidProviders();

			expect(providers).toEqual(["anthropic", "openai", "google"]);
			expect(providers).toHaveLength(3);
		});

		it("should ensure exhaustive type checking", () => {
			const providers = getValidProviders();

			// This test ensures that if a new Provider is added to the union type,
			// the getValidProviders function will fail at compile time until updated
			const expectedProviders: Provider[] = ["anthropic", "openai", "google"];
			expect(providers).toEqual(expectedProviders);
		});
	});

	describe("filterProviders", () => {
		it("should filter out specified providers", () => {
			const allProviders = getValidProviders();
			const nonAnthropicProviders = filterProviders(allProviders, ["anthropic"]);

			expect(nonAnthropicProviders).toEqual(["openai", "google"]);
			expect(nonAnthropicProviders).not.toContain("anthropic");
		});

		it("should handle multiple exclusions", () => {
			const allProviders = getValidProviders();
			const filtered = filterProviders(allProviders, ["anthropic", "google"]);

			expect(filtered).toEqual(["openai"]);
		});

		it("should return all providers when excluding none", () => {
			const allProviders = getValidProviders();
			const filtered = filterProviders(allProviders, []);

			expect(filtered).toEqual(allProviders);
		});
	});

	describe("exhaustiveProviderSwitch", () => {
		it("should handle all provider cases", () => {
			const anthropicResult = exhaustiveProviderSwitch("anthropic", {
				anthropic: () => "anthropic-result",
				openai: () => "openai-result",
				google: () => "google-result",
			});

			const openaiResult = exhaustiveProviderSwitch("openai", {
				anthropic: () => "anthropic-result",
				openai: () => "openai-result",
				google: () => "google-result",
			});

			const googleResult = exhaustiveProviderSwitch("google", {
				anthropic: () => "anthropic-result",
				openai: () => "openai-result",
				google: () => "google-result",
			});

			expect(anthropicResult).toBe("anthropic-result");
			expect(openaiResult).toBe("openai-result");
			expect(googleResult).toBe("google-result");
		});

		it("should be type-safe and exhaustive", () => {
			// This test ensures that if a new Provider is added,
			// TypeScript will require all switch cases to be updated
			const result = exhaustiveProviderSwitch("anthropic", {
				anthropic: () => 1,
				openai: () => 2,
				google: () => 3,
				// If a new provider is added to the Provider union,
				// TypeScript will require it to be handled here
			});

			expect(result).toBe(1);
		});
	});

	describe("findModelData", () => {
		it("should find model data in registries", () => {
			const claudeData = findModelData("claude-3-5-sonnet-20241022", mockConfig.modelRegistries);
			const gptData = findModelData("gpt-4o", mockConfig.modelRegistries);
			const geminiData = findModelData("gemini-2.0-flash", mockConfig.modelRegistries);

			expect(claudeData).toEqual(mockAnthropicModels["claude-3-5-sonnet-20241022"]);
			expect(gptData).toEqual(mockOpenAIModels["gpt-4o"]);
			expect(geminiData).toEqual(mockGoogleModels["gemini-2.0-flash"]);
		});

		it("should return undefined for unknown models", () => {
			const unknownData = findModelData("unknown-model", mockConfig.modelRegistries);
			expect(unknownData).toBeUndefined();
		});
	});

	describe("getModelProvider", () => {
		it("should return correct provider for known models", () => {
			expect(getModelProvider("claude-3-5-sonnet-20241022", mockModelToProvider)).toBe("anthropic");
			expect(getModelProvider("gpt-4o", mockModelToProvider)).toBe("openai");
			expect(getModelProvider("gemini-2.0-flash", mockModelToProvider)).toBe("google");
		});

		it("should return undefined for unknown models", () => {
			expect(getModelProvider("unknown-model", mockModelToProvider)).toBeUndefined();
		});
	});

	describe("getCapableModels", () => {
		it("should return models grouped by provider", () => {
			const capableModels = getCapableModels(mockConfig);

			expect(capableModels).toHaveProperty("anthropic");
			expect(capableModels).toHaveProperty("openai");
			expect(capableModels).toHaveProperty("google");

			expect(capableModels.anthropic).toContain("claude-3-5-sonnet-20241022");
			expect(capableModels.openai).toContain("gpt-4o");
			expect(capableModels.google).toContain("gemini-2.0-flash");
		});

		it("should filter by capabilities", () => {
			const configWithRequirements: ModelValidationConfig = {
				...mockConfig,
				requiredCapabilities: {
					tools: true,
					images: true,
					minContextWindow: 150000,
				},
			};

			const capableModels = getCapableModels(configWithRequirements);

			// Only models with context window >= 150000 should be included
			expect(capableModels.anthropic).toContain("claude-3-5-sonnet-20241022");
			expect(capableModels.google).toContain("gemini-2.0-flash");
			// OpenAI models have 128000 context window, so should be excluded
			expect(capableModels.openai).toEqual([]);
		});

		it("should filter by target provider", () => {
			const anthropicModels = getCapableModels(mockConfig, "anthropic");

			expect(anthropicModels.anthropic.length).toBeGreaterThan(0);
			expect(anthropicModels.openai).toEqual([]);
			expect(anthropicModels.google).toEqual([]);
		});
	});

	describe("validateProviderAndModel", () => {
		it("should validate known provider and model", () => {
			const result = validateProviderAndModel("anthropic", "claude-3-5-sonnet-20241022", mockConfig);

			expect(result).not.toBeNull();
			expect(result!.provider).toBe("anthropic");
			expect(result!.model).toBe("claude-3-5-sonnet-20241022");
			expect(result!.isKnown).toBe(true);
			expect(result!.modelData).toEqual(mockAnthropicModels["claude-3-5-sonnet-20241022"]);
			expect(result!.warnings).toHaveLength(0);
		});

		it("should handle unknown providers", () => {
			const result = validateProviderAndModel("unknown", "some-model", mockConfig);
			expect(result).toBeNull();
		});

		it("should handle unknown models with warnings", () => {
			const result = validateProviderAndModel("anthropic", "unknown-model", mockConfig);

			expect(result).not.toBeNull();
			expect(result!.provider).toBe("anthropic");
			expect(result!.model).toBe("unknown-model");
			expect(result!.isKnown).toBe(false);
			expect(result!.warnings).toContain("Unknown model: unknown-model");
			expect(result!.warnings).toContain("Model capabilities cannot be validated");
		});

		it("should warn about provider mismatch", () => {
			const result = validateProviderAndModel("openai", "claude-3-5-sonnet-20241022", mockConfig);

			expect(result).not.toBeNull();
			expect(result!.warnings).toContain("Model claude-3-5-sonnet-20241022 belongs to anthropic, not openai");
		});

		it("should validate required capabilities", () => {
			const configWithRequirements: ModelValidationConfig = {
				...mockConfig,
				requiredCapabilities: {
					tools: true,
					images: true,
					minContextWindow: 300000, // Higher than any mock model
				},
			};

			const result = validateProviderAndModel("anthropic", "claude-3-5-sonnet-20241022", configWithRequirements);

			expect(result).not.toBeNull();
			expect(result!.warnings.some((w) => w.includes("context window"))).toBe(true);
		});

		it("should respect allowUnknownModels setting", () => {
			const strictConfig: ModelValidationConfig = {
				...mockConfig,
				allowUnknownModels: false,
			};

			const result = validateProviderAndModel("anthropic", "unknown-model", strictConfig);

			expect(result).not.toBeNull();
			expect(result!.warnings).toContain("Unknown models are not allowed");
		});
	});

	describe("getProviderValidationError", () => {
		it("should generate helpful error messages", () => {
			const error = getProviderValidationError("unknown");

			expect(error).toContain("Invalid provider: unknown");
			expect(error).toContain("Valid providers: anthropic, openai, google");
		});
	});
});
