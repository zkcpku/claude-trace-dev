# Snap Happy

A Model Context Protocol (MCP) server that provides screenshot functionality for AI assistants. Take screenshots and retrieve recent captures programmatically across macOS, Linux, and Windows.

## Features

- **Cross-platform screenshot capture**: Works on macOS, Linux, and Windows
- **Two main tools**:
   - `GetLastScreenshot()`: Returns the most recent screenshot as base64 PNG
   - `TakeScreenshot()`: Takes a new screenshot and returns it as base64 PNG
- **Automatic directory management**: Creates and validates screenshot directories
- **Environment-based configuration**: Uses `{MCP_SERVER_NAME}_SCREENSHOT_PATH` for flexibility
- **Robust error handling**: Clear error messages for troubleshooting
- **MCP SDK integration**: Built with the official Model Context Protocol SDK

## Installation

### Global Installation (Recommended)

```bash
npm install -g @mariozechner/snap-happy
```

### Local Development

```bash
git clone <repository-url>
cd snap-happy
npm install
npm run build
```

## Prerequisites

### macOS

- `screencapture` command (built-in)
- **Screen Recording Permission**: macOS will prompt for Screen Recording access the first time you take a screenshot. You'll see a dialog like "AppName would like access to record the contents of your screen" where AppName depends on how the server is launched (e.g., "Cursor", "Terminal", "Claude", etc.)

### Linux

- `gnome-screenshot` (preferred) or `scrot` package:

```bash
# Ubuntu/Debian
sudo apt install gnome-screenshot
# or
sudo apt install scrot

# Fedora/RHEL
sudo dnf install gnome-screenshot
# or
sudo dnf install scrot
```

### Windows

- PowerShell with .NET Framework (usually pre-installed)

## Configuration

Set the environment variable for your screenshot directory:

```bash
# Basic usage (server name defaults to SNAP_HAPPY)
export SNAP_HAPPY_SCREENSHOT_PATH="/path/to/screenshots"

# Custom server name
export MCP_SERVER_NAME="MY_SCREENSHOT_SERVER"
export MY_SCREENSHOT_SERVER_SCREENSHOT_PATH="/path/to/screenshots"
```

The directory will be created automatically if it doesn't exist.

## Usage

### With Claude Code

1. **Add the MCP server**:

```bash
claude mcp add snap-happy npx tsx /path/to/snap-happy/src/index.ts
```

2. **Set environment variable** (optional, defaults to ~/Desktop):

```bash
export SNAP_HAPPY_SCREENSHOT_PATH="/Users/username/Screenshots"
```

3. **Use in Claude**:

```bash
echo "Take a screenshot" | claude -p
echo "Show me the last screenshot" | claude -p
```

### As MCP Server (General)

Add to your MCP client configuration:

```json
{
	"mcpServers": {
		"snap-happy": {
			"command": "npx",
			"args": ["tsx", "/path/to/snap-happy/src/index.ts"],
			"env": {
				"SNAP_HAPPY_SCREENSHOT_PATH": "/Users/username/Screenshots"
			}
		}
	}
}
```

Or if installed globally:

```json
{
	"mcpServers": {
		"snap-happy": {
			"command": "snap-happy",
			"env": {
				"SNAP_HAPPY_SCREENSHOT_PATH": "/Users/username/Screenshots"
			}
		}
	}
}
```

### Available Tools

#### GetLastScreenshot()

Returns the most recent screenshot from the configured directory.

**Parameters**: None

**Returns**:

- Text with file path information
- Base64 encoded PNG image data
- Error message if no screenshots found

#### TakeScreenshot()

Takes a new screenshot, saves it with timestamp, and returns the image.

**Parameters**: None

**Returns**:

- Text with file path information
- Base64 encoded PNG image data
- Error message if screenshot fails

### Development and Testing

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Run built version
npm start

# Run end-to-end tests
node test-e2e.js

