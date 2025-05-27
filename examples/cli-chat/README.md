# Lemmy CLI Chat Example

A comprehensive CLI tool demonstrating automatic command-line argument generation from the lemmy configuration schema.

## Features

- **Auto-generated CLI options** from TypeScript interfaces using the generated config schema
- **Provider-specific subcommands** with proper validation and help text
- **Interactive chat mode** with persistent conversation context
- **Defaults system** - save your preferred settings and use them automatically
- **Image support** for multimodal models with automatic format detection
- **Gray thinking output** with proper visual separation for models that support it
- **Type-safe argument parsing** with enum validation and type coercion
- **Streaming output** with real-time token and cost tracking
- **Environment variable support** for API keys
- **Model discovery** with rich filtering and formatting

## Installation

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Install globally (optional)
npm link
```

## Quick Start

### 1. Set up your API keys

```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="..."
```

### 2. Set your default preferences

```bash
# Set defaults for your preferred provider and model
lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled
# or
lemmy-chat defaults openai -m o4-mini --reasoningEffort medium
```

### 3. Start chatting!

```bash
# Single message using defaults
lemmy-chat "What's the capital of France?"

# Interactive chat mode using defaults
lemmy-chat chat

# One-shot with image
lemmy-chat -i screenshot.png "What's in this image?"
```

## Commands

### Interactive Chat Mode

The most powerful feature - have extended conversations with persistent context:

```bash
# Uses your saved defaults
lemmy-chat chat

# With specific model and settings
lemmy-chat chat -p anthropic -m claude-sonnet-4-20250514 --thinkingEnabled
lemmy-chat chat -p openai -m o4-mini --reasoningEffort high

# Exit with 'exit', 'quit', or Ctrl+C
```

Features:

- **Persistent context** - the model remembers your entire conversation
- **Real-time streaming** with gray thinking output (when enabled)
- **Token and cost tracking** per message
- **Professional readline interface** with proper prompts

### Defaults System

Save your preferred settings and use them automatically:

```bash
# Set defaults (saves to ~/.lemmy-chat/defaults.json)
lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled
lemmy-chat defaults openai -m o4-mini --reasoningEffort medium
lemmy-chat defaults google -m gemini-2.0-flash --projectId my-project

# Show current defaults
lemmy-chat defaults --show

# Clear saved defaults
lemmy-chat defaults --clear

# Use defaults - no need to specify provider/model
lemmy-chat "Hello world"                    # Uses saved defaults
lemmy-chat chat                             # Interactive mode with defaults
lemmy-chat -i image.jpg "What's this?"     # Image analysis with defaults
```

### Model Discovery

Find the perfect model for your needs:

```bash
# List all models with capabilities and pricing
lemmy-chat models

# Filter by provider
lemmy-chat models --provider anthropic
lemmy-chat models --provider openai
lemmy-chat models --provider google

# Filter by capabilities
lemmy-chat models --tools           # Models with function calling
lemmy-chat models --images          # Models with image input
lemmy-chat models --cheap           # Models under $1/M input tokens

# Combine filters
lemmy-chat models --provider anthropic --tools
lemmy-chat models --cheap --images

# JSON output for scripting
lemmy-chat models --json
```

### One-Shot Messages

Direct interaction without persistent context:

```bash
# Basic usage (must specify provider and model without defaults)
lemmy-chat anthropic -m claude-sonnet-4-20250514 "Explain quantum computing"
lemmy-chat openai -m o4-mini --reasoningEffort high "Solve this math problem"
lemmy-chat google -m gemini-2.0-flash "Tell me a joke"

# Or use your saved defaults
lemmy-chat "Explain quantum computing"  # Uses whatever you set in defaults
```

### Image Support

Analyze images with multimodal models:

```bash
# Single image
lemmy-chat anthropic -m claude-sonnet-4-20250514 -i image.jpg "What's in this image?"
lemmy-chat -i screenshot.png "Explain this code"  # Uses defaults

