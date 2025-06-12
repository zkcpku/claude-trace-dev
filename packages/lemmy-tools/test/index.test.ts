import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("lemmy-tools", () => {
	it("should pass basic test", () => {
		expect(true).toBe(true);
	});

	it("should import zod", () => {
		expect(z).toBeDefined();
		expect(z.string).toBeTypeOf("function");
	});

	it("should load bash tool", async () => {
		const { bashTool } = await import("../src/builtin/bash.js");
		expect(bashTool).toBeDefined();
		expect(bashTool.name).toBe("Bash");
		expect(bashTool.execute).toBeTypeOf("function");
	});

	it("should load filesystem tools", async () => {
		const { readTool, writeTool, lsTool } = await import("../src/builtin/filesystem.js");
		expect(readTool.name).toBe("Read");
		expect(writeTool.name).toBe("Write");
		expect(lsTool.name).toBe("LS");
	});

	it("should load search tools", async () => {
		const { globTool, grepTool } = await import("../src/builtin/search.js");
		expect(globTool.name).toBe("Glob");
		expect(grepTool.name).toBe("Grep");
	});

	it("should execute bash tool", async () => {
		const { bashTool } = await import("../src/builtin/bash.js");

		// Test with a simple echo command
		const result = await bashTool.execute({
			command: 'echo "Hello from lemmy-tools test"',
			description: "Test echo command",
		});

		expect(result).toBeDefined();
		expect(result.success).toBe(true);
		expect(result.stdout).toContain("Hello from lemmy-tools test");
		expect(result.exitCode).toBe(0);
	});
});
