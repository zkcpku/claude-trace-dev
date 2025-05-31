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

# Run specific command
claude-trace claude chat --model sonnet-3.5

# Extract OAuth token
claude-trace --extract-token

# Generate HTML report manually from .jsonl
claude-trace logs.jsonl report.html
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
