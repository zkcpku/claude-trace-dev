# Package Structure

## Core Packages

- **packages/lemmy/**: Core LLM client library

   - `src/types.ts` - Main type definitions
   - `src/clients/` - Client implementations (anthropic, google, openai)
   - `src/context.ts` - Context management
   - `src/model-registry.ts` - Model registration and management
   - `src/tools/` - Tool system and Zod converters
   - `src/generated/` - Auto-generated config schema and model definitions
   - `test/` - Comprehensive test suite

- **packages/lemmy-tui/**: Terminal UI components
   - `src/tui.ts` - Main TUI framework
   - `src/text-editor.ts` - Text editing component
   - `src/markdown-component.ts` - Markdown rendering
   - `src/select-list.ts` - Selection lists
   - `src/autocomplete.ts` - Auto-completion system
   - `src/text-component.ts` - Text display component
   - `src/logger.ts` - Logging utilities

## Examples

- **examples/lemmy-chat/**: Chat application example
- **examples/red-teaming/**: Red teaming utilities

# General Guidelines

- Read the types in packages/lemmy/src/types.ts, and the types in packages/lemmy-tui/src/\*.ts to understand the API
- Typecheck via npm run typecheck (includes src and test files, no errors) either in the root dir, or in a specific package or example directory.
- To test the lemmy package, run `npm run test:run`
- The lemmy-tui package has no tests.
- To test the lemmy-tui package, use: `npx tsx --no-deprecation src/index.ts chat --simulate-input "Hello world" "ENTER"` to simulate user input. You can then look at the tui-debug.log file to see logs in addition to the output in the terminal.
- To test commands like model switching, use: `npx tsx --no-deprecation src/index.ts chat --simulate-input "/" "model" "SPACE" "gpt-4o" "ENTER"`
- Special input keywords for simulation: "TAB", "ENTER", "SPACE", "ESC"
