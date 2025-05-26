import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToOpenAI, zodToAnthropic, zodToGoogle, zodToMCP, convertZodSchema } from "../../src/tools/zod-converter.js";
import { defineTool } from "../../src/tools/index.js";

describe("convertZodSchema", () => {
	it("should convert basic string schema", () => {
		const schema = z.string();
		const result = convertZodSchema(schema);

		expect(result["type"]).toBe("string");
	});

	it("should convert object schema with properties", () => {
		const schema = z.object({
			name: z.string(),
			age: z.number(),
			optional: z.string().optional(),
		});

		const result = convertZodSchema(schema);

		expect(result["type"]).toBe("object");
		expect(result["properties"]).toBeDefined();
		expect(result["required"]).toContain("name");
		expect(result["required"]).toContain("age");
		expect(result["required"]).not.toContain("optional");
	});

	it("should handle enum schemas", () => {
		const schema = z.enum(["option1", "option2", "option3"]);
		const result = convertZodSchema(schema);

		expect(result["enum"]).toEqual(["option1", "option2", "option3"]);
	});

	it("should handle array schemas", () => {
		const schema = z.array(z.string());
		const result = convertZodSchema(schema);

		expect(result["type"]).toBe("array");
		expect(result["items"]).toBeDefined();
	});

	it("should preserve descriptions", () => {
		const schema = z.string().describe("A descriptive string");
		const result = convertZodSchema(schema);

		expect(result["description"]).toBe("A descriptive string");
	});
});

describe("zodToOpenAI", () => {
	it("should convert tool to OpenAI function format", () => {
		const tool = defineTool({
			name: "get_weather",
			description: "Get current weather",
			schema: z.object({
				location: z.string().describe("City name"),
				units: z.enum(["celsius", "fahrenheit"]).optional(),
			}),
			execute: async () => "sunny",
		});

		const result = zodToOpenAI(tool);

		expect(result.type).toBe("function");
		expect(result.function.name).toBe("get_weather");
		expect(result.function.description).toBe("Get current weather");
		expect(result.function.parameters).toBeDefined();
		expect(result.function.parameters["type"]).toBe("object");
		expect(result.function.parameters["properties"]).toBeDefined();
	});

	it("should handle complex schemas", () => {
		const tool = defineTool({
			name: "complex_tool",
			description: "A complex tool",
			schema: z.object({
				user: z.object({
					name: z.string(),
					preferences: z.array(z.string()),
				}),
				options: z.record(z.unknown()).optional(),
			}),
			execute: async () => "result",
		});

		const result = zodToOpenAI(tool);

		expect(result.function.parameters["type"]).toBe("object");
		expect(result.function.parameters["properties"]).toHaveProperty("user");
		expect(result.function.parameters["properties"]).toHaveProperty("options");
	});
});

describe("zodToAnthropic", () => {
	it("should convert tool to Anthropic format", () => {
		const tool = defineTool({
			name: "calculate",
			description: "Perform calculation",
			schema: z.object({
				operation: z.enum(["add", "subtract"]),
				a: z.number(),
				b: z.number(),
			}),
			execute: async () => 42,
		});

		const result = zodToAnthropic(tool);

		expect(result.name).toBe("calculate");
		expect(result.description).toBe("Perform calculation");
		expect(result.input_schema).toBeDefined();
		expect(result.input_schema.type).toBe("object");
		expect(result.input_schema["properties"]).toHaveProperty("operation");
		expect(result.input_schema["properties"]).toHaveProperty("a");
		expect(result.input_schema["properties"]).toHaveProperty("b");
	});

	it("should preserve all schema information", () => {
		const tool = defineTool({
			name: "test_tool",
			description: "Test tool",
			schema: z.object({
				required_field: z.string(),
				optional_field: z.number().optional(),
			}),
			execute: async () => "test",
		});

		const result = zodToAnthropic(tool);

		expect(result.input_schema["required"]).toContain("required_field");
		expect(result.input_schema["required"]).not.toContain("optional_field");
	});
});

