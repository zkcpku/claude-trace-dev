#!/usr/bin/env tsx

import { TestRunner, TestSuite, Test, assert, assertEquals, assertContains } from "./framework.js";

// Unit tests for individual modules
const transformTests: Test[] = [
	{
		name: "Anthropic to Lemmy Transform",
		run: async () => {
			try {
				const { transformAnthropicToLemmy } = await import("../src/transforms/anthropic-to-lemmy.js");

				// Test basic message transformation
				const anthropicRequest = {
					model: "claude-3-sonnet-20240229",
					messages: [{ role: "user" as const, content: "Hello world" }],
					max_tokens: 1000,
				};

				const result = transformAnthropicToLemmy(anthropicRequest);

				assert(result !== null, "Transform should not return null for valid input");
				assert(result.messages.length > 0, "Should have messages");
				assertEquals(result.messages[0]?.role, "user", "First message should be user");

				return {
					name: "Anthropic to Lemmy Transform",
					success: true,
					message: "Basic transformation working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Anthropic to Lemmy Transform",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},

	{
		name: "Tool Schema Conversion",
		run: async () => {
			try {
				const { jsonSchemaToZod } = await import("../src/transforms/tool-schemas.js");

				// Test basic schema conversion
				const jsonSchema = {
					type: "object",
					properties: {
						message: { type: "string" },
						count: { type: "number" },
					},
					required: ["message"],
				};

				const zodSchema = jsonSchemaToZod(jsonSchema);

				assert(zodSchema !== null, "Schema conversion should not return null");

				// Test validation with valid data
				const validData = { message: "test", count: 42 };
				const result = zodSchema.parse(validData);
				assertEquals(result.message, "test", "Parsed data should match input");

				return {
					name: "Tool Schema Conversion",
					success: true,
					message: "Schema conversion working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Tool Schema Conversion",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},

	{
		name: "SSE Generation",
		run: async () => {
			try {
				const { createAnthropicSSE } = await import("../src/transforms/lemmy-to-anthropic.js");

				// Test SSE generation
				const askResult = {
					type: "success" as const,
					stopReason: "max_tokens" as const,
					message: {
						role: "assistant" as const,
						content: "Hello world",
						timestamp: new Date(),
						usage: { input: 10, output: 5 },
						provider: "test",
						model: "test-model",
						took: 1.5,
					},
					tokens: { input: 10, output: 5 },
					cost: 0.01,
				};

				const sseStream = createAnthropicSSE(askResult, "gpt-4o");

				assert(sseStream instanceof ReadableStream, "SSE should be a ReadableStream");

				// Read the stream to test content
				const reader = sseStream.getReader();
				const decoder = new TextDecoder();
				let content = "";

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						content += decoder.decode(value);
					}
				} finally {
					reader.releaseLock();
				}

				assertContains(content, "data:", "Should contain SSE data prefix");
				assertContains(content, "Hello world", "Should contain the response content");

				return {
					name: "SSE Generation",
					success: true,
					message: "SSE generation working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "SSE Generation",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},
];

const utilityTests: Test[] = [
	{
		name: "Request Parser",
		run: async () => {
			try {
				const { isAnthropicAPI, generateRequestId } = await import("../src/utils/request-parser.js");

				// Test API detection
				assert(isAnthropicAPI("https://api.anthropic.com/v1/messages"), "Should detect Anthropic API");
				assert(!isAnthropicAPI("https://api.openai.com/v1/chat"), "Should not detect OpenAI as Anthropic");

				// Test request ID generation
				const id1 = generateRequestId();
				const id2 = generateRequestId();
				assert(id1 !== id2, "Request IDs should be unique");
				assert(id1.length > 10, "Request ID should be sufficiently long");

				return {
					name: "Request Parser",
					success: true,
					message: "Request parser utilities working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Request Parser",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},

	{
		name: "Provider Utilities",
		run: async () => {
			try {
				const { createProviderClient, convertThinkingParameters } = await import("../src/utils/provider.js");

				// Test provider client creation
				const clientInfo = createProviderClient({
					provider: "openai",
					model: "gpt-4o",
					apiKey: "test-key",
				});

				assertEquals(clientInfo.provider, "openai", "Provider should match config");
				assertEquals(clientInfo.model, "gpt-4o", "Model should match config");
				assert(clientInfo.client !== null, "Client should be created");

				// Test thinking parameter conversion
				const anthropicParams = { max_tokens: 1000 };
				const openaiOptions = convertThinkingParameters("openai", anthropicParams);
				assertEquals(openaiOptions.maxOutputTokens, 1000, "Max tokens should be converted");

				return {
					name: "Provider Utilities",
					success: true,
					message: "Provider utilities working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Provider Utilities",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},

	{
		name: "Logger",
		run: async () => {
			try {
				const { FileLogger } = await import("../src/utils/logger.js");

				// Test logger creation
				const logger = new FileLogger("/tmp");

				// Test logging (should not throw)
				logger.log("Test message");
				logger.error("Test error");

				return {
					name: "Logger",
					success: true,
					message: "Logger working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Logger",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},
];

const interceptorTests: Test[] = [
	{
		name: "Interceptor Creation",
		run: async () => {
			try {
				const { ClaudeBridgeInterceptor } = await import("../src/interceptor.js");

				// Test interceptor creation
				const interceptor = new ClaudeBridgeInterceptor({
					provider: "openai",
					model: "gpt-4o",
					apiKey: "test-key",
					logDirectory: "/tmp",
				});

				assert(interceptor !== null, "Interceptor should be created");

				// Test fetch instrumentation (should not throw)
				interceptor.instrumentFetch();

				return {
					name: "Interceptor Creation",
					success: true,
					message: "Interceptor creation working",
					duration: 0,
				};
			} catch (error) {
				return {
					name: "Interceptor Creation",
					success: false,
					message: error instanceof Error ? error.message : String(error),
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		},
	},
];

// Test suite definitions
const unitTestSuites: TestSuite[] = [
	{
		name: "Transform Modules",
		tests: transformTests,
	},
	{
		name: "Utility Modules",
		tests: utilityTests,
	},
	{
		name: "Interceptor Module",
		tests: interceptorTests,
	},
];

async function main() {
	console.log("🔬 Claude Bridge Unit Test Suite");
	console.log("=================================");

	const runner = new TestRunner();

	// Run all unit test suites
	for (const suite of unitTestSuites) {
		await runner.runSuite(suite);
	}

	// Print summary
	runner.printSummary();

	// Exit with appropriate code
	process.exit(runner.hasFailures() ? 1 : 0);
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("💥 Fatal error:", error);
		process.exit(1);
	});
}

export { unitTestSuites, main as testMain };
