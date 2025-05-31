# Claude Code Tools

Network interception utilities for analyzing Claude Code traffic, extracting OAuth tokens, and generating detailed HTML reports.

## Prerequisites

Before using these tools, you must install:

1. **Python 3.x** (usually pre-installed on macOS/Linux)
2. **mitmproxy** - HTTP/HTTPS traffic interception tool
   ```bash
   pip install mitmproxy
   ```
3. **Claude Code** - Anthropic's official command-line interface
   - Install from: https://docs.anthropic.com/en/docs/claude-code/overview
   - Must be configured with valid credentials

## Quick Start

```bash
# Monitor traffic while using Claude interactively
./claude-logger.sh

# Extract an OAuth token (simplest)
./claude-token.py

# Generate HTML from existing logs
python3 claude-logger.py claude-traffic.jsonl
```

## Tools

### 1. Traffic Logger Shell Script (`claude-logger.sh`)

**Purpose**: Convenient wrapper that starts traffic logging and runs Claude Code interactively

```bash
./claude-logger.sh [claude-command]
```

- Starts `claude-logger.py` via mitmproxy in the background
- Runs Claude Code interactively through the proxy
- Logs all request/response pairs to `claude-traffic.jsonl`
- Generates real-time HTML reports at `claude-traffic.html`
- Automatic cleanup when you exit Claude Code
- Thread-safe pairing prevents race conditions from parallel requests

### 2. Traffic Logger (`claude-logger.py`)

**Purpose**: mitmproxy script for logging HTTP traffic with advanced features

**As mitmproxy script:**

```bash
mitmdump -s claude-logger.py --listen-port 8080
```

**As standalone HTML generator:**

```bash
python3 claude-logger.py <jsonl-file>
```

**Features:**

- Thread-safe request/response pairing using flow IDs
- Race condition protection for parallel API calls
- Real-time HTML generation with embedded template files
- Proper handling of SSE (Server-Sent Events) streaming responses
- Token usage tracking for both input and output tokens

### 3. Token Extractor (`claude-token.py`)

**Purpose**: Automatically extract the OAuth token from Claude Code for use with Anthropic's SDK

```bash
./claude-token.py
```

- Automatically starts proxy, runs Claude Code with a simple message, extracts token
- Displays extracted token in terminal
- Logs traffic to timestamped files
- Generates HTML conversation view
- Automatic cleanup when complete
- No configuration needed - just run it!

**Usage with Anthropic SDK**: Use the extracted token with the Anthropic client by setting it as the auth token (not API key)

### 4. Process Cleanup (`kill-mitm.sh`)

**Purpose**: Kill any stuck mitmproxy processes

```bash
./kill-mitm.sh
```

- Finds all running mitmproxy-related processes
- Attempts graceful shutdown first (SIGTERM)
- Force kills remaining processes if needed
- Useful when proxy processes get stuck

## How It Works

All tools use **mitmproxy** to intercept HTTPS traffic:

1. Start mitmproxy on port 8080 with appropriate logging script
2. Configure Claude Code to use the proxy via environment variables
3. Disable TLS verification (required for interception)
4. Log all traffic and/or extract Authorization headers
5. Automatic cleanup of proxy processes

## Setup

Make scripts executable before first use:

```bash
chmod +x *.py *.sh
```

## Output Files

- **`claude-traffic.jsonl`** - Request/response pairs in JSON Lines format
- **`claude-traffic.html`** - Interactive HTML viewer with:
   - **Conversations View**: Merged conversations with proper message flow
   - **Raw Pairs View**: Complete SSE event structure and raw API data
   - **Model Filtering**: Toggle visibility of different models (haiku hidden by default)
   - **Token Tracking**: Detailed input/output token usage with cache metrics
   - **SSE Display**: Clean event-by-event format for streaming responses
- **Terminal output** - Real-time status and extracted tokens

## Code Structure

The HTML viewer is built with a clean separation of concerns:

- **`template/index.html`** - Main HTML structure and layout
- **`template/styles.css`** - All CSS styling and responsive design
- **`template/views.js`** - View rendering and presentation logic (ClaudeViewRenderer class)
- **`template/script.js`** - Core application logic and data processing (ClaudeViewer class)

The Python script (`claude-logger.py`) merges all template files into a single standalone HTML file for easy sharing and deployment.

## HTML Viewer Features

The generated HTML viewer provides a rich interface for analyzing Claude Code traffic:

### Conversations View

- Automatically merges related API calls into coherent conversations
- Shows system prompts, user messages, and assistant responses
- Displays model names, timestamps, and token usage
- Supports all content types: text, thinking blocks, tool use, and tool results
- Real-time filtering by model type

### Raw Pairs View

- Complete request/response data for each API call
- SSE events displayed in clean `event: type\ndata: payload` format
- Full token usage breakdown including cache read/creation tokens
- Timestamps and metadata for debugging

### Model Filtering

- Checkboxes to show/hide traffic from different models
- Haiku model requests hidden by default (cosmetic/title generation)
- Real-time conversation count updates based on active filters

### Token Analytics

- Input and output token tracking from both structured and SSE responses
- Cache token metrics (cache_read_input_tokens, cache_creation_input_tokens)
- Per-conversation and per-request token breakdowns
- Total token usage displayed in conversation headers

## Troubleshooting

- **"command not found"** - Ensure mitmproxy and Claude Code are installed and in PATH
- **Permission errors** - Make sure scripts are executable: `chmod +x *.py *.sh`
- **Network issues** - Check that port 8080 is available
- **TLS errors** - The tools automatically disable TLS verification for proxy use
- **JSON syntax errors in HTML** - Regenerate HTML: `python3 claude-logger.py claude-traffic.jsonl`
- **Stuck mitmproxy processes** - Run `./kill-mitm.sh` to clean up

### npm/Node.js Timeout Issues

When running under `claude-logger.py`, npm commands may timeout due to proxy environment variables being inherited by Node.js processes. The logger sets:

- `HTTP_PROXY=http://localhost:8080`
- `HTTPS_PROXY=http://localhost:8080`
- `NODE_TLS_REJECT_UNAUTHORIZED=0`

**Solution**: Claude Code should automatically unset these variables when running npm/yarn/Node.js commands:

```bash
unset NODE_TLS_REJECT_UNAUTHORIZED && unset HTTP_PROXY && unset HTTPS_PROXY && npm install
```

This prevents Node.js processes from inheriting proxy settings that cause timeouts. This issue affects any Node.js-based tools (npm, yarn, pnpm, etc.) when Claude Code is running through the proxy logger.
