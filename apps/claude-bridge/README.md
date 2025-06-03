# claude-bridge

Use OpenAI, Google, and other LLM providers with Claude Code by proxying and transforming requests.

## Quick Start

```bash
# Discover available providers
claude-bridge

# See models for a provider
claude-bridge openai

# Use Claude Code with GPT-4
claude-bridge openai gpt-4o

# Use Claude Code with Gemini
claude-bridge google gemini-2.0-flash-exp

# With API key
claude-bridge openai gpt-4o --apiKey sk-...

# With local Ollama (or any OpenAI-compatible API) and a model that supports tool use/function calls
claude-bridge openai llama3.2 --baseURL http://localhost:11434/v1

# Remaining arguments are passed to Claude Code
claude-bridge openai gpt-4o -p "Hello world"
claude-bridge openai gpt-4o --resume
claude-bridge openai gpt-4o --continue
```

## What it does

Claude Code only works with Anthropic models. `claude-bridge` intercepts Claude Code's API calls and forwards them to other providers (OpenAI, Google) while preserving full compatibility with Claude Code's tools and interface.

## Installation

```bash
npm install
npm run build
```

## Usage

The CLI follows a natural discovery pattern:

```bash
# No args - show all providers
claude-bridge

# Provider only - show available models
claude-bridge openai
claude-bridge google

# Provider + model - run Claude Code
claude-bridge openai gpt-4o
claude-bridge google gemini-2.0-flash-exp

# Help
claude-bridge --help
```

### Environment Variables

Set API keys for the providers you want to use:

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
```

## Developer Overview

### Architecture

```
Claude Code → Interceptor → Transform → Provider API → Stream back
```

**Core files:**

- `src/cli.ts` - Natural CLI with provider discovery
- `src/interceptor.ts` - Fetch interception and provider-agnostic client creation
- `src/transforms/` - Request/response transformations (Anthropic ↔ Lemmy ↔ Provider)
- `src/utils/` - SSE streaming, logging, request parsing

### How injection works

1. **CLI spawns Claude Code** as subprocess with custom Node.js loader (`--loader ./dist/interceptor-loader.js`)
2. **Loader patches global fetch()** before any modules load, intercepting all HTTP requests
3. **Request detection** - Only `api.anthropic.com/v1/messages` requests are transformed, others pass through
   - Haiku model requests are skipped (used for utility/cosmetic functions in Claude Code)
4. **Transform pipeline**:
   - Anthropic MessageCreateParams → SerializedContext (lemmy format)
   - Route to provider using `createClientForModel(model, config)`
   - Provider response → Anthropic SSE format
5. **Stream back** - Convert provider streaming to Claude Code's expected Anthropic SSE format
6. **Debug logging** - When `--debug` flag is used, requests/responses are logged to `.claude-bridge/`

### Key Features

- **Provider Agnostic**: Uses lemmy's unified interface - easy to add new providers
- **Type Safe**: Full TypeScript with exhaustive provider handling
- **Capability Aware**: Filters models to tool+image capable, validates at runtime
- **Tool Compatible**: All 18 Claude Code tools work with any provider
- **Natural CLI**: Progressive discovery interface like lemmy-chat

### Testing

```bash
# Run all tests
npm run test:all

# Individual categories
npm run test:unit        # Fast unit tests
npm run test:core        # Basic CLI functionality
npm run test:tools       # Tool integration tests
npm run test:providers   # Multi-provider tests
```

The test framework handles CLI subprocess spawning (vitest limitation) and tests every provider with real API calls.

### Debug Logs

When using `--debug`, requests/responses are logged to `.claude-bridge/`:

```bash
claude-bridge openai gpt-4o --debug     # Enable logging

cat .claude-bridge/requests-*.jsonl     # Raw Anthropic requests
cat .claude-bridge/transformed-*.jsonl  # Converted lemmy format
cat .claude-bridge/log.txt              # General debug log
```

## Caveats

### Core Limitations

- **No token usage/cost reporting** - Claude Code's token usage and cost display won't work with other providers
- **No input caching** - Claude Code's prompt caching isn't implemented, which may increase costs for repetitive requests
- **API keys required** - You need separate API keys for each provider you want to use

### Claude Code Feature Compatibility

- **Image support doesn't work** - Claude Code's drag & drop, copy & paste, and file path image features rely on Anthropic's server-side parsing to convert tool/MCP outputs into image attachments
- **Web search/fetch tools don't work** - These are Anthropic-specific built-in tools with no public schema
- **Built-in tools** like `web_search` and `computer_use` cannot be bridged (no schema definitions available)

### Provider Differences

- **Model-specific features** - Provider-unique features (Claude's artifacts, GPT's reasoning modes) may not translate properly
- **Thinking/reasoning output** - Different providers format thinking content differently, which may affect display
- **Error handling** - Provider-specific errors might not translate perfectly to Claude Code's expected format
- **Context length limits** - Different providers have varying context limits that may not be obvious from model names
- **Rate limiting** - The bridge doesn't handle provider-specific rate limiting differences

### Technical Limitations

- **Tool schema conversion** - Complex tool schemas might not convert perfectly between JSON Schema and Zod formats
- **Streaming behavior** - While responses are converted to Anthropic SSE format, subtle streaming differences may occur
- **Authentication errors** - Provider authentication failures may not surface clearly in Claude Code's interface

Just try it out :)
