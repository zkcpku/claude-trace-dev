import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	splitting: false,
	external: ["@mariozechner/lemmy", "commander", "zod"],
});
