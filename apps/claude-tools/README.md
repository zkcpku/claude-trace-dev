# @mariozechner/claude-logger

Intercept and visualize Claude Code API request/response pairs with a lightweight Node.js solution.

## Features

- 🔍 **HTTP Interception**: Instruments global `fetch` to capture Anthropic API calls
- 📝 **JSONL Logging**: Saves request/response pairs to timestamped JSONL files
- 🌐 **HTML Reports**: Generates self-contained HTML visualizations
- ⚡ **Real-time Updates**: HTML reports update as requests are captured
- 🧹 **Cleanup**: Handles orphaned requests and graceful shutdown
- 🎯 **Zero Dependencies**: Pure Node.js, no Python or mitmproxy required

## Quick Start

### Install globally

```bash
npm install -g @mariozechner/claude-logger
```

### Or use with npx (no install required)

```bash
npx @mariozechner/claude-logger
```

### Basic Usage

```bash
# Start Claude Code with traffic logging
claude-logger

# Run specific Claude command
claude-logger claude chat --model sonnet-3.5

# Extract OAuth token (reproduces claude-token.py functionality)
claude-logger --extract-token

# Generate HTML from existing JSONL file
claude-logger test-traffic.jsonl output.html
```

## Generated Files

All files are saved to `.claude-logger/` directory:

- `log-YYYY-MM-DD-HH-MM-SS.jsonl` - Raw request/response pairs
- `log-YYYY-MM-DD-HH-MM-SS.html` - Interactive visualization

## How It Works

1. **Fetch Instrumentation**: Patches global `fetch` before Claude Code starts
2. **API Filtering**: Only captures Anthropic API calls (`/v1/messages`)
3. **Response Handling**: Supports both JSON and Server-Sent Events (SSE)
4. **Data Pairing**: Thread-safe request/response matching
5. **HTML Generation**: Real-time self-contained reports

## Usage as Library

```javascript
const { initializeInterceptor } = require("@mariozechner/claude-logger");

const logger = initializeInterceptor({
	logDirectory: "./my-logs",
	enableRealTimeHTML: true,
	logLevel: "debug",
});

// Logger automatically instruments fetch and handles cleanup
```

## API Reference

### InterceptorConfig

```typescript
interface InterceptorConfig {
	logDirectory?: string; // Default: '.claude-logger'
	enableRealTimeHTML?: boolean; // Default: true
	logLevel?: "debug" | "info" | "warn" | "error"; // Default: 'info'
}
```

### CLI Options

- No arguments: Run Claude with default settings
- `<command> [args...]`: Run specific Claude command
- `--extract-token`: Extract OAuth token and output only the token
- `--help, -h`: Show detailed help message with examples
- `<file.jsonl> [output.html]`: Generate HTML from JSONL

## Requirements

- Node.js 16+
- Claude Code CLI installed

## Migration from Python Version

This package is a drop-in replacement for the Python/mitmproxy-based logger:

### Advantages

- ✅ No Python dependencies
- ✅ No proxy setup required
- ✅ Faster startup
- ✅ Lower memory usage
- ✅ Same output format

### Compatibility

- 📊 HTML files work with existing frontend
- 📋 JSONL format identical to Python version
- 🔄 Same visualization features

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

## Troubleshooting

### Command not found

```bash
npm install -g @mariozechner/claude-logger
```

### Permission errors

```bash
sudo npm install -g @mariozechner/claude-logger
```

### HTML generation fails

Ensure frontend is built (should be automatic in published package).

### Node.js version issues

Requires Node.js 16+ for native fetch support.

## Legacy Python Version

The original Python/mitmproxy implementation is still available in this repository as reference. See `README-python.md` for documentation.

## License

MIT

## Contributing

Issues and PRs welcome!
