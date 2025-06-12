#!/usr/bin/env npx tsx

/**
 * Tool Cancellation Example
 *
 * Shows how to cancel long-running tool operations
 * Run with: npx tsx examples/04-tool-cancellation.ts
 */

import { createAnthropicClient, createContext } from "@mariozechner/lemmy";
import { bashTool, readTool } from "@mariozechner/lemmy-tools/builtin";

class ToolExecutionManager {
	private abortController?: AbortController;

	constructor(private context: any) {}

	async executeWithCancellation(client: any, message: string) {
		this.abortController = new AbortController();

		// Set up cancellation after 5 seconds for demo
		const cancelTimer = setTimeout(() => {
			console.log("\n⏹️ Auto-cancelling operation after 5 seconds...");
			this.abortController?.abort();
		}, 5000);

		try {
			const result = await client.ask(message, {
				context: this.context,
				signal: this.abortController.signal,
			});

			clearTimeout(cancelTimer);
			return result;
		} catch (error) {
			clearTimeout(cancelTimer);
			if (error.name === "AbortError") {
				return {
					type: "cancelled",
					message: "Operation cancelled by user",
				};
			}
			throw error;
		}
	}

	cancelCurrentOperation() {
		console.log("🚫 Cancelling current operation...");
		this.abortController?.abort();
	}
}

async function main() {
	console.log("⏱️ Setting up tool cancellation demo...");

	const client = createAnthropicClient({ model: "claude-3-5-sonnet-20241022" });
	const context = createContext();

	// Add tools that might take time
	context.addTool(bashTool);
	context.addTool(readTool);

	console.log("📦 Added tools: Bash, Read");

	const manager = new ToolExecutionManager(context);

	// Test 1: Quick operation (should complete)
	console.log("\n🏃 Test 1: Quick operation (should complete)");
	try {
		const result = await manager.executeWithCancellation(client, "Show me the current date and time");

		if (result.type === "success") {
			console.log("✅ Quick operation completed successfully");
			console.log("Response:", result.message.content?.slice(0, 100) + "...");
		} else if (result.type === "cancelled") {
			console.log("⚠️ Operation was cancelled");
		} else {
			console.log("❌ Error:", result.error?.message);
		}
	} catch (error) {
		console.error("💥 Unexpected error:", error);
	}

	// Test 2: Long operation (should be cancelled)
	console.log("\n🐢 Test 2: Long operation (will be auto-cancelled after 5 seconds)");
	try {
		const result = await manager.executeWithCancellation(
			client,
			"Run a sleep command for 10 seconds, then list all files recursively in the entire filesystem",
		);

		if (result.type === "success") {
			console.log("✅ Long operation completed (unexpected!)");
			console.log("Response:", result.message.content?.slice(0, 100) + "...");
		} else if (result.type === "cancelled") {
			console.log("✅ Operation was successfully cancelled");
		} else {
			console.log("❌ Error:", result.error?.message);
		}
	} catch (error) {
		console.error("💥 Unexpected error:", error);
	}

	// Test 3: Manual cancellation demo
	console.log("\n🔄 Test 3: Manual cancellation demo");
	console.log("Starting operation and cancelling immediately...");

	const manualManager = new ToolExecutionManager(context);

	// Start operation
	const operationPromise = manualManager.executeWithCancellation(
		client,
		"Sleep for 30 seconds then show system information",
	);

	// Cancel immediately
	setTimeout(() => {
		manualManager.cancelCurrentOperation();
	}, 100);

	try {
		const result = await operationPromise;

		if (result.type === "cancelled") {
			console.log("✅ Manual cancellation worked correctly");
		} else {
			console.log("⚠️ Operation completed unexpectedly");
		}
	} catch (error) {
		console.error("💥 Unexpected error:", error);
	}

	console.log("\n🎉 Cancellation demo completed!");
	console.log("📝 Note: In real applications, wire cancel buttons to call cancelCurrentOperation()");
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
	main().catch(console.error);
}
