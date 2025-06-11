#!/usr/bin/env node

/**
 * Integration test to verify the Diffy MCP server works
 */

import { spawn } from "child_process";
import { resolve } from "path";
import { writeFileSync } from "fs";

async function runIntegrationTest() {
	console.log("🧪 Diffy MCP Integration Test");
	console.log("==============================");

	const serverPath = resolve("packages/server/dist/index.js");
	const testFile = resolve("test-sample.txt");

	console.log(`📁 Test file: ${testFile}`);
	console.log(`🚀 Starting server: ${serverPath}`);

	const serverProcess = spawn("node", [serverPath], {
		stdio: ["pipe", "pipe", "pipe"],
	});

	let serverOutput = "";
	let serverError = "";

	serverProcess.stdout.on("data", (data) => {
		const output = data.toString();
		serverOutput += output;
		console.log("📤 Server stdout:", output.trim());
	});

	serverProcess.stderr.on("data", (data) => {
		const error = data.toString();
		serverError += error;
		console.log("📥 Server stderr:", error.trim());
	});

	// Send MCP requests
	setTimeout(async () => {
		console.log("🔗 Sending MCP requests...");

		// Initialize
		const initRequest = {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: {
					name: "integration-test",
					version: "1.0.0",
				},
			},
		};

		console.log("📤 Sending initialize request");
		serverProcess.stdin.write(JSON.stringify(initRequest) + "\\n");

		// Wait a bit then send tools/list
		setTimeout(() => {
			const listToolsRequest = {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			};

			console.log("📤 Sending tools/list request");
			serverProcess.stdin.write(JSON.stringify(listToolsRequest) + "\\n");

			// Wait a bit then test open tool
			setTimeout(() => {
				const openRequest = {
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "open",
						arguments: {
							absolutePath: testFile,
							panel: 0,
						},
					},
				};

				console.log("📤 Sending open tool request");
				serverProcess.stdin.write(JSON.stringify(openRequest) + "\\n");

				// Clean up after a short delay
				setTimeout(() => {
					console.log("🧹 Cleaning up...");
					serverProcess.kill();

					// Write output to files for inspection
					writeFileSync("test-output.log", serverOutput);
					writeFileSync("test-error.log", serverError);

					console.log("✅ Test completed");
					console.log("📄 Output saved to test-output.log and test-error.log");
					process.exit(0);
				}, 2000);
			}, 1000);
		}, 1000);
	}, 1000);

	serverProcess.on("error", (error) => {
		console.error("❌ Server process error:", error);
		process.exit(1);
	});

	serverProcess.on("exit", (code) => {
		console.log(`🔚 Server exited with code ${code}`);
	});
}

runIntegrationTest().catch(console.error);
