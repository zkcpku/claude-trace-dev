import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool, validateAndExecute, validateToolCall, resultToString } from "../../src/tools/index.js";
import type { ToolCall } from "../../src/types.js";

describe("defineTool", () => {
	it("should create a tool definition with correct properties", () => {
		const weatherSchema = z.object({
			location: z.string().describe("City name or zip code"),
			units: z.enum(["celsius", "fahrenheit"]).optional(),
		});

		const weatherTool = defineTool({
			name: "get_weather",
			description: "Get current weather for a location",
			schema: weatherSchema,
			execute: async (args) => {
				return `Weather in ${args.location}: 20°C`;
			},
		});

		expect(weatherTool.name).toBe("get_weather");
		expect(weatherTool.description).toBe("Get current weather for a location");
		expect(weatherTool.schema).toBe(weatherSchema);
		expect(typeof weatherTool.execute).toBe("function");
	});

	it("should provide proper TypeScript inference", () => {
		const calculatorSchema = z.object({
			operation: z.enum(["add", "subtract", "multiply", "divide"]),
			a: z.number(),
			b: z.number(),
		});

		const calculatorTool = defineTool({
			name: "calculator",
			description: "Perform basic arithmetic operations",
			schema: calculatorSchema,
			execute: async (args) => {
				// TypeScript should infer args as { operation: 'add' | 'subtract' | 'multiply' | 'divide', a: number, b: number }
				// Return type is inferred as number
				switch (args.operation) {
					case "add":
						return args.a + args.b;
					case "subtract":
						return args.a - args.b;
					case "multiply":
						return args.a * args.b;
					case "divide":
						return args.a / args.b;
					default:
						throw new Error("Invalid operation");
				}
			},
		});

		expect(calculatorTool.name).toBe("calculator");
	});
});

describe("validateAndExecute", () => {
	const mathTool = defineTool({
		name: "add_numbers",
		description: "Add two numbers",
		schema: z.object({
			a: z.number(),
			b: z.number(),
		}),
		execute: async (args) => args.a + args.b, // Returns number
	});

	it("should successfully execute with valid arguments", async () => {
		const toolCall: ToolCall = {
			id: "test-1",
			name: "add_numbers",
			arguments: { a: 5, b: 3 },
		};

		const result = await validateAndExecute(mathTool, toolCall);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result).toBe(8); // Number result preserved
			expect(typeof result.result).toBe("number");
		}

		// Convert to string for LLM
		if (result.success) {
			expect(resultToString(result.result)).toBe("8");
		}
	});

	it("should handle validation errors for invalid arguments", async () => {
		const toolCall: ToolCall = {
			id: "test-2",
			name: "add_numbers",
			arguments: { a: "invalid", b: 3 },
		};

		const result = await validateAndExecute(mathTool, toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error.type).toBe("invalid_args");
			expect(result.error.toolName).toBe("add_numbers");
			expect(result.error.message).toContain("Invalid arguments");
		}
	});

	it("should handle execution errors", async () => {
		const faultyTool = defineTool({
			name: "faulty_tool",
			description: "A tool that always fails",
			schema: z.object({ input: z.string() }),
			execute: async () => {
				throw new Error("Something went wrong");
			},
		});

		const toolCall: ToolCall = {
			id: "test-3",
			name: "faulty_tool",
			arguments: { input: "test" },
		};

		const result = await validateAndExecute(faultyTool, toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error.type).toBe("execution_failed");
			expect(result.error.toolName).toBe("faulty_tool");
			expect(result.error.message).toBe("Something went wrong");
		}
	});

	it("should handle non-Error execution failures", async () => {
		const stringThrowTool = defineTool({
			name: "string_throw_tool",
			description: "A tool that throws a string",
			schema: z.object({ input: z.string() }),
			execute: async () => {
				throw "String error"; // eslint-disable-line @typescript-eslint/no-throw-literal
			},
		});

		const toolCall: ToolCall = {
			id: "test-4",
			name: "string_throw_tool",
			arguments: { input: "test" },
		};

		const result = await validateAndExecute(stringThrowTool, toolCall);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.type).toBe("execution_failed");
			expect(result.error.message).toBe("Unknown error during tool execution");
		}
	});
});

describe("validateToolCall", () => {
	const weatherTool = defineTool({
		name: "get_weather",
		description: "Get weather information",
		schema: z.object({
			location: z.string(),
			units: z.enum(["celsius", "fahrenheit"]).optional(),
		}),
		execute: async () => "sunny",
	});

	it("should validate correct arguments", () => {
		const args = { location: "New York", units: "celsius" as const };
		const result = validateToolCall(weatherTool, args);

		expect(result).toEqual(args);
	});

	it("should throw ZodError for invalid arguments", () => {
		const args = { location: 123, units: "invalid" };

		expect(() => validateToolCall(weatherTool, args)).toThrow();
	});

	it("should handle missing optional fields", () => {
		const args = { location: "Paris" };
		const result = validateToolCall(weatherTool, args);

		expect(result.location).toBe("Paris");
		expect(result.units).toBeUndefined();
	});
});

