import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	minify: false,
	splitting: false,
	external: ["zod", "zod-to-json-schema", "@modelcontextprotocol/sdk"],
	platform: "neutral",
	target: "es2022",
	outDir: "dist",
});
