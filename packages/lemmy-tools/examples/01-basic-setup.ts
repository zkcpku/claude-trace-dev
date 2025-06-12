#!/usr/bin/env npx tsx

/**
 * Basic Setup Example
 *
 * Shows how to set up lemmy-tools with all built-in tools
 * Run with: npx tsx examples/01-basic-setup.ts
 */

import { createAnthropicClient, createContext } from "@mariozechner/lemmy";
import { createToolRegistry, getBuiltinTools } from "@mariozechner/lemmy-tools";

async function main() {
	console.log("🚀 Setting up lemmy with all built-in tools...");

	// Create client and context
	const client = createAnthropicClient({ model: "claude-3-5-sonnet-20241022" });
	const context = createContext();

	// Add all built-in tools
	const registry = createToolRegistry();
	const builtinTools = getBuiltinTools();

	console.log(`📦 Adding ${builtinTools.length} built-in tools:`);
	builtinTools.forEach((tool) => {
		console.log(`  - ${tool.name}: ${tool.description.slice(0, 50)}...`);
		registry.addTool(tool);
		context.addTool(tool);
	});

	// Test with a simple file operation
	console.log("\n🔍 Testing tools with a simple request...");

	try {
		const result = await client.ask("List the files in the current directory", { context });

		if (result.type === "success") {
			console.log("✅ Success!");
			console.log("Response:", result.message.content?.slice(0, 200) + "...");

			if (result.message.toolCalls) {
				console.log(`🔧 Tools used: ${result.message.toolCalls.map((tc) => tc.name).join(", ")}`);
			}
		} else {
			console.log("❌ Error:", result.error.message);
		}
	} catch (error) {
		console.error("💥 Unexpected error:", error);
	}
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
	main().catch(console.error);
}
