import { describe, it, expect, beforeEach } from "vitest";
import { AnthropicClient } from "../../src/clients/anthropic.js";
import { Context } from "../../src/context.js";
import type { AnthropicConfig } from "../../src/configs.js";
import { sharedClientTests } from "./shared-client-tests.js";
import { AllModels } from "../../src/generated/models.js";

describe("AnthropicClient", () => {
	if (!process.env["ANTHROPIC_API_KEY"]) {
		throw new Error("ANTHROPIC_API_KEY environment variable is required for Anthropic tests");
	}

	const createClient = (withThinking = false, apiKey?: string, withImageInput = false) => {
		let config: AnthropicConfig = {
			apiKey: process.env["ANTHROPIC_API_KEY"]!,
			model: "claude-3-5-sonnet-20241022",
			defaults: {
				temperature: 0,
			},
		};

		if (withThinking || withImageInput) {
			config.model = "claude-sonnet-4-20250514";
		}

		if (config.defaults && withThinking) {
			config.defaults.thinkingEnabled = true;
			config.defaults.maxThinkingTokens = 3000;
		}

		if (apiKey) {
			config.apiKey = apiKey;
		}

		return new AnthropicClient(config);
	};

	// Run shared tests
	sharedClientTests(createClient);

	// Provider-specific setup for remaining tests
	let client: AnthropicClient;
	let context: Context;

	beforeEach(() => {
		client = createClient();
		context = new Context();
	});

	// Anthropic-specific tests (truly unique functionality)

	describe("anthropic-specific thinking features", () => {
		it("should handle thinking request on non-thinking model gracefully", async () => {
			// Test with Claude 3.5 Sonnet (current testConfig model) which doesn't support thinking
			const nonThinkingClient = new AnthropicClient({
				apiKey: process.env["ANTHROPIC_API_KEY"]!,
				model: "claude-3-5-sonnet-20241022",
				defaults: {
					temperature: 0,
					thinkingEnabled: true,
					maxThinkingTokens: 2000,
				},
			});

			const result = await nonThinkingClient.ask("What is 15 * 23?", { context });

			// Should get a model error indicating thinking is not supported
			expect(result.type).toBe("error");
			if (result.type === "error") {
				expect(result.error.type).toBe("invalid_request");
				console.log("✓ Correctly rejected thinking request for non-thinking model");
			}
		}, 10000);
	});
});
