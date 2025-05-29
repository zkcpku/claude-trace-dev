# Claude Code Tools

Network interception utilities for analyzing Claude Code traffic and extracting OAuth tokens for use with Anthropic's SDK.

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
# Extract an OAuth token (simplest)
./claude-token.py

# Monitor traffic while using Claude interactively
./claude-logger.sh
```

## Tools

### 1. Traffic Logger Shell Script (`claude-logger.sh`)

**Purpose**: Convenient wrapper that starts traffic logging and runs Claude Code interactively

```bash
./claude-logger.sh
```

- Starts `claude-logger.py` via mitmproxy in the background
- Runs Claude Code interactively through the proxy
- Logs all requests/responses to `claude-traffic-[timestamp].log`
- Automatic cleanup when you exit Claude Code

### 2. Traffic Logger (`claude-logger.py`)

**Purpose**: mitmproxy script to log all HTTP traffic (used by the shell script)

This is a mitmproxy script that can be run directly:

```bash
mitmdump -s claude-logger.py --listen-port 8080
```

### 3. Token Extractor (`claude-token.py`)

**Purpose**: Automatically extract the OAuth token from Claude Code for use with Anthropic's SDK

```bash
./claude-token.py
```

- Automatically starts proxy, runs Claude Code with a simple message, extracts token
- Displays extracted token in terminal
- Logs traffic to `claude-traffic-[timestamp].log`
- Automatic cleanup when complete
- No configuration needed - just run it!

**Usage with Anthropic SDK**: Use the extracted token with the Anthropic client by setting it as the auth token (not API key)

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

- **`claude-traffic-[timestamp].log`** - Complete HTTP traffic logs in JSON format
- **Terminal output** - Real-time status and extracted tokens

## Troubleshooting

- **"command not found"** - Ensure mitmproxy and Claude Code are installed and in PATH
- **Permission errors** - Make sure scripts are executable: `chmod +x *.py *.sh`
- **Network issues** - Check that port 8080 is available
- **TLS errors** - The tools automatically disable TLS verification for proxy use
