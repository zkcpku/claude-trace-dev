# Claude Bridge Refactoring Plan

## Overview

This document outlines the comprehensive refactoring of the claude-bridge application to improve modularity, type safety, and provider support while maintaining compatibility with Claude Code.

## Goals

1. **Modularize codebase** - Split monolithic interceptor into focused modules
2. **Remove provider-specific hardcoding** - Use lemmy's `createClientForModel()` for provider-agnostic client creation
3. **Improve CLI interface** - Follow proven lemmy-chat patterns with enhanced capability validation
4. **Add type safety** - Exhaustive switch statements and proper TypeScript coverage
5. **Filter incapable models** - Only expose models with tool and image support
6. **Handle capability mismatches** - Runtime warnings and automatic adjustments

## Current State Analysis

### Issues

- [ ] **Monolithic interceptor**: 607-line class handling too many responsibilities
- [ ] **OpenAI hardcoded**: `lemmy.openai()` client creation prevents other providers
- [ ] **Mixed concerns**: Transform logic scattered between files
- [x] **Basic CLI**: Minimal interface compared to lemmy-chat capabilities
- [x] **No capability validation**: No checks for thinking, output tokens, tools, images
- [ ] **Missing abstractions**: No clear separation of request/response transformations

## New CLI Interface

### Command Structure

```bash
# Natural discovery pattern
claude-bridge                           # Show all providers
claude-bridge <provider>                # Show models for provider
claude-bridge <provider> <model>        # Run with provider and model

# Help
claude-bridge --help                    # Show help and usage
claude-bridge -h                        # Show help and usage

# Full execution
claude-bridge <provider> <model> [--apiKey <key>] [--baseURL <url>] [--maxRetries <num>] [claude-code-args...]
```

### Examples

```bash
# Natural discovery flow
claude-bridge                           # Show providers: anthropic, openai, google
claude-bridge openai                    # Show OpenAI models: gpt-4o, gpt-4o-mini, etc.
claude-bridge google                    # Show Google models: gemini-2.0-flash-exp, etc.
claude-bridge anthropic                 # Show Anthropic models: claude-sonnet-4, etc.

# Help
claude-bridge --help                    # Show full help with examples

# Chat mode (default)
claude-bridge openai gpt-4o
claude-bridge google gemini-2.0-flash-thinking-exp

# Single-shot prompts
claude-bridge openai gpt-4o -p "Hello world"
claude-bridge anthropic claude-sonnet-4-20250514 -p "Debug this code"

# With custom configuration
claude-bridge openai gpt-4o --apiKey sk-... --baseURL http://localhost:8080 --maxRetries 3
```

### CLI Implementation Tasks

- [x] **Help Commands**: Handle `--help` and `-h` flags for full help output
- [x] **No Args Handler**: Handle `claude-bridge` (no args) to show providers with usage hint
- [x] **Provider Discovery**: Handle `claude-bridge <provider>` to show provider-specific models
- [x] **Natural Error Handling**: Show available options when invalid provider/model provided
- [x] **Progressive Disclosure**: Each partial command guides to next step
- [x] Replace current argument parsing with natural discovery pattern
- [x] Add `--baseURL` and `--maxRetries` optional arguments
- [x] Remove defaults system (users always specify provider + model)
- [x] Validate provider and model combinations using lemmy model registry
- [x] Pass through remaining args to Claude Code unchanged

## Model Filtering & Capability Validation

### Default Model Filtering

- [x] Filter models to only include those with `supportsTools: true`
- [x] Filter models to only include those with `supportsImageInput: true`
- [x] Create utility function `getCapableModels()` for filtered model list

### Runtime Capability Validation

- [x] **Output Token Validation**: Check if Claude Code requested tokens > model max, log warning
- [ ] **Thinking Conversion**: Convert Anthropic thinking params to provider-specific options
- [ ] **Tool Support Check**: Warn if tools are required but model doesn't support them
- [ ] **Image Support Check**: Warn if images are present but model doesn't support them

### Provider-Specific Thinking Conversion

```typescript
switch (provider) {
	case "anthropic":
		askOptions.thinkingEnabled = true;
		break;
	case "google":
		askOptions.includeThoughts = true;
		break;
	case "openai":
	// No thinking support, log warning; break;
	default:
	// TypeScript will catch missing cases
}
```

**Note**: We don't have thinking capability metadata in model data, so we handle thinking conversion at runtime based on provider type, not model-specific capabilities.

## File Structure Refactoring

### Target Structure

```
src/
├── cli.ts                        # Enhanced CLI with new interface
├── index.ts                      # Main exports (unchanged)
├── interceptor.ts               # Simplified, provider-agnostic core
├── types.ts                     # Enhanced with capability types
├── transforms/
│   ├── anthropic-to-lemmy.ts   # Anthropic MessageCreateParams → SerializedContext
│   ├── lemmy-to-anthropic.ts   # AskResult → Anthropic SSE format
│   └── tool-schemas.ts         # JSON Schema ↔ Zod conversions
└── utils/
    ├── sse.ts                  # SSE parsing and generation
    ├── logger.ts               # File logging utilities
    └── request-parser.ts       # HTTP request parsing
```

