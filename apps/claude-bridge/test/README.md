# Claude Bridge Test Framework

This directory contains a lightweight test framework designed specifically for testing CLI applications that spawn subprocesses. Unlike vitest, this framework can handle testing CLI tools that spawn Claude Code as a subprocess.

## Test Framework Architecture

### Core Components

- **`framework.ts`** - Core test framework with assertion utilities and CLI test runners
- **`unit.ts`** - Unit tests for individual modules (transforms, utilities, interceptor)
- **`comprehensive.ts`** - Full E2E tests including CLI and tool integration
- **`runner.ts`** - Test runner with category-based execution

### Test Categories

#### 1. Unit Tests (`npm run test:unit`)

Fast tests for individual modules without spawning subprocesses:

- Transform module tests (Anthropic ↔ Lemmy conversions)
- Utility module tests (request parsing, provider creation, logging)
- Interceptor creation and basic functionality

#### 2. Core Tests (`npm run test:core`)

Essential CLI functionality tests:

- Basic bridge functionality
- CLI help and provider discovery
- Error handling

#### 3. Tool Tests (`npm run test:tools`)

Claude Code tool integration tests:

- Individual tool testing (Bash, LS, Read, Write, Edit, etc.)
- Tool schema validation
- Multi-tool scenarios

#### 4. Provider Tests (`npm run test:providers`)

Provider-specific integration tests:

- OpenAI integration
- Google integration
- Provider-specific parameter handling

#### 5. Comprehensive Tests (`npm run test:comprehensive`)

All E2E tests including CLI, tools, and providers

## Usage

### Quick Start

```bash
# Run default tests (unit + core)
npm test

# Run specific test categories
npm run test:unit          # Fast unit tests
npm run test:core          # Core functionality only
npm run test:tools         # Tool integration tests
npm run test:providers     # Provider integration tests
npm run test:comprehensive # All E2E tests

# Run all tests
npm run test:all
```

### Using the Test Runner Directly

```bash
# See available test categories
tsx test/runner.ts --help

# Run specific categories
tsx test/runner.ts unit
tsx test/runner.ts core
tsx test/runner.ts tools
tsx test/runner.ts providers
tsx test/runner.ts comprehensive
```

### Test Development

#### Creating Unit Tests

```typescript
import { TestRunner, TestSuite, Test, assert, assertEquals } from "./framework.js";

const myTests: Test[] = [
	{
		name: "My Feature Test",
		run: async () => {
			// Import your module
			const { myFunction } = await import("../src/my-module.js");

			// Test your function
			const result = myFunction("input");
			assertEquals(result, "expected", "Function should return expected value");

			return {
				name: "My Feature Test",
				success: true,
				message: "Test passed",
				duration: 0,
			};
		},
	},
];
```

#### Creating CLI Tests

```typescript
import { CLITestRunner, createBasicBridgeTest, createToolTest } from "./framework.js";

// Use pre-built test creators
const bridgeTest = createBasicBridgeTest("openai", "gpt-4o");
const toolTest = createToolTest("Bash", "Use the Bash tool to run 'echo hello'");

// Or create custom CLI tests
const customTest: Test = {
	name: "Custom CLI Test",
	run: async () => {
		const runner = new CLITestRunner("custom-test");
		await runner.setup();

		try {
			const result = await runner.runCLITest({
				provider: "openai",
				model: "gpt-4o",
				prompt: "Test prompt",
				expectedInLogs: ["expected content"],
				unexpectedInLogs: ["error content"],
			});

			const validation = runner.validateLogs(result.logs, options);
			await runner.cleanup();

			return {
				name: "Custom CLI Test",
				success: validation.success,
				message: validation.success ? "Test passed" : "Test failed",
				duration: 0,
				details: validation.details,
			};
		} catch (error) {
			await runner.cleanup();
			throw error;
		}
	},
};
```

## Key Features

### 1. CLI Testing Without vitest

- Spawns Claude Code as subprocess correctly
- Handles async subprocess execution
- Captures and validates logs
- Manages test directories and cleanup

### 2. Assertion Utilities

- `assert(condition, message)` - Basic assertion
- `assertEquals(actual, expected, message)` - Equality assertion
- `assertContains(haystack, needle, message)` - String containment
- `assertArrayContains(array, item, message)` - Array containment

### 3. Test Organization

- Test suites with setup/teardown
- Individual test isolation
- Timeout handling
- Result aggregation and reporting

### 4. Log Validation

- Automatic log file reading
- Expected/unexpected content validation
- Detailed failure reporting
- Log content assertion helpers

### 5. Provider-Agnostic Testing

- Test multiple providers (OpenAI, Google, Anthropic)
- Provider-specific validation
- Model capability testing
- Configuration validation

## Test Data Flow

1. **Setup**: Create isolated test directory
2. **Execute**: Run CLI with specific arguments
3. **Capture**: Read generated log files
4. **Validate**: Check logs for expected patterns
5. **Cleanup**: Remove test directories
6. **Report**: Aggregate and display results

## Adding New Tests

### 1. Add to Existing Suite

Add your test to an appropriate array in `unit.ts` or `comprehensive.ts`:

```typescript
const myTests: Test[] = [
	// existing tests...
	{
		name: "New Feature Test",
		run: async () => {
			// your test implementation
		},
	},
];
```

### 2. Create New Test Suite

Add a new test suite to the appropriate file:

```typescript
const newTestSuite: TestSuite = {
	name: "New Feature Suite",
	tests: myTests,
	setup: async () => {
		// optional setup
	},
	teardown: async () => {
		// optional teardown
	},
};

// Add to testSuites array
```

### 3. Add New Test Category

For completely new test categories, add to `runner.ts`:

```typescript
const testCategories: TestCategory[] = [
	// existing categories...
	{
		name: "newcategory",
		description: "Description of new category",
		runner: async () => {
			// implementation
		},
	},
];
```

## Best Practices

### 1. Test Isolation

- Each test gets its own directory
- Always clean up after tests
- Don't share state between tests

### 2. Fast Feedback

- Unit tests should be fast (< 1s each)
- E2E tests can be slower but should timeout appropriately
- Use timeouts to prevent hanging tests

### 3. Clear Assertions

- Use descriptive assertion messages
- Test one thing per test
- Make test names descriptive

### 4. Error Handling

- Always clean up on test failure
- Provide helpful error messages
- Log sufficient detail for debugging

### 5. Provider Testing

- Test with multiple providers when possible
- Use real API keys for integration tests
- Mock external dependencies for unit tests

## Debugging Tests

### 1. Run Individual Categories

```bash
npm run test:unit     # Quick feedback
npm run test:core     # Basic functionality
```

### 2. Check Test Logs

Failed tests include log output showing:

- CLI execution details
- Generated log files
- Validation failures
- Error messages

### 3. Manual Testing

```bash
# Test CLI manually
npm run build
./dist/cli.js openai gpt-4o -p "test prompt"

# Check generated logs
ls .claude-bridge/
cat .claude-bridge/requests-*.jsonl
```

### 4. Debug Mode

Add logging to your tests:

```typescript
console.log("Debug info:", result);
```

The test framework provides a solid foundation for testing CLI applications with subprocess spawning, comprehensive log validation, and provider-agnostic testing capabilities.
