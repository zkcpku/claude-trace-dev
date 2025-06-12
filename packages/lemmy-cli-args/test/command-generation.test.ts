import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Command } from "commander";
import {
	createOptionFromField,
	addSchemaOptionsToCommand,
	createProviderCommand,
	parseAndValidateArgs,
	generateProviderHelp,
	createProviderCommands,
} from "../src/command-generation.js";
import type { CommandGenerationConfig, FieldMetadata } from "../src/command-generation.js";

// Mock schemas for testing
const MockBaseSchema = z.object({
	apiKey: z.string().describe("API key for authentication"),
	baseURL: z.string().optional().describe("Custom API base URL"),
	maxRetries: z.coerce.number().min(0).optional().describe("Maximum number of retries"),
});

const MockAnthropicSchema = z.object({
	model: z.string().describe("Anthropic model to use"),
	thinkingEnabled: z.coerce.boolean().optional().describe("Enable thinking mode"),
	temperature: z.coerce.number().min(0).max(1).optional().describe("Temperature for sampling"),
	toolChoice: z.enum(["auto", "any", "none"]).optional().describe("Tool choice strategy"),
});

const mockConfig: CommandGenerationConfig = {
	schemas: {
		base: MockBaseSchema,
		anthropic: MockAnthropicSchema,
	},
	optionalApiKey: true,
};

