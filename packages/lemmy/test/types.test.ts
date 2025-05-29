import { describe, it, expect } from "vitest";
import type { ChatClient, AskResult } from "../src/types.js";
import type { AskOptions } from "../src/types.js";

describe("types", () => {
	it("should have proper type definitions", () => {
		// Basic type checking test - ensures types are properly exported
		const options: AskOptions = {};
		const result: AskResult = {
			type: "success",
			stopReason: "complete",
			message: {
				role: "assistant",
				content: "test",
				provider: "test",
				model: "test",
				timestamp: new Date(),
				usage: { input: 10, output: 20 },
				took: 0,
			},
			tokens: { input: 10, output: 20 },
			cost: 0.01,
		};

		expect(options).toBeDefined();
		expect(result.type).toBe("success");
	});
});
