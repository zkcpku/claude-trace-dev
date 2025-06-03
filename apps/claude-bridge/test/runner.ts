#!/usr/bin/env tsx

import { testMain as unitTestMain } from "./unit.js";
import { testMain as comprehensiveTestMain } from "./comprehensive.js";

interface TestCategory {
	name: string;
	description: string;
	runner: () => Promise<void>;
}

const testCategories: TestCategory[] = [
	{
		name: "unit",
		description: "Fast unit tests for individual modules",
		runner: unitTestMain,
	},
	{
		name: "comprehensive",
		description: "Full E2E tests including CLI and tool integration",
		runner: comprehensiveTestMain,
	},
	{
		name: "core",
		description: "Basic functionality tests only",
		runner: async () => {
			// Import and run just core tests
			const { TestRunner } = await import("./framework.js");
			const { testSuites } = await import("./comprehensive.js");

			const runner = new TestRunner();
			const coreTestSuite = testSuites.find((suite) => suite.name === "Core Functionality");

			if (coreTestSuite) {
				await runner.runSuite(coreTestSuite);
				runner.printSummary();
				process.exit(runner.hasFailures() ? 1 : 0);
			} else {
				console.error("❌ Core test suite not found");
				process.exit(1);
			}
		},
	},
	{
		name: "tools",
		description: "Tool integration tests only",
		runner: async () => {
			const { TestRunner } = await import("./framework.js");
			const { testSuites } = await import("./comprehensive.js");

			const runner = new TestRunner();
			const toolTestSuite = testSuites.find((suite) => suite.name === "Tool Integration");

			if (toolTestSuite) {
				await runner.runSuite(toolTestSuite);
				runner.printSummary();
				process.exit(runner.hasFailures() ? 1 : 0);
			} else {
				console.error("❌ Tool test suite not found");
				process.exit(1);
			}
		},
	},
	{
		name: "providers",
		description: "Provider integration tests only",
		runner: async () => {
			const { TestRunner } = await import("./framework.js");
			const { testSuites } = await import("./comprehensive.js");

			const runner = new TestRunner();
			const providerTestSuite = testSuites.find((suite) => suite.name === "Provider Integration");

			if (providerTestSuite) {
				await runner.runSuite(providerTestSuite);
				runner.printSummary();
				process.exit(runner.hasFailures() ? 1 : 0);
			} else {
				console.error("❌ Provider test suite not found");
				process.exit(1);
			}
		},
	},
];

function printUsage() {
	console.log("🧪 Claude Bridge Test Runner");
	console.log("============================");
	console.log();
	console.log("Usage: tsx test/runner.ts <category>");
	console.log();
	console.log("Available test categories:");
	console.log();

	for (const category of testCategories) {
		console.log(`  ${category.name.padEnd(12)} - ${category.description}`);
	}

	console.log();
	console.log("Examples:");
	console.log("  tsx test/runner.ts unit          # Run unit tests only");
	console.log("  tsx test/runner.ts core          # Run core functionality tests");
	console.log("  tsx test/runner.ts tools         # Run tool integration tests");
	console.log("  tsx test/runner.ts comprehensive # Run all E2E tests");
	console.log();
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printUsage();
		process.exit(0);
	}

	const categoryName = args[0];
	const category = testCategories.find((cat) => cat.name === categoryName);

	if (!category) {
		console.error(`❌ Unknown test category: ${categoryName}`);
		console.error();
		printUsage();
		process.exit(1);
	}

	console.log(`🚀 Running ${category.name} tests: ${category.description}`);
	console.log("=".repeat(60));
	console.log();

	try {
		await category.runner();
	} catch (error) {
		console.error("💥 Test runner failed:", error);
		process.exit(1);
	}
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}

export { testCategories, main as runnerMain };