describe("Complex schema types", () => {
	it("should work with nested objects", () => {
		const complexTool = defineTool({
			name: "complex_tool",
			description: "Tool with complex schema",
			schema: z.object({
				user: z.object({
					name: z.string(),
					age: z.number(),
				}),
				preferences: z.array(z.string()),
				metadata: z.record(z.unknown()).optional(),
			}),
			execute: async (args) => {
				return `User ${args.user.name} (${args.user.age}) likes: ${args.preferences.join(", ")}`;
			},
		});

		expect(complexTool.name).toBe("complex_tool");
		expect(typeof complexTool.execute).toBe("function");
	});

	it("should work with union types", () => {
		const unionTool = defineTool({
			name: "union_tool",
			description: "Tool with union types",
			schema: z.object({
				value: z.union([z.string(), z.number(), z.boolean()]),
			}),
			execute: async (args) => `Value: ${args.value}`,
		});

		expect(unionTool.name).toBe("union_tool");
	});

	it("should work with array types", () => {
		const arrayTool = defineTool({
			name: "array_tool",
			description: "Tool with array inputs",
			schema: z.object({
				numbers: z.array(z.number()),
				tags: z.array(z.string()).optional(),
			}),
			execute: async (args) => args.numbers.reduce((sum, n) => sum + n, 0), // Returns number
		});

		expect(arrayTool.name).toBe("array_tool");
	});

	it("should work with zero-argument tools", async () => {
		const pingTool = defineTool({
			name: "ping",
			description: "Ping the server",
			schema: z.object({}),
			execute: async () => "pong",
		});

		expect(pingTool.name).toBe("ping");
		expect(typeof pingTool.execute).toBe("function");

		// Test execution with empty object
		const toolCall: ToolCall = {
			id: "ping-1",
			name: "ping",
			arguments: {},
		};

		const result = await validateAndExecute(pingTool, toolCall);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result).toBe("pong");
		}
	});

	it("should preserve different return types", async () => {
		// String return type
		const stringTool = defineTool({
			name: "string_tool",
			description: "Returns a string",
			schema: z.object({ input: z.string() }),
			execute: async (args) => `Hello ${args.input}`,
		});

		// Number return type
		const numberTool = defineTool({
			name: "number_tool",
			description: "Returns a number",
			schema: z.object({ x: z.number() }),
			execute: async (args) => args.x * 2,
		});

		// Object return type
		const objectTool = defineTool({
			name: "object_tool",
			description: "Returns an object",
			schema: z.object({ name: z.string() }),
			execute: async (args) => ({ greeting: `Hello ${args.name}`, timestamp: new Date() }),
		});

		const stringResult = await validateAndExecute(stringTool, {
			id: "test-1",
			name: "string_tool",
			arguments: { input: "World" },
		});
		expect(stringResult.success).toBe(true);
		if (stringResult.success) {
			expect(typeof stringResult.result).toBe("string");
			expect(stringResult.result).toBe("Hello World");
		}

		const numberResult = await validateAndExecute(numberTool, {
			id: "test-2",
			name: "number_tool",
			arguments: { x: 5 },
		});
		expect(numberResult.success).toBe(true);
		if (numberResult.success) {
			expect(typeof numberResult.result).toBe("number");
			expect(numberResult.result).toBe(10);
		}

		const objectResult = await validateAndExecute(objectTool, {
			id: "test-3",
			name: "object_tool",
			arguments: { name: "Alice" },
		});
		expect(objectResult.success).toBe(true);
		if (objectResult.success) {
			expect(typeof objectResult.result).toBe("object");
			expect(objectResult.result).toMatchObject({ greeting: "Hello Alice" });
		}

		// Test string conversion for LLM consumption
		if (stringResult.success && numberResult.success && objectResult.success) {
			expect(resultToString(stringResult.result)).toBe("Hello World");
			expect(resultToString(numberResult.result)).toBe("10");
			expect(resultToString(objectResult.result)).toContain('"greeting": "Hello Alice"');
		}
	});
});

describe("resultToString", () => {
	it("should handle strings directly", () => {
		expect(resultToString("hello")).toBe("hello");
	});

	it("should handle numbers", () => {
		expect(resultToString(42)).toBe("42");
		expect(resultToString(3.14)).toBe("3.14");
	});

	it("should handle booleans", () => {
		expect(resultToString(true)).toBe("true");
		expect(resultToString(false)).toBe("false");
	});

	it("should handle null and undefined", () => {
		expect(resultToString(null)).toBe("null");
		expect(resultToString(undefined)).toBe("undefined");
	});

	it("should handle arrays with JSON stringify", () => {
		expect(resultToString([])).toBe("[]");
		expect(resultToString([1, 2, 3])).toBe("[\n  1,\n  2,\n  3\n]");
		expect(resultToString(["a", "b", "c"])).toBe('[\n  "a",\n  "b",\n  "c"\n]');

		const complexArray = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		const result = resultToString(complexArray);
		expect(result).toContain('"id": 1');
		expect(result).toContain('"name": "Alice"');
		expect(JSON.parse(result)).toEqual(complexArray);
	});

	it("should handle nested objects", () => {
		const obj = {
			user: { name: "Alice", age: 30 },
			preferences: ["coding", "music"],
			metadata: { created: "2023-01-01" },
		};
		const result = resultToString(obj);
		expect(result).toContain('"name": "Alice"');
		expect(result).toContain('"preferences"');
		expect(JSON.parse(result)).toEqual(obj);
	});

	it("should handle Date objects", () => {
		const date = new Date("2023-01-01T00:00:00.000Z");
		const result = resultToString(date);
		expect(result).toContain("2023-01-01T00:00:00.000Z");
	});
});
