import { defineConfig } from "tsup";
import { readFileSync } from "fs";
import { join } from "path";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["iife"],
	outDir: "dist",
	globalName: "ClaudeApp",
	minify: false,
	sourcemap: false,
	clean: false, // Don't clean CSS file
	noExternal: ["lit", "marked", "highlight.js"],
	target: "es2022",
	esbuildOptions: (options) => {
		options.banner = {
			js: "/* Claude Tools Frontend Bundle */",
		};

		// Inject CSS content
		options.define = {
			...options.define,
			__CSS_CONTENT__: JSON.stringify(
				(() => {
					try {
						return readFileSync(join(process.cwd(), "dist/styles.css"), "utf8");
					} catch {
						return "";
					}
				})(),
			),
		};
	},
});