### File Creation/Modification Tasks

#### CLI Module (`src/cli.ts`)

- [x] **Help Output**: Handle `--help`/`-h` with comprehensive usage examples
- [x] **No Args Handler**: Show available providers when no arguments provided
- [x] **Provider Handler**: Handle `claude-bridge <provider>` to show provider models
- [x] **Natural Discovery**: Implement progressive disclosure pattern
- [x] **Error Guidance**: Show available options on invalid provider/model
- [x] **Model Capabilities Display**: Show tools, images, max tokens for each model
- [x] Implement natural argument parsing: detect provider vs help vs provider+model
- [x] Add validation for provider and model combinations using lemmy model registry
- [x] Add `--apiKey`, `--baseURL`, `--maxRetries` argument handling
- [x] Filter available models to only capable ones (tools + images)
- [x] Remove defaults system completely
- [x] Pass through Claude Code arguments unchanged

#### Types Enhancement (`src/types.ts`)

- [ ] Add capability mismatch warning types
- [ ] Add provider-specific configuration types
- [ ] Add runtime validation result types
- [ ] Ensure compatibility with existing logging types

#### Interceptor Refactoring (`src/interceptor.ts`)

- [ ] Remove OpenAI-specific client creation
- [ ] Replace with `createClientForModel(model, config)` from lemmy
- [ ] Add provider-agnostic client handling
- [ ] Implement capability validation at request time
- [ ] Add output token limit checking and warnings
- [ ] Add thinking parameter conversion logic
- [ ] Maintain Anthropic SSE response format
- [ ] Simplify to coordination role only

#### Transform Modules

##### `src/transforms/anthropic-to-lemmy.ts`

- [x] Extract `transformAnthropicToLemmy()` from current `transform.ts`
- [x] Extract Anthropic message conversion functions
- [ ] Add capability validation during transformation
- [ ] Add thinking parameter extraction
- [x] Maintain tool and attachment conversion logic

##### `src/transforms/lemmy-to-anthropic.ts` (NEW)

- [x] Create `createAnthropicSSE()` function
- [x] Convert `AskResult` to Anthropic SSE stream format
- [x] Handle thinking content conversion back to Anthropic format
- [x] Handle tool calls and tool results
- [x] Maintain compatibility with current SSE generation

##### `src/transforms/tool-schemas.ts`

- [x] Extract `jsonSchemaToZod()` from current `transform.ts`
- [x] Add comprehensive schema conversion utilities
- [x] Add error handling for schema conversion failures
- [ ] Add validation for tool schema compatibility

#### Utility Modules

##### `src/utils/sse.ts`

- [x] Extract SSE parsing from interceptor
- [x] Extract SSE generation utilities
- [x] Create reusable SSE stream creation functions
- [x] Add error event generation
- [x] Maintain Anthropic SSE format compatibility

##### `src/utils/logger.ts`

- [x] Extract `FileLogger` class from interceptor
- [x] Add structured logging for capability warnings
- [x] Add request/response correlation logging
- [x] Maintain existing log file formats

##### `src/utils/request-parser.ts`

- [x] Extract HTTP request parsing logic
- [x] Add request validation utilities
- [x] Add header redaction functionality
- [x] Maintain existing security practices

## Provider Integration

### Remove Hardcoded Provider Logic

- [ ] Replace `this.openaiClient = lemmy.openai(...)` with dynamic client creation
- [ ] Use `createClientForModel(model, { apiKey, model, ...config })` pattern
- [ ] Add provider type validation using lemmy's type system

### Type-Safe Provider Handling

- [ ] Add exhaustive switch statements for provider-specific logic
- [ ] Use TypeScript's strict checking to catch missing provider cases
- [ ] Add provider capability checking functions

### Provider-Specific Configuration

- [ ] Map CLI arguments to provider-specific client configs
- [ ] Handle provider-specific ask options (thinking, reasoning, etc.)
- [ ] Validate provider-specific parameter combinations

## Testing Strategy

### Unit Tests

- [ ] Test new CLI argument parsing
- [ ] Test model filtering logic
- [ ] Test capability validation functions
- [ ] Test transform modules independently
- [ ] Test provider-specific logic branches

### Integration Tests

- [ ] Test end-to-end request/response flow
- [ ] Test capability mismatch handling
- [ ] Test provider switching
- [ ] Test error scenarios

### Compatibility Tests

- [ ] Ensure existing Claude Code usage patterns still work
- [ ] Test Anthropic SSE format compatibility
- [ ] Test tool execution compatibility
- [ ] Test attachment handling

