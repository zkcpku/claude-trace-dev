# claude-bridge

Use non-Anthropic models (OpenAI, Google) with Claude Code by proxying and transforming requests.

## What it does

Claude Code only works with Anthropic's Claude models. `claude-bridge` intercepts Claude Code's API calls and forwards them to other LLM providers like OpenAI or Google, allowing you to use GPT-4, Gemini, and other models within Claude Code's interface.

## Usage

```bash
# Use OpenAI GPT-4o with Claude Code (defaults to chat mode)
claude-bridge --provider openai --model gpt-4o

# Use Google Gemini with a specific prompt in Claude Code headless mode
claude-bridge --provider google --model gemini-1.5-pro --run-with -p "Hello world"

# Use custom API key
claude-bridge --provider openai --model gpt-4o --apiKey sk-...

# Use custom log directory
claude-bridge --provider google --model gemini-1.5-pro --log-dir ./my-logs
```

### Options

- `--provider <provider>` - LLM provider (openai, google)
- `--model <model>` - Model name (e.g., gpt-4o, gemini-1.5-pro)
- `--apiKey <key>` - API key (optional, uses env vars)
- `--log-dir <dir>` - Log directory (default: .claude-bridge)
- `--run-with <args...>` - Claude Code arguments (default: chat)
- `--patch-claude` - Patch Claude binary to disable anti-debugging (development only)

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_API_KEY` - Google API key

## Development

### Architecture

```
Claude Code → claude-bridge (intercept) → Transform → Provider API → Transform → Stream back
```

**Core Components:**

- **CLI** (`src/cli.ts`) - Command-line interface and process management
- **Interceptor** (`src/interceptor.ts`) - Fetch interception and request/response logging
- **Types** (`src/types.ts`) - TypeScript interfaces and types
- **Loader** (`src/interceptor-loader.js`) - CommonJS loader for tsx/node compatibility

**How it works:**

1. **Interception**: Instruments `global.fetch()` to catch calls to `api.anthropic.com/v1/messages`
2. **Request Routing**: Haiku models → Anthropic, other models → configured provider
3. **Transformation**: Convert Anthropic requests → lemmy Context with tools and messages
4. **Provider Integration**: Call OpenAI/Google via lemmy unified interface
5. **Response Conversion**: Transform provider responses → Anthropic SSE streaming format
6. **Logging**: All requests/responses logged to `{logDir}/` with comprehensive error details

### Project Structure

```
src/
├── cli.ts                  # CLI entry point with commander
├── interceptor.ts          # Fetch interception + OpenAI forwarding + SSE conversion
├── interceptor-loader.js   # CommonJS loader for tsx compatibility
├── transform.ts           # Anthropic → lemmy format + JSON Schema to Zod conversion
├── types.ts               # TypeScript interfaces
├── patch-claude.ts        # Claude binary patching for debugging
└── index.ts               # Package exports

test/
└── e2e-standalone.ts      # End-to-end tests with OpenAI validation

dist/                      # Compiled JavaScript output
```

### Building & Testing

```bash
# Install dependencies (from monorepo root)
npm install

# Build lemmy package first (required dependency)
cd packages/lemmy && npm run build && cd ../..

# Build claude-bridge
cd apps/claude-bridge
npm run build

# Run tests
npm run test:e2e

# Type checking
npm run typecheck
```

### Development Workflow

**VSCode Debug Setup:**

Claude Code includes anti-debugging protection that prevents debuggers from attaching. For development, you can patch the Claude binary:

2. Set breakpoints in `src/cli.ts` or `src/interceptor.ts`
3. Open JavaScript Debug Terminal in VSCode
4. Run: `npx tsx --inspect src/cli.ts --provider openai --model gpt-4o --patch-code`, `--patch-code` will disable the anti-debug in Claude Code.
5. Debugger will attach automatically

**⚠️ Warning**: `--patch-claude` modifies your Claude binary in-place. A backup is saved to `{logDir}/claude.backup`. Restore with:

```bash
cp .claude-bridge/claude.backup /opt/homebrew/bin/claude
```

**Quick Testing:**

```bash
# Test CLI help
npx tsx src/cli.ts --help

# Test with minimal args (defaults to chat)
npx tsx src/cli.ts --provider openai --model gpt-4o