describe("Command Generation", () => {
	describe("createOptionFromField", () => {
		it("should create string option", () => {
			const metadata: FieldMetadata = {
				type: "string",
				isOptional: false,
				description: "Test string field",
			};

			const option = createOptionFromField("testField", metadata, mockConfig);

			expect(option.flags).toBe("--testField <value>");
			expect(option.description).toBe("Test string field");
			expect(option.mandatory).toBe(true);
		});

		it("should create boolean option", () => {
			const metadata: FieldMetadata = {
				type: "boolean",
				isOptional: true,
				description: "Test boolean field",
			};

			const option = createOptionFromField("enable", metadata, mockConfig);

			expect(option.flags).toBe("--enable");
			expect(option.description).toBe("Test boolean field");
			expect(option.mandatory).toBe(false);
		});

		it("should create number option with parser", () => {
			const metadata: FieldMetadata = {
				type: "number",
				isOptional: true,
				description: "Test number field",
			};

			const option = createOptionFromField("count", metadata, mockConfig);

			expect(option.flags).toBe("--count <number>");
			expect(option.description).toBe("Test number field");
			expect(option.mandatory).toBe(false);

			// The argParser is internal to Commander, so we test that the option was created correctly
			expect(option.flags).toContain("<number>");
		});

		it("should create enum option with choices", () => {
			const metadata: FieldMetadata = {
				type: "enum",
				isOptional: true,
				enumValues: ["low", "medium", "high"],
				description: "Test enum field",
			};

			const option = createOptionFromField("level", metadata, mockConfig);

			expect(option.flags).toBe("--level <value>");
			expect(option.description).toBe("Test enum field");
			// Commander stores choices internally, we verify the option was created correctly
			expect(option.flags).toContain("<value>");
		});

		it("should create array option", () => {
			const metadata: FieldMetadata = {
				type: "string[]",
				isOptional: true,
				description: "Test array field",
			};

			const option = createOptionFromField("items", metadata, mockConfig);

			expect(option.flags).toBe("--items <values...>");
			expect(option.description).toBe("Test array field");
		});

		it("should handle model field with short flag", () => {
			const metadata: FieldMetadata = {
				type: "string",
				isOptional: false,
				description: "Model to use",
			};

			const option = createOptionFromField("model", metadata, mockConfig);

			expect(option.flags).toBe("-m, --model <value>");
			expect(option.description).toBe("Model to use");
		});

		it("should handle apiKey field with optional configuration", () => {
			const metadata: FieldMetadata = {
				type: "string",
				isOptional: false,
				description: "API key",
			};

			const optionalConfig = { ...mockConfig, optionalApiKey: true };
			const mandatoryConfig = { ...mockConfig, optionalApiKey: false };

			const optionalOption = createOptionFromField("apiKey", metadata, optionalConfig);
			const mandatoryOption = createOptionFromField("apiKey", metadata, mandatoryConfig);

			expect(optionalOption.mandatory).toBe(false);
			expect(mandatoryOption.mandatory).toBe(true);
		});

		it("should apply field overrides", () => {
			const metadata: FieldMetadata = {
				type: "string",
				isOptional: false,
				description: "Original description",
			};

			const configWithOverrides: CommandGenerationConfig = {
				...mockConfig,
				fieldOverrides: {
					testField: {
						description: "Overridden description",
						isOptional: true,
					},
				},
			};

			const option = createOptionFromField("testField", metadata, configWithOverrides);

			expect(option.description).toBe("Overridden description");
			expect(option.mandatory).toBe(false);
		});
	});

	describe("addSchemaOptionsToCommand", () => {
		it("should add all schema options to command", () => {
			const command = new Command("test");
			const result = addSchemaOptionsToCommand(command, "anthropic", mockConfig);

			expect(result).toBe(command);

			// Check that options were added (we can't easily inspect commander options directly)
			const helpText = command.helpInformation();
			expect(helpText).toContain("--apiKey");
			expect(helpText).toContain("--model");
			expect(helpText).toContain("--thinkingEnabled");
			expect(helpText).toContain("--temperature");
		});

		it("should exclude specified fields", () => {
			const configWithExcludes: CommandGenerationConfig = {
				...mockConfig,
				excludeFields: ["apiKey", "baseURL"],
			};

			const command = new Command("test");
			addSchemaOptionsToCommand(command, "anthropic", configWithExcludes);

			const helpText = command.helpInformation();
			expect(helpText).not.toContain("--apiKey");
			expect(helpText).not.toContain("--baseURL");
			expect(helpText).toContain("--model");
		});
	});

	describe("createProviderCommand", () => {
		it("should create command with all options", () => {
			const command = createProviderCommand("anthropic", mockConfig);

			expect(command.name()).toBe("anthropic");
			expect(command.description()).toBe("Execute using anthropic provider");

			const helpText = command.helpInformation();
			expect(helpText).toContain("--model");
			expect(helpText).toContain("--thinkingEnabled");
		});

		it("should set action if provided", () => {
			const mockAction = vi.fn();
			const command = createProviderCommand("anthropic", mockConfig, mockAction);

			// Simulate command execution
			command.parse(["node", "script", "--model", "test-model"], { from: "user" });

			expect(mockAction).toHaveBeenCalled();
		});
	});

	describe("parseAndValidateArgs", () => {
		it("should parse simple arguments", () => {
			const args = ["-m", "claude-3-5-sonnet", "--thinkingEnabled"];
			const result = parseAndValidateArgs(args, "anthropic", mockConfig);

			expect(result.provider).toBe("anthropic");
			expect(result.rawOptions.model).toBe("claude-3-5-sonnet");
			expect(result.rawOptions.thinkingEnabled).toBe(true);
		});

		it("should parse complex arguments", () => {
			const args = ["--temperature", "0.7", "--toolChoice", "auto", "--maxRetries", "3"];
			const result = parseAndValidateArgs(args, "anthropic", mockConfig);

			expect(result.rawOptions.temperature).toBe(0.7);
			expect(result.rawOptions.toolChoice).toBe("auto");
			expect(result.rawOptions.maxRetries).toBe(3);
		});

		it("should handle boolean flags", () => {
			const args = ["--thinkingEnabled"];
			const result = parseAndValidateArgs(args, "anthropic", mockConfig);

			expect(result.rawOptions.thinkingEnabled).toBe(true);
		});

		it("should validate against schema", () => {
			const validArgs = ["-m", "claude-3-5-sonnet", "--temperature", "0.7"];
			const result = parseAndValidateArgs(validArgs, "anthropic", mockConfig);

			expect(result.validationErrors).toHaveLength(0);
			expect(result.parsedOptions.model).toBe("claude-3-5-sonnet");
			expect(result.parsedOptions.temperature).toBe(0.7);
		});

		it("should capture validation errors", () => {
			const invalidArgs = ["--temperature", "2.0"]; // Temperature max is 1 for Anthropic
			const result = parseAndValidateArgs(invalidArgs, "anthropic", mockConfig);

			expect(result.validationErrors.length).toBeGreaterThan(0);
			expect(result.validationErrors.some((err) => err.includes("temperature"))).toBe(true);
		});

		it("should handle unknown provider gracefully", () => {
			const args = ["-m", "some-model"];
			const result = parseAndValidateArgs(args, "unknown", mockConfig);

			expect(result.provider).toBe("unknown");
			expect(result.rawOptions.model).toBe("some-model");
			// Should copy to parsed options when no schema validation
			expect(result.parsedOptions.model).toBe("some-model");
		});
	});

	describe("generateProviderHelp", () => {
		it("should generate comprehensive help text", () => {
			const help = generateProviderHelp("anthropic", mockConfig);

			expect(help).toContain("Options for anthropic:");
			expect(help).toContain("--apiKey");
			expect(help).toContain("API key for authentication");
			expect(help).toContain("-m, --model");
			expect(help).toContain("Anthropic model to use");
			expect(help).toContain("--thinkingEnabled");
			expect(help).toContain("--temperature");
			expect(help).toContain("--toolChoice");
		});

		it("should show required/optional status", () => {
			const help = generateProviderHelp("anthropic", mockConfig);

			expect(help).toContain("(required)");
			expect(help).toContain("(optional)");
		});

		it("should show enum choices", () => {
			const help = generateProviderHelp("anthropic", mockConfig);

			expect(help).toContain("Choices: auto, any, none");
		});

		it("should exclude specified fields", () => {
			const configWithExcludes: CommandGenerationConfig = {
				...mockConfig,
				excludeFields: ["apiKey"],
			};

			const help = generateProviderHelp("anthropic", configWithExcludes);

			expect(help).not.toContain("--apiKey");
			expect(help).toContain("--model");
		});
	});

	describe("createProviderCommands", () => {
		it("should create commands for all providers", () => {
			const commands = createProviderCommands(mockConfig);

			expect(commands).toHaveProperty("anthropic");
			expect(commands.anthropic.name()).toBe("anthropic");
		});

		it("should apply actions to commands", () => {
			const mockAnthropicAction = vi.fn();
			const actions = {
				anthropic: mockAnthropicAction,
			};

			const commands = createProviderCommands(mockConfig, actions);

			// Simulate command execution
			commands.anthropic.parse(["node", "script", "--model", "test"], { from: "user" });

			expect(mockAnthropicAction).toHaveBeenCalled();
		});

		it("should filter out base schema", () => {
			const commands = createProviderCommands(mockConfig);

			expect(commands).not.toHaveProperty("base");
		});
	});

	describe("edge cases and error handling", () => {
		it("should handle empty args gracefully", () => {
			const result = parseAndValidateArgs([], "anthropic", mockConfig);

			expect(result.rawOptions).toEqual({});
			expect(result.validationErrors.length).toBeGreaterThan(0); // Required fields missing
		});

		it("should handle malformed arguments", () => {
			const args = ["--", "malformed", "--incomplete"];
			const result = parseAndValidateArgs(args, "anthropic", mockConfig);

			// Should handle gracefully without crashing
			expect(result.provider).toBe("anthropic");
		});

		it("should handle options without values", () => {
			const args = ["--model"]; // Missing value
			const result = parseAndValidateArgs(args, "anthropic", mockConfig);

			expect(result.rawOptions.model).toBe(true); // Falls back to boolean
		});
	});
});
