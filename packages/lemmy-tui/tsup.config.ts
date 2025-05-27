import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	minify: false,
	splitting: false,
	external: [],
	platform: "node", // TUI library is Node.js specific
	target: "es2022",
	outDir: "dist",
});
