import { describe, it, expect, beforeEach } from "vitest";
import { OpenAIClient } from "../../src/clients/openai.js";
import { Context } from "../../src/context.js";
import type { OpenAIConfig } from "../../src/configs.js";
import { sharedClientTests } from "./shared-client-tests.js";

describe("OpenAIClient", () => {
	if (!process.env["OPENAI_API_KEY"]) {
		throw new Error("OPENAI_API_KEY environment variable is required for OpenAI tests");
	}

	const testConfig: OpenAIConfig = {
		apiKey: process.env["OPENAI_API_KEY"]!,
		model: "gpt-4o",
	};

	const createClient = (withThinking = false, apiKey?: string, withImageInput = false) => {
		let model = testConfig.model;
		let config: OpenAIConfig = {
			...testConfig,
			defaults: {
				temperature: 0,
			},
		};

		if (withThinking) {
			// o4-mini supports reasoning (thinking)
			model = "o4-mini";
			config.model = model;
			config.defaults = {
				// Remove temperature for reasoning models - they only support default (1)
				reasoningEffort: "medium" as const,
			};
		} else if (withImageInput) {
			// o4-mini supports image input
			model = "o4-mini";
			config.model = model;
		}

		if (apiKey) {
			config.apiKey = apiKey;
		}

		return new OpenAIClient(config);
	};

	// Run shared tests
	sharedClientTests(createClient);

	// OpenAI-specific tests (truly unique functionality)
	describe("openai-specific features", () => {
		it("should handle streaming properly without reasoning chunks for non-reasoning models", async () => {
			const client = createClient();
			const context = new Context();
			const chunks: string[] = [];

			const result = await client.ask("Count from 1 to 3", {
				context,
				onChunk: (chunk) => chunks.push(chunk),
			});

			expect(result.type).toBe("success");
			expect(chunks.length).toBeGreaterThan(0);

			if (result.type === "success") {
				expect(result.message.thinking).toBeUndefined();
				expect(chunks.join("")).toBe(result.message.content);
			}
		}, 10000);
	});
});
