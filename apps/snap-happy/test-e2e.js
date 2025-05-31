#!/usr/bin/env node

/**
 * End-to-end test for snap-happy MCP server
 * Tests the complete flow from command execution to MCP communication
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🧪 Running Snap Happy MCP Server E2E Test\n");

// Test 1: Check if npx tsx works
console.log("1. Testing npx tsx command...");
try {
	const tsxTest = spawn("npx", ["tsx", "--version"], { stdio: "pipe" });

	tsxTest.on("error", (error) => {
		console.error("❌ npx tsx failed:", error.message);
		console.log("💡 Try: npm install -g tsx");
		process.exit(1);
	});

	tsxTest.on("close", (code) => {
		if (code === 0) {
			console.log("✅ npx tsx works");
			runTest2();
		} else {
			console.error("❌ npx tsx failed with code:", code);
			console.log("💡 Try: npm install -g tsx");
			process.exit(1);
		}
	});
} catch (error) {
	console.error("❌ Error testing npx tsx:", error.message);
	process.exit(1);
}

// Test 2: Check if the TypeScript file can be executed
function runTest2() {
	console.log("\n2. Testing TypeScript execution...");

	const srcPath = join(__dirname, "src", "index.ts");
	const tsxTest = spawn("npx", ["tsx", srcPath], {
		stdio: ["pipe", "pipe", "pipe"],
		timeout: 3000,
	});

	let stderr = "";
	let hasOutput = false;

	tsxTest.stderr.on("data", (data) => {
		stderr += data.toString();
		if (stderr.includes("Snap Happy MCP server running on stdio")) {
			hasOutput = true;
			console.log("✅ TypeScript execution works");
			tsxTest.kill();
			runTest3();
		}
	});

	tsxTest.on("error", (error) => {
		console.error("❌ TypeScript execution test failed:", error.message);
		process.exit(1);
	});

	tsxTest.on("close", (code) => {
		if (!hasOutput) {
			console.error("❌ TypeScript execution failed:", stderr);
			console.log("💡 Check if all dependencies are installed");
			process.exit(1);
		}
	});

	// Kill after 3 seconds if no output
	setTimeout(() => {
		if (!hasOutput) {
			console.error("❌ TypeScript execution timed out");
			console.log("STDERR:", stderr);
			tsxTest.kill();
			process.exit(1);
		}
	}, 3000);
}

// Test 3: Test MCP server startup
function runTest3() {
	console.log("\n3. Testing MCP server startup...");

	const srcPath = join(__dirname, "src", "index.ts");
	const mcpServer = spawn("npx", ["tsx", srcPath], {
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			SNAP_HAPPY_SCREENSHOT_PATH: "/tmp/test-screenshots",
		},
	});

	let stderr = "";
	let stdout = "";

	mcpServer.stderr.on("data", (data) => {
		stderr += data.toString();
	});

	mcpServer.stdout.on("data", (data) => {
		stdout += data.toString();
	});

	mcpServer.on("error", (error) => {
		console.error("❌ MCP server startup failed:", error.message);
		process.exit(1);
	});

	// Give it 2 seconds to start up
	setTimeout(() => {
		if (stderr.includes("Snap Happy MCP server running on stdio")) {
			console.log("✅ MCP server starts successfully");
			mcpServer.kill();
			runTest4();
		} else {
			console.error("❌ MCP server did not start properly");
			console.log("STDERR:", stderr);
			console.log("STDOUT:", stdout);
			mcpServer.kill();
			process.exit(1);
		}
	}, 2000);
}

// Test 4: Test MCP communication
function runTest4() {
	console.log("\n4. Testing MCP communication...");

	const srcPath = join(__dirname, "src", "index.ts");
	const mcpServer = spawn("npx", ["tsx", srcPath], {
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			SNAP_HAPPY_SCREENSHOT_PATH: "/tmp/test-screenshots",
		},
	});

	let response = "";

	mcpServer.stdout.on("data", (data) => {
		response += data.toString();
	});

	mcpServer.on("error", (error) => {
		console.error("❌ MCP communication test failed:", error.message);
		process.exit(1);
	});

	// Wait for server to start, then send MCP request
	setTimeout(() => {
		// Send list tools request
		const request = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		};

		mcpServer.stdin.write(JSON.stringify(request) + "\n");

		// Check response after 1 second
		setTimeout(() => {
			try {
				const lines = response.split("\n").filter((line) => line.trim());
				const lastLine = lines[lines.length - 1];

				if (lastLine) {
					const parsed = JSON.parse(lastLine);
					if (parsed.result && parsed.result.tools) {
						console.log("✅ MCP communication works");
						console.log(
							`📝 Found ${parsed.result.tools.length} tools:`,
							parsed.result.tools.map((t) => t.name),
						);
						mcpServer.kill();
						runTest5();
					} else {
						console.error("❌ Unexpected MCP response:", parsed);
						mcpServer.kill();
						process.exit(1);
					}
				} else {
					console.error("❌ No MCP response received");
					console.log("Full response:", response);
					mcpServer.kill();
					process.exit(1);
				}
			} catch (error) {
				console.error("❌ Failed to parse MCP response:", error.message);
				console.log("Raw response:", response);
				mcpServer.kill();
				process.exit(1);
			}
		}, 1000);
	}, 1000);
}

// Test 5: Create Claude MCP config
function runTest5() {
	console.log("\n5. Creating Claude MCP configuration...");

	const config = {
		mcpServers: {
			"snap-happy": {
				command: "npx",
				args: ["tsx", join(__dirname, "src", "index.ts")],
				env: {
					SNAP_HAPPY_SCREENSHOT_PATH: "/Users/badlogic/Desktop/snaphappy",
				},
			},
		},
	};

	const configPath = join(__dirname, "claude-mcp-config.json");
	writeFileSync(configPath, JSON.stringify(config, null, 2));

	console.log("✅ Claude MCP config created at:", configPath);
	console.log("\n📋 To add to Claude, run:");
	console.log(`claude mcp add-json snap-happy "$(cat ${configPath})"`);

	console.log("\n🎉 All tests passed! The MCP server is ready to use.");
}
