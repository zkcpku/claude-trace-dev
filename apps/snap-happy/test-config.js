#!/usr/bin/env node

// Test the screenshot configuration
import { getScreenshotConfig, validateScreenshotPath } from "./src/screenshot.js";

console.log("🧪 Testing screenshot configuration...\n");

try {
	// Test 1: Get config
	console.log("1. Getting screenshot config...");
	const config = getScreenshotConfig();
	console.log(`✅ Screenshot path: ${config.screenshotPath}`);

	// Test 2: Validate path
	console.log("\n2. Validating screenshot path...");
	validateScreenshotPath(config.screenshotPath);
	console.log("✅ Screenshot path is valid and writable");

	console.log("\n🎉 Configuration test passed!");
} catch (error) {
	console.error("\n❌ Configuration test failed:", error.message);

	console.log("\n🔧 Environment variables:");
	console.log(`   HOME: ${process.env.HOME}`);
	console.log(`   SNAP_HAPPY_SCREENSHOT_PATH: ${process.env.SNAP_HAPPY_SCREENSHOT_PATH}`);

	process.exit(1);
}
