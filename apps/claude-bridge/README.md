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

# With custom API key
claude-bridge openai gpt-4o --apiKey sk-...

# With local Ollama (or any OpenAI-compatible API) and a model taht supports tool use/function calls
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

### How it works

1. **Intercepts** Claude Code's API calls to `api.anthropic.com`
2. **Transforms** Anthropic requests → unified lemmy format
3. **Routes** to OpenAI/Google using `createClientForModel()`
4. **Converts** responses back to Anthropic SSE format
5. **Logs** everything for debugging

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

### Logs

All requests/responses are logged to `.claude-bridge/`:

```bash
cat .claude-bridge/requests-*.jsonl     # Raw Anthropic requests
cat .claude-bridge/transformed-*.jsonl  # Converted lemmy format
cat .claude-bridge/responses-*.jsonl    # Provider responses
```

## Limitations

- **Built-in tools** like `web_search` cannot be bridged (no schema definition)
- **API keys required** for each provider you want to use
