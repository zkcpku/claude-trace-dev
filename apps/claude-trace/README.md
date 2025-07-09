# claude-trace

Record all your interactions with Claude Code as you develop your projects. See everything Claude hides: system prompts, tool outputs, and raw API data in an intuitive web interface.

## Installation

### Method 2: Clone and Build

```bash
git clone 
cd claude-trace

# Install dependencies (run in both root and frontend/)
npm install && cd frontend && npm install && cd ..

# Build everything
npm run build
```

### Method 3: Create Aliases (Advanced)

For frequent use, create shell aliases in your `~/.bashrc` or `~/.zshrc`:

```bash
# Basic alias
alias claude-trace="node --no-deprecation /path/to/claude-trace/dist/cli.js"

# Custom alias with preferred settings
alias myclaude="node --no-deprecation /path/to/claude-trace/dist/cli.js --include-all-requests --no-open --run-with"
```
#### Note that if you do not want to open html automatically after exiting claude code, you can use `--no-open`

## Quick Start

```bash
cd your_workspace
myclaude
```


```bash
myclaude -p "hello"
```

```bash 
myclaude --dangerously-skip-permissions
```

## Others

```bash
# Start Claude Code with logging
claude-trace

# With comprehensive logging (recommended for debugging)
claude-trace --include-all-requests

# Start with specific Claude commands
claude-trace --run-with chat --model sonnet-3.5
```

## Suggested Usage Patterns

### For Development Work
```bash
# Start a traced session for a new project
cd my-project
claude-trace --include-all-requests

# Review what happened after your session
open .claude-trace/log-*.html
```

### For Debugging Issues
```bash
# Capture everything including system calls
claude-trace --include-all-requests --run-with

# Generate detailed reports
claude-trace --generate-html latest.jsonl report.html --include-all-requests
```

### For Learning and Analysis
```bash
# Create searchable index of all sessions
claude-trace --index

# Extract authentication tokens for API analysis
claude-trace --extract-token
```

## Command Reference

```bash
# Basic usage
claude-trace                              # Start with default filtering
claude-trace --include-all-requests       # Log all API calls
claude-trace --run-with [claude-args]     # Pass arguments to Claude Code
claude-trace --no-open                    # Don't auto-open HTML reports

# Report generation
claude-trace --generate-html logs.jsonl report.html
claude-trace --generate-html logs.jsonl --include-all-requests

# Analysis tools
claude-trace --index                      # Generate conversation summaries
claude-trace --extract-token             # Extract OAuth tokens
claude-trace --help                       # Show all options
```

Logs are saved to `.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` in your current directory. The HTML file is self-contained and opens in any browser without needing a server.

## Request Filtering

By default, claude-trace filters logs to focus on substantial conversations:

- **Default behavior**: Only logs requests to `/v1/messages` with more than 2 messages in the conversation
- **With `--include-all-requests`**: Logs all requests made to `api.anthropic.com` including single-message requests and other endpoints

This filtering reduces log file size and focuses on meaningful development sessions, while still allowing you to capture everything when needed for debugging.

## Conversation Indexing

Generate AI-powered summaries of your coding sessions:

```bash
claude-trace --index
```

This feature:

- Scans all `.jsonl` log files in `.claude-trace/` directory
- Filters meaningful conversations (more than 2 messages, non-compacted)
- Uses Claude CLI to generate titles and summaries for each conversation
- Creates `summary-YYYY-MM-DD-HH-MM-SS.json` files with conversation metadata
- Generates a master `index.html` with chronological listing of all sessions
- Links directly to individual conversation HTML files

**Note:** Indexing will incur additional API token usage as it calls Claude to summarize conversations.

## What you'll see

- **System prompts** - The hidden instructions Claude receives
- **Tool definitions** - Available tool descriptions and parameters
- **Tool outputs** - Raw data from file reads, searches, API calls
- **Thinking blocks** - Claude's internal reasoning process
- **Token usage** - Detailed breakdown including cache hits
- **Raw JSONL logs** - Complete request/response pairs for analysis
- **Interactive HTML viewer** - Browse conversations with model filtering
- **Debug views** - Raw calls shows all HTTP requests without filtering; JSON debug shows processed API data
- **Conversation indexing** - AI-generated summaries and searchable index of all sessions

## Requirements

- Node.js 16+
- Claude Code CLI installed

## Development

### Running in dev mode

```bash
# Install dependencies
npm install

# Start dev mode
npm run dev
```

Dev mode compiles both the main app (`src/`) and frontend (`frontend/src/`) with file watching. For frontend development, open `http://localhost:8080/test` to see live updates as you modify frontend code.

### Testing the CLI

```bash
# Test compiled version
node --no-deprecation dist/cli.js

# Test TypeScript source directly
npx tsx --no-deprecation src/cli.ts
```

### Building

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
   - **Index Generator** (`index-generator.ts`) - Creates AI-powered conversation summaries and searchable index
   - **Shared Conversation Processor** (`shared-conversation-processor.ts`) - Core conversation processing logic shared between frontend and backend
   - **Token Extractor** (`token-extractor.js`) - A simpler interceptor that extracts Claude Code OAuth tokens

2. **Frontend** (`frontend/src/`)
   - **`app.ts`** - Main ClaudeApp component, handles data processing and view switching
   - **`index.ts`** - Application entry point, injects CSS and initializes app
   - **`types/claude-data.ts`** - TypeScript interfaces for API data structures
   - **`utils/data.ts`** - Processes raw HTTP pairs, reconstructs SSE messages
   - **`utils/markdown.ts`** - Markdown to HTML conversion utilities
   - **`components/simple-conversation-view.ts`** - Main conversation display with tool visualization
   - **`components/raw-pairs-view.ts`** - Raw HTTP traffic viewer
   - **`components/json-view.ts`** - JSON debug data viewer
   - **`styles.css`** - Tailwind CSS with VS Code theme variables
