/**
 * Shared test configuration for claude-bridge tests
 *
 * This file defines the standard provider/model combinations used across all tests
 * that invoke the CLI with real providers and models.
 */

import type { Provider } from "../src/types.js";

export interface TestProviderConfig {
	provider: Provider;
	model: string;
	displayName: string;
}

/**
 * Standard test provider configurations
 * Every test that invokes CLI with real providers should test both of these
 */
export const TEST_PROVIDERS: TestProviderConfig[] = [
	{
		provider: "openai",
		model: "gpt-4.1",
		displayName: "OpenAI GPT-4.1",
	},
	{
		provider: "google",
		model: "gemini-2.5-flash-preview-05-20",
		displayName: "Google Gemini 2.5 Flash Preview",
	},
];

/**
 * Get all provider/model combinations for testing
 */
export function getTestProviders(): TestProviderConfig[] {
	return TEST_PROVIDERS;
}

/**
 * Get a specific provider config by name
 */
export function getTestProvider(provider: string): TestProviderConfig | undefined {
	return TEST_PROVIDERS.find((p) => p.provider === provider);
}

/**
 * Generate test name suffix for provider/model combination
 */
export function getTestSuffix(config: TestProviderConfig): string {
	return `(${config.displayName})`;
}

/**
 * Generate test name with provider suffix
 */
export function getTestName(baseName: string, config: TestProviderConfig): string {
	return `${baseName} ${getTestSuffix(config)}`;
}
