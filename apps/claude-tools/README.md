# Claude Code Tools

Network interception utilities for analyzing and extracting logs and Max plan tokens from Claude Code traffic.

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
# Extract a token (simplest)
./claude-token.py

# Monitor traffic while using Claude interactively
./claude-logger.sh
```

## Tools

### 1. Traffic Logger (`claude-logger.py`)

**Purpose**: Log all HTTP traffic while using Claude Code interactively

```bash
./claude-logger.py
```

- Logs all requests/responses to `claude-traffic-[timestamp].log`
- Allows normal interactive use of Claude Code
- Manual exit when done (Ctrl+C)

### 2. Token Extractor (`claude-token.py`)

**Purpose**: Automatically extract the MAX plan token from Claude Code to be used with Anthropic's SDK. When constructing the Anthropic object, specify the token via the `authToken` field and leave the `apiKey` field blank. Enjoy API usage with your MAX plan.

```bash
./claude-token.py
```

- Automatically starts proxy, runs Claude Code with a simple message, extracts token
- Displays extracted token in terminal
- Logs traffic to `claude-traffic-[timestamp].log`
- Automatic cleanup when complete
- No configuration needed - just run it!

## How It Works

Both tools use **mitmproxy** to intercept HTTPS traffic:

1. Start mitmproxy on port 8080
2. Configure Claude Code to use the proxy
3. Disable TLS verification (required for interception)
4. Log all traffic and/or extract Authorization headers
5. Automatic cleanup of proxy processes

## Output Files

- **`claude-traffic-[timestamp].log`** - Complete HTTP traffic logs in JSON format
- **Terminal output** - Real-time status and extracted tokens

## Troubleshooting

- **"command not found"** - Ensure mitmproxy and Claude Code are installed and in PATH
- **Permission errors** - Make sure scripts are executable: `chmod +x *.sh`
- **Network issues** - Check that port 8080 is available
- **TLS errors** - The tools automatically disable TLS verification for proxy use
