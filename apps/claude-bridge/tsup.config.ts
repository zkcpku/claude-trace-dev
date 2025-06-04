import { defineConfig } from "tsup";
import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const version = packageJson.version;

export default defineConfig([
	// Library build
	{
		entry: ["src/index.ts", "src/version.ts"],
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
		define: {
			__PACKAGE_VERSION__: JSON.stringify(version),
		},
	},
	// CLI build
	{
		entry: ["src/cli.ts", "src/version.ts"],
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
		define: {
			__PACKAGE_VERSION__: JSON.stringify(version),
		},
	},
]);