describe("zodToGoogle", () => {
	it("should convert tool to Google/Gemini format", () => {
		const tool = defineTool({
			name: "search",
			description: "Search for information",
			schema: z.object({
				query: z.string().describe("Search query"),
				limit: z.number().optional().describe("Max results"),
			}),
			execute: async () => [],
		});

		const result = zodToGoogle(tool);

		expect(result.name).toBe("search");
		expect(result.description).toBe("Search for information");
		expect(result.parameters).toBeDefined();
		expect(result.parameters["type"]).toBe("object");
		expect(result.parameters["properties"]).toHaveProperty("query");
		expect(result.parameters["properties"]).toHaveProperty("limit");
	});

	it("should handle nested objects correctly", () => {
		const tool = defineTool({
			name: "nested_tool",
			description: "Tool with nested structure",
			schema: z.object({
				config: z.object({
					timeout: z.number(),
					retries: z.number(),
				}),
				data: z.array(z.string()),
			}),
			execute: async () => "success",
		});

		const result = zodToGoogle(tool);

		expect(result.parameters["properties"]).toHaveProperty("config");
		expect(result.parameters["properties"]).toHaveProperty("data");
	});
});

describe("zodToMCP", () => {
	it("should convert tool to MCP format", () => {
		const tool = defineTool({
			name: "file_read",
			description: "Read file contents",
			schema: z.object({
				path: z.string().describe("File path"),
				encoding: z.enum(["utf8", "base64"]).optional(),
			}),
			execute: async () => "file contents",
		});

		const result = zodToMCP(tool);

		expect(result.name).toBe("file_read");
		expect(result.description).toBe("Read file contents");
		expect(result.inputSchema).toBeDefined();
		expect(result.inputSchema["type"]).toBe("object");
		expect(result.inputSchema["properties"]).toHaveProperty("path");
		expect(result.inputSchema["properties"]).toHaveProperty("encoding");
	});

	it("should maintain schema structure for MCP", () => {
		const tool = defineTool({
			name: "mcp_tool",
			description: "MCP test tool",
			schema: z.object({
				mandatory: z.string(),
				optional: z.boolean().optional(),
				list: z.array(z.number()),
			}),
			execute: async () => null,
		});

		const result = zodToMCP(tool);

		expect(result.inputSchema["required"]).toContain("mandatory");
		expect(result.inputSchema["required"]).toContain("list");
		expect(result.inputSchema["required"]).not.toContain("optional");
	});
});

describe("Cross-provider format consistency", () => {
	const testTool = defineTool({
		name: "consistent_tool",
		description: "Tool for testing format consistency",
		schema: z.object({
			text: z.string().describe("Input text"),
			count: z.number().min(1).max(100),
			options: z
				.object({
					flag: z.boolean(),
					mode: z.enum(["fast", "accurate"]),
				})
				.optional(),
		}),
		execute: async () => "result",
	});

	it("should produce consistent schema across all formats", () => {
		const openai = zodToOpenAI(testTool);
		const anthropic = zodToAnthropic(testTool);
		const google = zodToGoogle(testTool);
		const mcp = zodToMCP(testTool);

		// All should have the same basic structure
		expect(openai.function.name).toBe(testTool.name);
		expect(anthropic.name).toBe(testTool.name);
		expect(google.name).toBe(testTool.name);
		expect(mcp.name).toBe(testTool.name);

		// All should preserve descriptions
		expect(openai.function.description).toBe(testTool.description);
		expect(anthropic.description).toBe(testTool.description);
		expect(google.description).toBe(testTool.description);
		expect(mcp.description).toBe(testTool.description);

		// All should have object type schemas
		expect(openai.function.parameters["type"]).toBe("object");
		expect(anthropic.input_schema.type).toBe("object");
		expect(google.parameters["type"]).toBe("object");
		expect(mcp.inputSchema["type"]).toBe("object");
	});

	it("should handle edge cases consistently", () => {
		const edgeTool = defineTool({
			name: "edge_tool",
			description: "Tool with edge cases",
			schema: z.object({
				union_field: z.union([z.string(), z.number()]),
				nullable_field: z.string().nullable(),
				default_field: z.string().default("default_value"),
			}),
			execute: async () => "edge result",
		});

		const openai = zodToOpenAI(edgeTool);
		const anthropic = zodToAnthropic(edgeTool);
		const google = zodToGoogle(edgeTool);
		const mcp = zodToMCP(edgeTool);

		// All should handle the schema without errors
		expect(openai.function.parameters["properties"]).toBeDefined();
		expect(anthropic.input_schema["properties"]).toBeDefined();
		expect(google.parameters["properties"]).toBeDefined();
		expect(mcp.inputSchema["properties"]).toBeDefined();
	});
});
