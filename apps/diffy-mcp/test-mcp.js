#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve } from "path";

// Simple test to see if the MCP server starts and responds
async function testMCPServer() {
	console.log("🧪 Testing Diffy MCP Server...");

	const serverPath = resolve("./packages/server/dist/index.js");
	console.log(`Starting server: ${serverPath}`);

	const serverProcess = spawn("node", [serverPath], {
		stdio: ["pipe", "pipe", "inherit"],
	});

	// Send initialize request
	const initRequest = {
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: {
				name: "test-client",
				version: "1.0.0",
			},
		},
	};

	serverProcess.stdin.write(JSON.stringify(initRequest) + "\n");

	// Listen for response
	serverProcess.stdout.on("data", (data) => {
		const response = data.toString().trim();
		console.log("📥 Server response:", response);

		// After initialization, test list tools
		if (response.includes('"result"')) {
			console.log("✅ Server initialized, testing list tools...");

			const listToolsRequest = {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			};

			serverProcess.stdin.write(JSON.stringify(listToolsRequest) + "\n");
		}
	});

	serverProcess.on("error", (error) => {
		console.error("❌ Server error:", error);
	});

	// Clean up after 5 seconds
	setTimeout(() => {
		console.log("🧹 Cleaning up...");
		serverProcess.kill();
		process.exit(0);
	}, 5000);
}

testMCPServer().catch(console.error);
