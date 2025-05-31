#!/usr/bin/env tsx

import {
	getScreenshotConfig,
	validateScreenshotPath,
	takeScreenshot,
	getLastScreenshot,
	imageToBase64,
} from "./src/screenshot.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

async function runTests() {
	console.log("🧪 Running snap-happy tests...\n");

	// Test 1: Environment variable parsing
	console.log("Test 1: Environment variable parsing");
	try {
		// Test with missing env var
		delete process.env.SNAP_HAPPY_SCREENSHOT_PATH;
		delete process.env.MCP_SERVER_NAME;

		try {
			getScreenshotConfig();
			console.log("❌ Should have thrown error for missing env var");
		} catch (error) {
			console.log("✅ Correctly throws error for missing env var:", (error as Error).message);
		}

		// Test with env var set
		process.env.SNAP_HAPPY_SCREENSHOT_PATH = "/tmp/snap-happy-test";
		const config = getScreenshotConfig();
		console.log("✅ Environment variable parsing works:", config.screenshotPath);
	} catch (error) {
		console.log("❌ Environment variable test failed:", (error as Error).message);
	}

	// Test 2: Directory validation and creation
	console.log("\nTest 2: Directory validation and creation");
	try {
		const testDir = "/tmp/snap-happy-test";

		// Clean up if exists
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}

		validateScreenshotPath(testDir);
		console.log("✅ Directory created and validated:", testDir);

		// Test writable check
		validateScreenshotPath(testDir);
		console.log("✅ Directory write validation works");
	} catch (error) {
		console.log("❌ Directory validation test failed:", (error as Error).message);
	}

	// Test 3: Screenshot functionality (only on macOS)
	console.log("\nTest 3: Screenshot functionality");
	try {
		const testDir = "/tmp/snap-happy-test";

		if (process.platform === "darwin") {
			console.log("📸 Taking test screenshot...");
			const screenshotPath = takeScreenshot(testDir);
			console.log("✅ Screenshot taken:", screenshotPath);

			// Test getting last screenshot
			const lastScreenshot = getLastScreenshot(testDir);
			console.log("✅ Last screenshot found:", lastScreenshot);

			// Test base64 conversion
			if (lastScreenshot) {
				const base64Data = imageToBase64(lastScreenshot);
				console.log("✅ Base64 conversion works, length:", base64Data.length);

				// Verify it's valid base64 PNG
				if (base64Data.length > 0 && base64Data.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
					console.log("✅ Valid base64 format");
				} else {
					console.log("❌ Invalid base64 format");
				}
			}
		} else {
			console.log("⏭️  Skipping screenshot test on non-macOS platform");
		}
	} catch (error) {
		console.log("❌ Screenshot test failed:", (error as Error).message);
	}

	// Test 4: Error handling
	console.log("\nTest 4: Error handling");
	try {
		// Test invalid directory
		try {
			getLastScreenshot("/nonexistent/directory");
			console.log("❌ Should have thrown error for invalid directory");
		} catch (error) {
			console.log("✅ Correctly handles invalid directory:", (error as Error).message);
		}

		// Test invalid image file
		try {
			imageToBase64("/nonexistent/file.png");
			console.log("❌ Should have thrown error for missing file");
		} catch (error) {
			console.log("✅ Correctly handles missing image file:", (error as Error).message);
		}
	} catch (error) {
		console.log("❌ Error handling test failed:", (error as Error).message);
	}

	console.log("\n🎉 Tests completed!");

	// Cleanup
	try {
		if (existsSync("/tmp/snap-happy-test")) {
			rmSync("/tmp/snap-happy-test", { recursive: true });
			console.log("🧹 Test directory cleaned up");
		}
	} catch (error) {
		console.log("⚠️  Cleanup warning:", (error as Error).message);
	}
}

runTests().catch(console.error);
