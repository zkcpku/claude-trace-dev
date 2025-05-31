# Snap Happy

A Model Context Protocol (MCP) server that provides screenshot functionality for AI assistants. Take screenshots and retrieve recent captures programmatically across macOS, Linux, and Windows.

## Features

- **Cross-platform screenshot capture**: Works on macOS, Linux, and Windows
- **Two main tools**:
   - `GetLastScreenshot()`: Returns the most recent screenshot as base64 PNG
   - `TakeScreenshot()`: Takes a new screenshot and returns it as base64 PNG
- **Automatic directory management**: Creates and validates screenshot directories
- **Environment-based configuration**: Uses `SNAP_HAPPY_SCREENSHOT_PATH` environment variable

## Installation

```bash
npm install -g @mariozechner/snap-happy
```

## Prerequisites

- **macOS**: Built-in `screencapture` command (Screen Recording permission required)
- **Linux**: `gnome-screenshot` or `scrot` package
- **Windows**: PowerShell with .NET Framework

## Configuration

Set the environment variable for your screenshot directory:

```bash
export SNAP_HAPPY_SCREENSHOT_PATH="/path/to/screenshots"
```

The directory will be created automatically if it doesn't exist.

## Usage

### With Claude Code

```bash
# Add the MCP server
claude mcp add snap-happy "npx @mariozechner/snap-happy"

# Use in Claude
echo "Take a screenshot" | claude -p
echo "Show me the last screenshot" | claude -p
```

### As MCP Server

Add to your MCP client configuration:

```json
{
	"mcpServers": {
		"snap-happy": {
			"command": "npx",
			"args": ["@mariozechner/snap-happy"],
			"env": {
				"SNAP_HAPPY_SCREENSHOT_PATH": "/Users/username/Screenshots"
			}
		}
	}
}
```

## Development

```bash
# Start building in watch mode
npm run dev

# Add to Claude for testing (after building)
claude mcp add snap-happy node /path/to/git/clone/of/snap-happy/dist/index.js

# Test using Claude Code
echo "Take a screenshot" | claude -p

# Run all tests
npm test
```

## Troubleshooting

### macOS Screen Recording Permission

On first use, macOS will prompt for Screen Recording access. Grant permission in System Preferences → Security & Privacy → Privacy → Screen Recording.

### Linux Dependencies

```bash
# Ubuntu/Debian
sudo apt install gnome-screenshot

# Fedora/RHEL
sudo dnf install gnome-screenshot
```

### Common Issues

- **"Environment variable not set"**: Set `SNAP_HAPPY_SCREENSHOT_PATH`
- **"Screenshot path is not writable"**: Check directory permissions
- **"No screenshots found"**: Verify directory contains PNG files

## License

MIT License - see LICENSE file for details.
