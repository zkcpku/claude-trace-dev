import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "esnext",
	outDir: "dist",
	clean: true,
	sourcemap: true,
	minify: true,
	splitting: true,
	platform: "browser",
	// Copy HTML and other assets
	publicDir: "public",
	loader: {
		".html": "copy",
		".css": "css",
	},
});
