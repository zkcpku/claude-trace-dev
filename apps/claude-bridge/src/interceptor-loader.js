// ESM loader for interceptor
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
	const jsPath = path.join(__dirname, "index.js");
	const tsPath = path.join(__dirname, "interceptor.ts");

	// Also check for compiled version in dist directory
	const distJsPath = path.resolve(__dirname, "..", "dist", "index.js");

	if (fs.existsSync(jsPath)) {
		// Use JavaScript in same directory
		const { initializeInterceptor } = await import(`file://${jsPath}`);
		await initializeInterceptor();
	} else if (fs.existsSync(distJsPath)) {
		// Use compiled JavaScript from dist
		const { initializeInterceptor } = await import(`file://${distJsPath}`);
		await initializeInterceptor();
	} else if (fs.existsSync(tsPath)) {
		// Try to load tsx dynamically for development
		try {
			// Register tsx hooks for TypeScript support
			await import("tsx/esm");
			const { initializeInterceptor } = await import(`file://${tsPath}`);
			await initializeInterceptor();
		} catch (tsxError) {
			console.error("❌ tsx not available for TypeScript loading:", tsxError.message);
			console.error("❌ For development: run 'npm run dev' in root to compile TypeScript");
			console.error("❌ For production: run 'npm run build' to create bundled version");
			process.exit(1);
		}
	} else {
		console.error("❌ Could not find interceptor file");
		console.error("Looked for:", jsPath, "and", distJsPath, "and", tsPath);
		process.exit(1);
	}
} catch (error) {
	console.error("❌ Error loading interceptor:", error.message);
	console.error("Stack trace:", error.stack);
	process.exit(1);
}
