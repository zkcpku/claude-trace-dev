# claude-bridge

Use OpenAI, Google, and other LLM providers with Claude Code by intercepting and transforming API requests.

## Quick Start

```bash
npm install -g @mariozechner/claude-bridge

# Set API keys (optional - can specify per-command with --apiKey)
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...

# Discovery workflow
claude-bridge                     # Show available providers
claude-bridge openai              # Show OpenAI models
claude-bridge openai gpt-4o       # Run Claude Code with GPT-4

# Advanced usage
claude-bridge openai gpt-4o --apiKey sk-...                           # Custom API key
claude-bridge openai llama3.2 --baseURL http://localhost:11434/v1     # Local Ollama
claude-bridge openai gpt-4o --debug                          # Enable debug logs

# All Claude Code arguments work
claude-bridge google gemini-2.5-pro-preview-05-06 --resume --continue
claude-bridge openai o4-mini -p "Hello world"
```

## How It Works

Claude Code only works with Anthropic models. This tool intercepts Claude Code's API calls and routes them to other providers while preserving (almost) full tool compatibility.

1. **Spawn** Claude Code as subprocess with custom Node.js loader
2. **Patch** global fetch() to intercept `api.anthropic.com/v1/messages` requests
3. **Transform** Anthropic requests → unified lemmy format → provider API
4. **Stream** provider responses back in Anthropic SSE format

## Limitations

- ❌ No token usage/cost reporting (Claude Code's displays won't work)
- ❌ No input caching (Claude Code's prompt caching not implemented - may increase costs)
- ❌ No image support (drag/drop, paste, file paths - needs Anthropic's server-side parsing)
- ❌ Web search/fetch tools (Anthropic-specific, could be translated to other provider's built-in search/fetch)
- ⚠️ Model-specific features may not translate (Claude's artifacts, GPT's reasoning modes)
- ⚠️ Thinking/reasoning output formatting differs between providers. OpenAI, put the god damn thinking tokens into your API responses, you cowards.
- ⚠️ Error handling, context limits, rate limiting vary by provider
- ⚠️ Complex tool schema conversion may not be perfect (JSON Schema ↔ Zod)
- ⚠️ Subtle streaming behavior differences despite Anthropic SSE format conversion
- ⚠️ Provider auth failures may not surface clearly in Claude Code

## Development

**Setup:**

```bash
git clone https://github.com/badlogic/lemmy
cd lemmy && npm install && npm run dev
```

This starts compilation in watch mode for all packages and apps. Code changes are reflected immediately. Alternatively, use `npx tsx <entrypoint.ts>` for on-the-fly compilation.

**Testing:**

```bash
npm run test:all         # All tests
npm run test:unit        # Unit tests
npm run test:core        # CLI functionality
npm run test:tools       # Tool integration
npm run test:providers   # Multi-provider
```

**Debugging:**

```bash
# Enable debug logging
claude-bridge openai gpt-4o --debug
cat .claude-bridge/*.jsonl              # View logs

# VS Code debugging
npx tsx src/cli.ts <arguments>          # In JavaScript Debug Terminal
```

**Core Files:**

- `src/cli.ts` - CLI with provider discovery
- `src/interceptor.ts` - Fetch interception & client creation
- `src/transforms/` - Request/response transformations
- `src/utils/` - SSE streaming, logging, parsing
