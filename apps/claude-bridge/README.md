# claude-bridge

Use OpenAI, Google, and other LLM providers with Claude Code by intercepting and transforming API requests.

Not that anything can beat Opus, Sonnet and a Claude Max plan. But you can try that fools errand now. Go get Claude Max.

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
claude-bridge openai gpt-4o --baseURL https://openrouter.ai/api/v1 --apiKey sk-or-... # OpenRouter
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

This is a glorified hack that pretends other models are Claude. Here's what breaks:

**Completely Broken:**

- 🚫 Token usage/cost reporting (Claude Code's displays will lie to you)
- 🚫 Image uploads (drag/drop, paste, file paths - Claude Code expects Anthropic's servers)
- 🚫 Input caching (Claude Code's prompt caching isn't implemented - enjoy higher costs!)
- 🚫 Web search/fetch tools (Anthropic-specific magic)

**Somewhat Janky:**

- 🤷 Model-specific features don't translate (Claude's artifacts, GPT's reasoning modes)
- 🤷 Thinking/reasoning output formatting differs between providers
- 🤷 Error messages might be cryptic (provider auth failures won't surface clearly)
- 🤷 Tool schemas get converted (JSON Schema ↔ Zod) - usually works, sometimes doesn't
- 🤷 Streaming behavior has subtle differences despite SSE format conversion

**OpenAI Specific Rant:**
OpenAI, put the goddamn thinking tokens into your API responses, you cowards. We're all tired of your "reasoning effort" parameter nonsense.

There are definitely mystery bugs hiding in the corners. You've been warned. 🐛

## Development

**Setup:**

```bash
git clone https://github.com/badlogic/lemmy
cd lemmy && npm install && npm run dev
```

This starts compilation in watch mode for all packages and apps. Code changes are reflected immediately. Use `npx tsx src/cli.ts` for on-the-fly compilation & testing.

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
cat .claude-bridge/requests-*.jsonl     # Raw request/response pairs
cat .claude-bridge/transformed-*.jsonl  # Transformation details
cat .claude-bridge/context.jsonl        # Message contexts and transform status

# VS Code debugging (requires patching Claude to disable anti-debugging)
npx tsx src/cli.ts <arguments> --patch-claude   # In JavaScript Debug Terminal
```

**Bundling:**

This package uses a hybrid bundling approach:

- Core claude-bridge logic is bundled with lemmy package
- LLM provider SDKs (@anthropic-ai/sdk, openai, @google/genai, etc.) remain external dependencies
- This avoids Node.js dynamic require issues while keeping dependencies manageable

**Core Files:**

- `src/cli.ts` - CLI with provider discovery
- `src/interceptor.ts` - Fetch interception & client creation
- `src/transforms/` - Request/response transformations
- `src/utils/` - SSE streaming, logging, parsing