# For debugging/development with patched Claude
npx tsx src/cli.ts --provider openai --model gpt-4o --patch-claude
```

**Log Inspection:**

```bash
# Check interception logs
cat .claude-bridge/log.txt

# Check raw requests (when Claude actually makes calls)
cat .claude-bridge/requests-*.jsonl | jq

# Check transformed lemmy messages
cat .claude-bridge/transformed-*.jsonl | jq
```

### Current Status

- ✅ **Fetch Interception**: Working - captures v1/messages calls
- ✅ **File Logging**: Working - requests.jsonl + log.txt
- ✅ **CLI Interface**: Working - all arguments and validation
- ✅ **Testing**: Working - E2E tests with OpenAI validation
- ✅ **Request Transformation**: Working - Anthropic → lemmy UserMessage/AssistantMessage + tools
- ✅ **Transformation Logging**: Working - transformed.jsonl with lemmy messages + anthropic params
- ✅ **Provider Forwarding**: Working - Complete OpenAI integration via lemmy unified interface
- ✅ **Response Streaming**: Working - Converts OpenAI responses to Anthropic SSE format
- ✅ **Tool Support**: Working - JSON Schema to Zod conversion with $ref resolution
- ✅ **Error Handling**: Working - Comprehensive error logging for debugging failures

### Limitations

**❌ Claude Code Built-in Tools Not Supported**

Claude Code built-in tools cannot be bridged to other providers and will cause requests to fail. Known built-in tools include:

- `web_search_20250305` - Web search functionality

Other built-in tools likely exist (bash, text editor, computer control, etc.) but use provider-specific implementations that cannot be bridged.

**Why these tools can't be supported:**

1. **No Schema Definition**: Built-in tools don't include `input_schema`, making parameter conversion impossible
2. **Runtime Dependencies**: These tools require Claude Code's internal infrastructure and can't be executed through standard APIs
3. **Security Isolation**: Tools like `bash` and `computer` have special security sandboxing that other providers don't offer
4. **Provider Limitations**: Most LLM providers don't offer equivalent built-in tool capabilities

**Workaround**: Only use custom tools with defined schemas, or use requests without built-in tools when bridging to other providers.

### Dual-Path Behavior

The bridge implements intelligent request routing:

- **Haiku models** (`claude-3-5-haiku-*`) → Routed to Anthropic (preserves cost efficiency)
- **Other models** (`claude-sonnet-4-*`, etc.) → Routed to configured provider (OpenAI/Google)

This allows using fast/cheap Anthropic models for simple tasks while using other providers for complex requests.

### Transformation Details

The `transform.ts` module converts Anthropic API requests to lemmy's unified format:

- **Input**: Anthropic `MessageCreateParamsBase` (from `@anthropic-ai/sdk`)
- **Output**: `TransformResult` containing:
   - `context`: Lemmy `Context` object with system message, messages, and tools
   - `anthropicParams`: Anthropic-specific parameters not stored in Context

**Context includes:**

- **System message** → `context.setSystemMessage()`
- **Messages** → `context.addMessage()` for each `UserMessage`/`AssistantMessage`
- **Tools** → Preserved in `anthropicParams.tools` (not converted to lemmy format)

**Supported conversions:**

- Text content → `UserMessage.content` / `AssistantMessage.content`
- Images → `UserMessage.attachments[]` with proper mime types
- Tool results → `UserMessage.toolResults[]`
- Tool calls → `AssistantMessage.toolCalls[]`
- Thinking blocks → `AssistantMessage.thinking` + `thinkingSignature`
- Tool definitions → Preserved as original Anthropic format in `anthropicParams.tools`

**Log format** (`transformed-{timestamp}.jsonl`):

```json
{
	"timestamp": 1640995200.123,
	"request_id": "req_123_abc",
	"original_anthropic": {
		/* raw anthropic request */
	},
	"lemmy_context": {
		"system_message": "You are a helpful assistant",
		"messages": [
			/* UserMessage/AssistantMessage[] */
		]
	},
	"anthropic_params": {
		/* model, max_tokens, temperature, etc. */
	},
	"bridge_config": { "provider": "openai", "model": "gpt-4o" },
	"logged_at": "2023-01-01T00:00:00.000Z"
}
```