# Multiple images
lemmy-chat openai -m gpt-4o --images img1.png img2.jpg "Compare these images"
lemmy-chat --images before.jpg after.jpg "What changed?"  # Uses defaults

# In interactive mode
lemmy-chat chat
# Then you can't add images mid-conversation (limitation), but you can start with defaults that include image support
```

**Supported formats**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.tif`

## Thinking Output

Models that support internal reasoning (like Claude with thinking enabled or OpenAI's o4-mini) show their thought process in **gray text** with proper visual separation:

```bash
# Enable thinking for Anthropic
lemmy-chat anthropic -m claude-sonnet-4-20250514 --thinkingEnabled "Solve this complex problem"

# OpenAI reasoning models automatically show thinking
lemmy-chat openai -m o4-mini --reasoningEffort high "Analyze this data"

# Save thinking preferences in defaults
lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled
```

The thinking appears in gray, followed by two blank lines, then the final response in normal color.

## Environment Variables

API keys are automatically detected from standard environment variables:

```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="..."
```

Or pass them explicitly:

```bash
lemmy-chat anthropic --apiKey "sk-..." -m claude-sonnet-4-20250514 "Hello"
```

## Provider-Specific Help

Each provider gets auto-generated help with all available options:

```bash
# See all Anthropic options (thinking, tokens, etc.)
lemmy-chat anthropic --help

# See all OpenAI options (reasoning effort, organization, etc.)
lemmy-chat openai --help

# See all Google options (project ID, thoughts, etc.)
lemmy-chat google --help

# Chat mode supports all provider options
lemmy-chat chat --help
```

## Examples

### Quick Setup and Usage

```bash
# 1. Set your preferred defaults
lemmy-chat defaults anthropic -m claude-sonnet-4-20250514 --thinkingEnabled

# 2. Now you can use the CLI without repetitive options
lemmy-chat "What's the meaning of life?"
lemmy-chat chat  # Start interactive mode
lemmy-chat -i diagram.png "Explain this flowchart"
```

### Model Discovery Workflow

```bash
# Find models that support images and are cost-effective
lemmy-chat models --images --cheap

# See all Anthropic models with their capabilities
lemmy-chat models --provider anthropic

# Get model data as JSON for scripts
lemmy-chat models --provider openai --json > openai-models.json
```

### Interactive Conversations

```bash
# Start chat with specific settings
lemmy-chat chat -p anthropic -m claude-sonnet-4-20250514 --thinkingEnabled

# Chat mode shows:
# - Gray thinking text (when enabled)
# - Token usage per message
# - Running cost total
# - Professional readline interface
# - Persistent context across the conversation
```

### Advanced Usage

```bash
# Complex reasoning task with OpenAI
lemmy-chat openai -m o4-mini --reasoningEffort high --maxOutputTokens 2000 "Analyze the economic implications of quantum computing adoption"

# Image analysis with custom settings
lemmy-chat anthropic -m claude-sonnet-4-20250514 --maxOutputTokens 1000 -i complex-diagram.png "Provide a detailed technical analysis"

# Using Google with project-specific settings
lemmy-chat google -m gemini-2.0-flash --projectId "my-ai-project" --includeThoughts "Explain machine learning concepts"
```

## How It Works

This CLI demonstrates sophisticated automatic argument generation:

1. **Schema Generation**: Analyzes TypeScript interfaces to create a configuration schema
2. **Auto CLI Generation**: Automatically creates command-line options for each config field with:
   - Type validation (string, number, boolean, enum)
   - Help text from JSDoc comments
   - Required vs optional flags
   - Enum choices validation
3. **Persistent Preferences**: Defaults system saves user preferences to `~/.lemmy-chat/defaults.json`
4. **Smart Argument Detection**: Automatically detects when a message is provided without explicit provider/model
5. **Type Safety**: All arguments are properly typed and validated before reaching the lemmy clients

The CLI stays perfectly in sync with the TypeScript interfaces - add new config options to the types and they automatically become available with proper validation and help.
