# claude-trace

Record all your interactions with Claude Code as you develop your projects. See everything Claude hides: system prompts, tool outputs, and raw API data in an intuitive web interface.

## Install

```bash
npm install -g @mariozechner/claude-trace
```

## Usage

```bash
# Start Claude Code with logging
claude-trace

# Show help
claude-trace --help

# Extract OAuth token
claude-trace --extract-token

# Generate HTML report manually from previously logged .jsonl
claude-trace --generate-html logs.jsonl report.html
```

Logs are saved to `.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` in your current directory. The HTML file is self-contained and opens in any browser without needing a server.

## What you'll see

- **System prompts** - The hidden instructions Claude receives
- **Tool definitions** - Available tool descriptions and parameters
- **Tool outputs** - Raw data from file reads, searches, API calls
- **Thinking blocks** - Claude's internal reasoning process
- **Token usage** - Detailed breakdown including cache hits
- **Raw JSONL logs** - Complete request/response pairs for analysis
- **Interactive HTML viewer** - Browse conversations with model filtering

## Requirements

- Node.js 16+
- Claude Code CLI installed

## Development

### Running in dev mode

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Dev mode compiles both the main app (`src/`) and frontend (`frontend/src/`) with file watching. It serves the project at `http://localhost:8080`.

For frontend development, open `http://localhost:8080/test` to see live updates as you modify frontend code.

### Testing the CLI

```bash
# Test compiled version
node --no-deprecation dist/cli.js

# Test TypeScript source directly
npx tsx --no-deprecation src/cli.ts
```

### Building for publishing

```bash
# Build everything
npm run build

# Or build specific parts
npm run build:backend  # CLI and interceptor
npm run build:frontend # Web interface
```

**Generated artifacts:**

- `dist/` - Compiled CLI and interceptor JavaScript
- `frontend/dist/` - Bundled web interface (CSS + JS)
- Built HTML generator that embeds the web interface

The built artifacts are ready for npm publishing and include:

- Self-contained HTML reports with embedded CSS/JS
- Node.js CLI with mitmproxy integration
- TypeScript definitions

### Architecture

**Two-part system:**

1. **Backend** (`src/`)

   - **CLI** (`cli.ts`) - Command-line interface and argument parsing. Launches Claude Code and injects interceptors
   - **Interceptor** (`interceptor.ts`) - injects itself into Claude Code, intercepts calls to fetch(), and logs them to JSONL files in .claude-trace/ in the current working dir.
   - **HTML Generator** (`html-generator.ts`) - Embeds frontend into self-contained HTML reports
   - **Token Extractor** (`token-extractor.js`) - A simpler interceptor that extracts Claude Code OAuth tokens

2. **Frontend** (`frontend/src/`)
   - **`app.ts`** - Main ClaudeApp component, handles data processing and view switching
   - **`index.ts`** - Application entry point, injects CSS and initializes app
   - **`types/claude-data.ts`** - TypeScript interfaces for API data structures
   - **`utils/data.ts`** - Processes raw HTTP pairs, reconstructs SSE messages
   - **`utils/simple-conversation-processor.ts`** - Groups API calls into conversations
   - **`utils/markdown.ts`** - Markdown to HTML conversion utilities
   - **`components/simple-conversation-view.ts`** - Main conversation display with tool visualization
   - **`components/raw-pairs-view.ts`** - Raw HTTP traffic viewer
   - **`components/json-view.ts`** - JSON debug data viewer
   - **`styles.css`** - Tailwind CSS with VS Code theme variables

**Data flow:** HTTP traffic → mitmproxy → JSONL logs → HTML generator → Self-contained viewer
