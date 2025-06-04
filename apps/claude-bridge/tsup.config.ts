import { defineConfig } from "tsup";

export default defineConfig([
	// Library build
	{
		entry: ["src/index.ts"],
		format: ["esm"],
		bundle: true,
		clean: true,
		shims: true,
		external: [
			"@anthropic-ai/sdk",
			"@google/genai",
			"openai",
			"zod",
			"chalk",
			"@modelcontextprotocol/sdk",
			"zod-to-json-schema",
		],
	},
	// CLI build
	{
		entry: ["src/cli.ts"],
		format: ["esm"],
		bundle: true,
		shims: true,
		splitting: false,
		external: [
			"@anthropic-ai/sdk",
			"@google/genai",
			"openai",
			"zod",
			"chalk",
			"@modelcontextprotocol/sdk",
			"zod-to-json-schema",
		],
	},
]);
