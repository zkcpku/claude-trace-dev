import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/test-cli.ts", "src/cli.ts"],
	format: ["esm"],
	target: "node18",
	outDir: "dist",
	clean: true,
	sourcemap: true,
	minify: false,
	splitting: false,
	shims: true,
});
