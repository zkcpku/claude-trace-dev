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
   - `src/tui.ts` - Main TUI framework with differential rendering
   - `src/text-editor.ts` - Text editing component
   - `src/markdown-component.ts` - Markdown rendering
   - `src/select-list.ts` - Selection lists
   - `src/autocomplete.ts` - Auto-completion system
   - `src/text-component.ts` - Text display component
   - `src/logger.ts` - Logging utilities

## Apps

- **apps/lemmy-chat/**: Chat application example
- **apps/red-teaming/**: Red teaming utilities

# TUI Differential Rendering

The TUI framework uses differential rendering for performance - only redrawing parts of the screen that have changed.

## How it works:

1. Each component returns `{lines: string[], changed: boolean}`
2. Containers also return `keepLines: number` - the count of unchanged lines from the beginning
3. On render, the TUI calculates how many lines from the top are unchanged (`keepLines`)
4. It moves the cursor up by `(totalLines - keepLines)` positions from the bottom
5. Clears from that position down with `\x1b[0J`
6. Prints only the changing lines: `result.lines.slice(keepLines)`
7. Each line ends with `\n` so cursor naturally ends up at the bottom for next render

**Important:** Don't add extra cursor positioning after printing - it interferes with terminal scrolling and causes rendering artifacts.

## Component behavior:

- **Components**: Return `{lines, changed}` only
- **Containers**: Return `{lines, changed, keepLines}` and aggregate child components
- **TextEditor**: Always returns `changed: true` to ensure cursor updates are reflected

# General Guidelines

- Read the types in packages/lemmy/src/types.ts, and the types in packages/lemmy-tui/src/\*.ts to understand the API
- Typecheck via npm run typecheck (includes src and test files, no errors) either in the root dir, or in a specific package or app directory.
- To test the lemmy package, run `npm run test:run`
- The lemmy-tui package has no tests.
- To test the lemmy-tui package, use: `npx tsx --no-deprecation src/index.ts chat --simulate-input "Hello world" "ENTER"` to simulate user input. You can then look at the tui-debug.log file to see logs in addition to the output in the terminal.
- To test commands like model switching, use: `npx tsx --no-deprecation src/index.ts chat --simulate-input "/" "model" "SPACE" "gpt-4o" "ENTER"`
- Special input keywords for simulation: "TAB", "ENTER", "SPACE", "ESC"

# Type Safety Guidelines

**CRITICAL: Avoid `any` at all costs!** Use proper TypeScript types wherever possible:

- Import and use the specific types from packages/lemmy/src/types.ts (AskOptions, AnthropicAskOptions, OpenAIAskOptions, GoogleAskOptions, etc.)
- Never use `any` when a proper type exists
- If dynamic properties are needed, use proper type unions or mapped types
- Always prefer type safety over convenience
- When you see `: any` in code, consider it a bug that needs fixing
