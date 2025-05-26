import { describe, it, expect } from "vitest";
import {
	AnthropicModels,
	OpenAIModels,
	GoogleModels,
	AllModels,
	AnthropicModelData,
	OpenAIModelData,
	GoogleModelData,
	ModelToProvider,
	findModelData,
	type ModelData,
} from "../src/model-registry.js";

describe("Model Registry", () => {
	describe("Type definitions", () => {
		it("should have proper type definitions for all providers", () => {
			// Test that types exist and can be used
			const anthropicModel: AnthropicModels = "claude-3-5-sonnet-20241022";
			const openaiModel: OpenAIModels = "gpt-4o";
			const googleModel: GoogleModels = "gemini-1.5-pro";

			expect(anthropicModel).toBeDefined();
			expect(openaiModel).toBeDefined();
			expect(googleModel).toBeDefined();
		});

		it("should include all provider types in AllModels union", () => {
			// Test that AllModels union includes all provider types
			const models: AllModels[] = ["claude-3-5-sonnet-20241022", "gpt-4o", "gemini-1.5-pro"];

			expect(models).toHaveLength(3);
		});
	});

	describe("Model data objects", () => {
		it("should have valid model data for popular models", () => {
			// Test Anthropic models
			expect(AnthropicModelData["claude-3-5-sonnet-20241022"]).toMatchObject({
				contextWindow: expect.any(Number),
				maxOutputTokens: expect.any(Number),
				supportsTools: true,
				pricing: {
					inputPerMillion: expect.any(Number),
					outputPerMillion: expect.any(Number),
				},
			});

			// Test OpenAI models
			expect(OpenAIModelData["gpt-4o"]).toMatchObject({
				contextWindow: expect.any(Number),
				maxOutputTokens: expect.any(Number),
				supportsTools: true,
				supportsImageInput: true,
				pricing: expect.any(Object),
			});

			// Test Google models
			expect(GoogleModelData["gemini-1.5-pro"]).toMatchObject({
				contextWindow: expect.any(Number),
				maxOutputTokens: expect.any(Number),
				supportsTools: true,
				pricing: expect.any(Object),
			});
		});

		it("should have realistic pricing data", () => {
			const claudeData = AnthropicModelData["claude-3-5-sonnet-20241022"];
			if (claudeData.pricing) {
				expect(claudeData.pricing.inputPerMillion).toBeGreaterThan(0);
				expect(claudeData.pricing.outputPerMillion).toBeGreaterThan(0);
				expect(claudeData.pricing.outputPerMillion).toBeGreaterThanOrEqual(claudeData.pricing.inputPerMillion);
			}
		});

		it("should have reasonable context windows", () => {
			const claudeData = AnthropicModelData["claude-3-5-sonnet-20241022"];
			expect(claudeData.contextWindow).toBeGreaterThan(1000);
			expect(claudeData.contextWindow).toBeLessThan(10000000); // Reasonable upper bound
		});
	});

	describe("ModelToProvider mapping", () => {
		it("should correctly map models to providers", () => {
			expect(ModelToProvider["claude-3-5-sonnet-20241022"]).toBe("anthropic");
			expect(ModelToProvider["gpt-4o"]).toBe("openai");
			expect(ModelToProvider["gemini-1.5-pro"]).toBe("google");
		});

		it("should have mappings for all models in model data objects", () => {
			// Check that every model in data objects has a provider mapping
			const anthropicModels = Object.keys(AnthropicModelData);
			const openaiModels = Object.keys(OpenAIModelData);
			const googleModels = Object.keys(GoogleModelData);

			for (const model of anthropicModels) {
				expect(ModelToProvider[model as keyof typeof ModelToProvider]).toBe("anthropic");
			}

			for (const model of openaiModels) {
				expect(ModelToProvider[model as keyof typeof ModelToProvider]).toBe("openai");
			}

			for (const model of googleModels) {
				expect(ModelToProvider[model as keyof typeof ModelToProvider]).toBe("google");
			}
		});
	});

	describe("findModelData helper function", () => {
		it("should find data for valid models", () => {
			const claudeData = findModelData("claude-3-5-sonnet-20241022");
			expect(claudeData).toBeDefined();
			expect(claudeData?.supportsTools).toBe(true);

			const gptData = findModelData("gpt-4o");
			expect(gptData).toBeDefined();
			expect(gptData?.contextWindow).toBeGreaterThan(0);

			const geminiData = findModelData("gemini-1.5-pro");
			expect(geminiData).toBeDefined();
			expect(geminiData?.maxOutputTokens).toBeGreaterThan(0);
		});

		it("should return undefined for unknown models", () => {
			const unknownData = findModelData("unknown-model-123");
			expect(unknownData).toBeUndefined();
		});

		it("should return data with correct interface", () => {
			const data = findModelData("claude-3-5-sonnet-20241022");
			if (data) {
				// Verify it matches ModelData interface
				expect(typeof data.contextWindow).toBe("number");
				expect(typeof data.maxOutputTokens).toBe("number");
				expect(typeof data.supportsTools).toBe("boolean");
				expect(data.pricing).toBeDefined();
			}
		});
	});

	describe("Model registry completeness", () => {
		it("should have at least some models for each provider", () => {
			expect(Object.keys(AnthropicModelData).length).toBeGreaterThan(5);
			expect(Object.keys(OpenAIModelData).length).toBeGreaterThan(10);
			expect(Object.keys(GoogleModelData).length).toBeGreaterThan(10);
		});

		it("should include latest models for each provider", () => {
			// Check for some expected latest models
			expect(AnthropicModelData["claude-3-5-sonnet-latest"]).toBeDefined();
			expect(OpenAIModelData["gpt-4o"]).toBeDefined();
			expect(GoogleModelData["gemini-1.5-pro"]).toBeDefined();
		});
	});
});
