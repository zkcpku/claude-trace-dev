#!/usr/bin/env npx tsx

/**
 * Selective Tool Loading Example
 *
 * Shows how to add only specific tools instead of all built-ins
 * Run with: npx tsx examples/02-selective-tools.ts
 */

import { createAnthropicClient, createContext } from "@mariozechner/lemmy";
import { bashTool, readTool, writeTool, globTool, grepTool, editTool } from "@mariozechner/lemmy-tools/builtin";

async function main() {
	console.log("🎯 Setting up lemmy with selective tools...");

	const client = createAnthropicClient({ model: "claude-3-5-sonnet-20241022" });
	const context = createContext();

	// Add only filesystem and shell tools (no web tools)
	const selectedTools = [bashTool, readTool, writeTool, globTool, grepTool, editTool];

	console.log("📦 Adding selected tools:");
	selectedTools.forEach((tool) => {
		console.log(`  - ${tool.name}: ${tool.category}`);
		context.addTool(tool);
	});

	// Test with a file operation
	console.log("\n📝 Testing file operations...");

	try {
		const result = await client.ask(
			"Create a simple 'hello.txt' file with the content 'Hello, World!' and then read it back",
			{ context },
		);

		if (result.type === "success") {
			console.log("✅ File operations completed!");
			console.log("Response:", result.message.content?.slice(0, 300) + "...");

			if (result.message.toolCalls) {
				console.log(`🔧 Tools used: ${result.message.toolCalls.map((tc) => tc.name).join(", ")}`);
			}
		} else {
			console.log("❌ Error:", result.error.message);
		}
	} catch (error) {
		console.error("💥 Unexpected error:", error);
	}

	// Clean up
	console.log("\n🧹 Cleaning up...");
	try {
		await client.ask("Remove the hello.txt file if it exists", { context });
		console.log("✅ Cleanup completed");
	} catch (error) {
		console.log("⚠️ Cleanup failed, but that's okay");
	}
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
	main().catch(console.error);
}