## Migration Plan

### Phase 1: CLI Enhancement

- [x] Implement natural discovery pattern (no args → providers, provider → models)
- [x] Implement progressive disclosure CLI interface
- [x] Add model filtering for capable models only
- [x] Add model capability display and error guidance
- [x] Test CLI functionality independently

### Phase 2: Extract Utilities

- [x] Create utility modules (sse.ts, logger.ts, request-parser.ts)
- [x] Test utilities independently
- [x] Update interceptor to use utilities

### Phase 3: Extract Transforms

- [x] Create transform modules
- [x] Test transformations independently
- [x] Update interceptor to use transforms

### Phase 4: Provider Generalization

- [ ] Remove OpenAI hardcoding
- [ ] Add dynamic client creation
- [ ] Add capability validation
- [ ] Test with multiple providers

### Phase 5: Testing & Polish

- [ ] Add comprehensive tests
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Final compatibility verification

## Success Criteria

- [ ] **Modularity**: Each file has single, clear responsibility
- [x] **Type Safety**: No `any` types, exhaustive provider handling
- [ ] **Provider Agnostic**: Easy to add new providers without core changes
- [x] **Capability Aware**: Automatic validation and helpful warnings
- [ ] **Backward Compatible**: Existing Claude Code usage continues to work
- [x] **Clean CLI**: Intuitive interface following proven patterns
- [ ] **Maintainable**: Clear separation of concerns, easy to debug

## Reference Files from Lemmy Packages

During the refactor, we'll need to reference these key files from the lemmy packages for patterns, types, and utilities:

### Core Types and Interfaces

- **`packages/lemmy/src/types.ts`**: Core type definitions
   - `ChatClient` interface and `AskResult` types
   - `Context`, `SerializedContext`, and message types
   - `ToolCall`, `ToolResult`, and tool-related types
   - Provider-agnostic types we should use consistently

### Model Registry and Provider Management

- **`packages/lemmy/src/model-registry.ts`**: Provider-agnostic client creation
   - `createClientForModel()` - key function to replace OpenAI hardcoding
   - `getProviderForModel()` - determine provider from model name
   - `findModelData()` - get model capabilities and limits
   - `ModelData` interface with `supportsTools`, `supportsImageInput`, `maxOutputTokens`

### Configuration Schemas

- **`packages/lemmy/src/configs.ts`**: Zod schemas for validation
   - `ProviderSchema` enum for type-safe provider validation
   - `AnthropicAskOptions`, `OpenAIAskOptions`, `GoogleAskOptions` types
   - `CLIENT_CONFIG_SCHEMAS` for CLI argument validation
   - Provider-specific config types: `AnthropicConfig`, `OpenAIConfig`, `GoogleConfig`

### Model Data

- **`packages/lemmy/src/generated/models.ts`**: Auto-generated model definitions
   - `AnthropicModelData`, `OpenAIModelData`, `GoogleModelData` objects
   - Model capability data (tools, images, tokens, pricing)
   - `ModelToProvider` mapping for provider determination
   - Type definitions: `AnthropicModels`, `OpenAIModels`, `GoogleModels`, `AllModels`

### Lemmy Chat Patterns

- **`apps/lemmy-chat/src/defaults.ts`**: Configuration management patterns

   - `getProviderConfig()` - how to build provider configs with API keys
   - `buildProviderConfig()` - validation and config construction
   - Patterns for environment variable handling and validation

- **`apps/lemmy-chat/src/one-shot.ts`**: Usage patterns

   - How to use `createClientForModel()` in practice
   - Streaming callback setup and thinking handling
   - Error handling and user feedback patterns

- **`apps/lemmy-chat/src/index.ts`**: CLI patterns
   - Natural discovery command patterns and help text
   - Progressive disclosure and error guidance
   - Provider validation and default handling

### Core Lemmy Entry Point

- **`packages/lemmy/src/index.ts`**: Main exports and client factory
   - `lemmy.anthropic()`, `lemmy.openai()`, `lemmy.google()` factory functions
   - Understanding how lemmy clients are created and configured

### Key Patterns to Follow

1. **Provider-Agnostic Client Creation**: Use `createClientForModel(model, config)` instead of hardcoded `lemmy.openai()`
2. **Capability Validation**: Use `ModelData` properties for runtime validation
3. **Type Safety**: Use proper TypeScript types from lemmy packages
4. **Configuration**: Follow lemmy-chat patterns for CLI argument handling
5. **Error Handling**: Use lemmy's error types and patterns
6. **Thinking Support**: Handle provider-specific thinking parameters properly

## Notes

- Keep Anthropic SSE response format (required by Claude Code)
- Maintain existing log file formats for compatibility
- Use lemmy's type system and utilities wherever possible
- Ensure all provider-specific code is clearly marked and type-checked
- Add comprehensive error handling and user-friendly messages
