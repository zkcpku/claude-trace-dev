# API Improvement TODOs

## Design Issues

### Naming Consistency

- [x] Fix inconsistent naming: `AnthropicAskOptions.thinkingBudget` vs `AnthropicConfig.thinking.budgetTokens`
   - [x] Choose one naming convention (either `budget` or `budgetTokens`) and apply consistently
   - [x] Updated to use `maxThinkingTokens` and `thinkingEnabled` consistently
   - [x] Flattened nested `thinking` object in config
- [x] Add missing `GoogleAskOptions extends AskOptions` for consistency with other providers
- [x] Review and standardize all provider-specific option naming
   - [x] All providers now have consistent AskOptions that mirror config fields

### Tool Result Type System

- [ ] Fix `ToolExecutionResult.result?: any` - replace with proper generic constraints
- [ ] Consider preserving typed results longer in pipeline before string serialization
- [ ] Add `TypedToolResult<T>` interface to maintain type safety:
   ```typescript
   interface TypedToolResult<T> {
   	toolCallId: string;
   	result: T; // Preserve original type
   	serialized: string; // For LLM consumption
   }
   ```

### Message Type Cleanup

- [x] Evaluate `UserInput` vs `UserMessage` duplication - make more distinct or merge
   - [x] Renamed `UserInput` to `AskInput` to clarify it's specifically for ask method input
- [x] Consider if both types are truly needed or can be simplified

### Context Interface Refactoring

- [ ] Split Context into separate concerns:
   - [ ] `Conversation` - message management
   - [ ] `ToolRegistry` - tool definitions and execution
   - [ ] `CostTracker` - usage and cost tracking
- [ ] Or keep unified but add clear separation of responsibilities

## API Ergonomics Issues

### Tool Workflow Simplification

- [ ] Add helper method for common tool execution pattern:
   ```typescript
   const result = await context.runToolLoop(client, "prompt");
   ```
- [ ] Reduce verbose tool workflow from current multi-step process
- [ ] Consider automatic tool loop execution with escape hatches

### Cost Tracking Consistency

- [ ] Consolidate cost tracking sources:
   - [ ] `AskResult.cost`
   - [ ] `Context.getTotalCost()`
   - [ ] `AssistantMessage.usage`
- [ ] Establish single source of truth for cost/usage data
- [ ] Add methods like `getCostByProvider()`, `getCostByModel()` to Context

## Missing Features

### Streaming & Real-time

- [ ] Add streaming tool calls support (currently only available after completion)
- [ ] Add tool cancellation mechanism
- [ ] Add tool execution timeout configuration

### Context Management

- [ ] Add context serialization/deserialization for saving conversation state
- [ ] Add message editing capabilities (modify/delete messages from context)
- [ ] Add context branching/forking for conversation exploration

### Enhanced Tool System

- [ ] Add tool execution middleware/hooks
- [ ] Add tool dependency resolution
- [ ] Add tool execution retry logic

## Type Safety Improvements

### Remove `any` Types

- [ ] Replace `ToolExecutionResult.result?: any` with proper generics
- [ ] Replace `getTool(): ToolDefinition<any, any>` with better constraints
- [ ] Audit codebase for other `any` usage

### Better Null Handling

- [ ] Add helper methods to reduce optional chaining patterns like `result.message.toolCalls?.[0]?.arguments`
- [ ] Consider Result/Option types for better error handling
- [ ] Add utility functions for common access patterns

## Configuration & Setup

### Provider Configuration

- [x] Add `GoogleAskOptions` interface with Google-specific parameters
- [x] Review if `GoogleConfig.includeThoughts` should have corresponding ask-time option
- [x] Standardize configuration patterns across all providers

### Error Handling

- [ ] Add retry strategies for different error types
- [ ] Add circuit breaker pattern for failing providers
- [ ] Add better error recovery mechanisms

## Developer Experience

### Documentation

- [ ] Add JSDoc examples for complex workflows
- [ ] Add inline examples for tool definition patterns
- [ ] Document common patterns and anti-patterns

### Testing Support

- [ ] Add mock providers for testing
- [ ] Add tool testing utilities
- [ ] Add conversation state testing helpers

### Debugging

- [ ] Add debug logging throughout the system
- [ ] Add conversation inspection utilities
- [ ] Add tool execution tracing

## Performance

### Memory Management

- [ ] Add context size limits and cleanup strategies
- [ ] Add tool result caching
- [ ] Add conversation pruning mechanisms

### Optimization

- [ ] Add parallel tool execution where possible
- [ ] Add request batching for multiple tool calls
- [ ] Add smart context compression

## Future Considerations

### Advanced Features

- [ ] Add conversation templates/presets
- [ ] Add tool composition and chaining
- [ ] Add multi-agent conversation support
- [ ] Add conversation analytics and insights

### Integration

- [ ] Add MCP (Model Context Protocol) support
- [ ] Add file attachment support beyond images
- [ ] Add webhook/callback support for async operations
