# Snap Happy MCP Server Implementation Plan

## Overview

Create an MCP server using the TypeScript SDK that provides screenshot functionality with two main tools:

- `GetLastScreenshot()`: Returns the most recent screenshot as base64 encoded PNG
- `TakeScreenshot()`: Takes a new screenshot, stores it, and returns as base64 encoded PNG

## Project Structure

```
snap-happy/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Main server entry point
│   ├── screenshot.ts     # Screenshot utilities
│   └── tools.ts          # MCP tool definitions
├── dist/                 # Compiled JavaScript
├── README.md
└── plan.md
```

## Implementation Tasks

### 1. Project Setup

- [x] Create snap-happy folder
- [x] Initialize package.json with @mariozechner/snap-happy
- [x] Install dependencies: @modelcontextprotocol/sdk, typescript, @types/node
- [x] Add dev dependencies: tsx for development
- [x] Configure tsconfig.json
- [x] Add build and start scripts

### 2. Core Implementation

- [x] Implement screenshot utilities in `src/screenshot.ts`
   - Function to take screenshot using system commands (macOS: screencapture, Linux: scrot/gnome-screenshot)
   - Function to read most recent image from SCREENSHOT_PATH
   - Function to convert image to base64 PNG
- [x] Define MCP tools in `src/tools.ts`
   - GetLastScreenshot tool definition
   - TakeScreenshot tool definition
- [x] Create main server in `src/index.ts`
   - Set up MCP server with TypeScript SDK
   - Register tools
   - Handle environment variable parsing
   - Add error handling and logging

### 3. Environment Variable Configuration

- [x] Read `{MCP_SERVER_NAME}_SCREENSHOT_PATH` environment variable
- [x] Validate screenshot path exists and is writable
- [x] Create directory if it doesn't exist
- [x] Handle cross-platform path resolution

### 4. Screenshot Implementation Details

- [x] macOS: Use `screencapture -x -t png <path>` command
- [x] Linux: Use `gnome-screenshot --file=<path>` or `scrot <path>`
- [x] Windows: Use PowerShell with System.Drawing to capture screen
- [x] File naming: timestamp-based (YYYY-MM-DD-HH-mm-ss.png)
- [x] Error handling for failed screenshots

### 5. File Operations

- [x] Read directory to find most recent screenshot
- [x] Sort files by modification time
- [x] Read image files and convert to base64
- [x] Handle file system errors gracefully

### 6. Testing & Development

- [x] Create basic test scenarios
- [x] Test environment variable parsing
- [x] Test screenshot taking on current platform
- [x] Test base64 encoding/decoding
- [x] Manual testing with MCP client

### 7. Documentation

- [x] Write comprehensive README.md
   - Installation instructions
   - Environment variable setup
   - Usage examples
   - Platform compatibility notes
- [x] Add JSDoc comments to all functions
- [x] Include example MCP client configuration

### 8. Build & Package

- [x] Configure TypeScript compilation
- [x] Add build script to compile to dist/
- [x] Test compiled output
- [x] Add bin entry for executable

### 9. NPM Publishing Preparation

- [x] Verify package.json metadata
   - Correct name: @mariozechner/snap-happy
   - Description, keywords, repository
   - License (MIT recommended)
   - Author information
- [x] Add .npmignore file
- [ ] Test local package installation
- [ ] Create git repository and initial commit

### 10. Deployment

- [ ] Publish to NPM under @mariozechner namespace
- [ ] Verify package can be installed globally
- [ ] Test installation and basic functionality
- [ ] Create GitHub repository (optional)
- [ ] Add CI/CD pipeline (optional)

## Dependencies Required

```json
{
	"dependencies": {
		"@modelcontextprotocol/sdk": "latest"
	},
	"devDependencies": {
		"typescript": "^5.0.0",
		"@types/node": "^20.0.0",
		"tsx": "^4.0.0"
	}
}
```

## Platform Considerations

- **macOS**: Use `screencapture` command (built-in)
- **Linux**: Require `gnome-screenshot` or `scrot` to be installed
- **Windows**: Use PowerShell commands (may require additional setup)

## Error Handling Strategy

- Graceful fallbacks for missing screenshot tools
- Clear error messages for configuration issues
- Logging for debugging screenshot operations
- Validation of file paths and permissions

## Success Criteria

- [x] Server starts without errors when properly configured
- [x] GetLastScreenshot returns valid base64 PNG data
- [x] TakeScreenshot successfully captures and returns screenshot
- [x] Works on macOS (primary target platform)
- [ ] Package successfully publishes to NPM
- [ ] Can be installed and used by other developers