# Run unit tests
npx tsx test.ts
```

### End-to-End Testing

The project includes a comprehensive E2E test that validates:

1. **Command availability**: Checks if `npx tsx` works
2. **TypeScript execution**: Verifies the server starts correctly
3. **MCP communication**: Tests tool listing and JSON-RPC protocol
4. **Configuration generation**: Creates proper Claude MCP config

Run the E2E test to troubleshoot setup issues:

```bash
node test-e2e.js
```

The test will provide specific error messages and suggestions if any step fails.

## File Naming Convention

Screenshots are automatically named with ISO timestamps:

```
YYYY-MM-DD-HH-mm-ss-mmmZ.png
```

Example: `2024-03-15-14-30-45-123Z.png`

## Platform-Specific Implementation

### macOS

Uses the built-in `screencapture` command:

```bash
screencapture -x -t png /path/to/screenshot.png
```

**Important**: First-time usage will trigger a macOS permission dialog for Screen Recording access. The dialog will show the name of the parent application (Terminal, Cursor, VS Code, etc.) requesting permission.

### Linux

Attempts `gnome-screenshot` first, falls back to `scrot`:

```bash
gnome-screenshot --file=/path/to/screenshot.png
# or
scrot /path/to/screenshot.png
```

### Windows

Uses PowerShell with System.Drawing:

```powershell
# Captures primary screen using .NET classes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# ... (full implementation in source)
```

## Error Handling

The server provides detailed error messages for common issues:

- **Missing environment variable**: Clear instructions on required setup
- **Invalid screenshot path**: Directory creation and permission validation
- **Screenshot command failure**: Platform-specific troubleshooting hints
- **File operation errors**: Specific error details for debugging

## Troubleshooting

### Claude MCP Connection Issues

**Error: `spawn npx tsx /path/to/file.ts ENOENT`**

This means the command wasn't found or the path is incorrect.

**Solutions:**

1. **Use the correct command format**:

   ```bash
   claude mcp add snap-happy npx tsx /full/path/to/snap-happy/src/index.ts
   ```

2. **Install dependencies**:

   ```bash
   cd /path/to/snap-happy
   npm install
   ```

3. **Verify tsx is available**:

   ```bash
   npx tsx --version
   ```

4. **Run the E2E test**:
   ```bash
   node test-e2e.js
   ```

### "Environment variable not set"

Set the required environment variable:

```bash
export SNAP_HAPPY_SCREENSHOT_PATH="/path/to/screenshots"
```

### "Screenshot path is not writable"

Ensure the directory exists and has write permissions:

```bash
mkdir -p /path/to/screenshots
chmod 755 /path/to/screenshots
```

### "Failed to take screenshot" on Linux

Install required screenshot utilities:

```bash
sudo apt install gnome-screenshot scrot
```

### "No screenshots found"

Verify the directory contains PNG files and check the path configuration.

### macOS Screen Recording Permission

On first use, macOS will show a permission dialog: "AppName would like access to record the contents of your screen and audio." The app name varies depending on how the server is launched:

- **Terminal/Command Line**: "Terminal" or "iTerm"
- **IDE (VS Code/Cursor)**: "Code" or "Cursor"
- **MCP Client**: The name of the client application

**To grant permission:**

1. Click "Allow" in the permission dialog
2. If you missed the dialog, go to System Preferences → Security & Privacy → Privacy → Screen Recording
3. Check the box next to the application that's running the MCP server
4. You may need to restart the MCP server after granting permission

**Note**: The permission is tied to the parent application, not the MCP server itself.

## Development

### Project Structure

```
src/
├── index.ts          # Main MCP server
├── screenshot.ts     # Screenshot utilities
└── tools.ts          # MCP tool definitions
```

### Adding New Features

1. **New screenshot tools**: Add to `src/tools.ts` and implement in `src/index.ts`
2. **Platform support**: Extend platform detection in `src/screenshot.ts`
3. **File formats**: Modify file filtering and conversion logic

### Testing

The included test suite covers:

- Environment variable parsing
- Directory validation and creation
- Screenshot capture (platform-dependent)
- Base64 encoding/decoding
- Error handling scenarios

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Changelog

### 1.0.0

- Initial release
- Cross-platform screenshot support
- MCP SDK integration
- Comprehensive error handling
- Automated testing suite
