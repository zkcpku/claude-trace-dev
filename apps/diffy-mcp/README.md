# Diffy MCP - File Diff Viewer

A Model Context Protocol (MCP) server for collaborative file viewing and diff visualization. Enables LLMs to show users files, highlight specific sections, and display git diffs through a web interface.

## 🚀 Quick Start

### Installation

```bash
# Clone and build
cd diffy-mcp
npm install
npm run build
```

### Basic Usage

```bash
# Interactive CLI (recommended for testing)
node diffy-cli.mjs

# Or start MCP server directly
node packages/server/dist/index.js

# Or use the built-in test CLI
npm run test:manual
```

## 🛠️ MCP Tools

### `open` - Open File in Panel

Opens a file in the specified panel with optional git diff visualization.

```json
{
	"name": "open",
	"arguments": {
		"absolutePath": "/path/to/file.txt",
		"panel": 0,
		"branch": "main"
	}
}
```

**Parameters:**

- `absolutePath` (string): Absolute path to the file
- `panel` (number): Panel index (0=left, 1=right)
- `branch` (string, optional): Branch/commit/tag to diff against

### `close` - Close File

Closes a file from all panels.

```json
{
	"name": "close",
	"arguments": {
		"absolutePath": "/path/to/file.txt"
	}
}
```

### `highlight` - Highlight Lines

Highlights specific lines in a file (content mode only).

```json
{
	"name": "highlight",
	"arguments": {
		"absolutePath": "/path/to/file.txt",
		"startLine": 10,
		"endLine": 15
	}
}
```

**Parameters:**

- `startLine` (number): Start line number (1-indexed)
- `endLine` (number, optional): End line number (1-indexed)

### `refresh` - Refresh Files

Refreshes all watched files and recalculates diffs.

```json
{
	"name": "refresh",
	"arguments": {}
}
```

## 🌐 Web Interface

The server automatically opens a web interface in your default browser when files are opened. The interface features:

- **Dual-panel layout** with resizable panels
- **Monaco Editor** with syntax highlighting
- **Three view modes**: content, diff, and full diff
- **Real-time updates** via WebSocket
- **Line highlighting** for code review
- **Click-to-open** in your preferred editor (Cursor/VS Code)

## ⚙️ Configuration

Configure via environment variables:

```bash
# Editor preference (auto-detects if not set)
DIFFY_EDITOR=cursor          # cursor, code, or auto

# Browser behavior
DIFFY_AUTO_OPEN_BROWSER=true # Auto-open browser (default: true)

# Network settings
DIFFY_HOST=127.0.0.1         # Bind host (default: localhost)
DIFFY_PORT=0                 # Port (0 = random, default)

# Logging
DIFFY_LOG_LEVEL=info         # Log level
```

## 📁 Git Integration

### Simplified Branch Logic

1. **No git repo**: File viewing only, no diffs
2. **No branch specified**: Diff between HEAD and working state
3. **Branch specified**: Diff between branch and working state

### Examples

```bash
# View current file vs HEAD
open file.txt 0

# View current file vs specific branch
open file.txt 0 main

# View current file vs commit
open file.txt 1 abc1234
```

## 🧪 Testing

### Interactive CLI Tool

```bash
# Start the interactive CLI
node diffy-cli.mjs

# Example session:
diffy> open demo.js 0              # Open demo.js in left panel
📂 Opening: demo.js in left panel
✅ Opened demo.js in left panel

diffy> open demo.py 1              # Open demo.py in right panel
📂 Opening: demo.py in right panel
✅ Opened demo.py in right panel

diffy> highlight demo.js 12 15     # Highlight lines 12-15
🎯 Highlighting: demo.js lines 12-15
✅ Highlighted lines 12-15 in demo.js

diffy> refresh                     # Refresh all files
🔄 Refreshing all files...
✅ Refreshed all files

diffy> exit                        # Exit CLI
👋 Goodbye!
```

### Piped Input & Automation

The CLI supports piped input for automation and batch operations:

```bash
# From script file
echo -e "open demo.js 0\nhighlight demo.js 10 15\nexit" > script.txt
cat script.txt | node diffy-cli.mjs

# From echo commands
echo -e "open README.md 0\nopen spec.md 1\nexit" | node diffy-cli.mjs

# From here documents
node diffy-cli.mjs << EOF
open demo.js 0
open demo.py 1
highlight demo.js 12 15
refresh
exit
EOF

# Dynamic file processing
find src -name "*.ts" | head -5 | while read file; do
  echo "open $file 0"
done | node diffy-cli.mjs
```

**Automation Examples:**

```bash
# Open all changed files from git diff
git diff --name-only | head -10 | nl | while read num file; do
  panel=$((($num - 1) % 2))  # Alternate panels
  echo "open $file $panel"
done | node diffy-cli.mjs

# Review files with specific pattern
{
  find . -name "*.js" -o -name "*.ts" | head -5 | while read file; do
    echo "open $file 0"
    echo "highlight $file 1 10"
  done
  echo "exit"
} | node diffy-cli.mjs

# Compare files against a branch
{
  echo "open src/main.ts 0 main"
  echo "open src/utils.ts 1 develop"
  echo "highlight src/main.ts 25 35"
  echo "exit"
} | node diffy-cli.mjs
```

### Manual Testing CLI

```bash
npm run test:manual

# Interactive commands:
> open /path/to/file.txt 0
> highlight /path/to/file.txt 10 20
> close /path/to/file.txt
> refresh
> exit
```

### Integration with MCP Clients

```javascript
// Using MCP SDK
const client = new Client(/* ... */);
await client.connect(transport);

// Open file
await client.callTool({
	name: "open",
	arguments: {
		absolutePath: "/path/to/file.txt",
		panel: 0,
	},
});
```

## 🏗️ Architecture

### Server Package (`packages/server/`)

- **MCP Server**: Handles stdio transport and tool calls
- **File Server**: WebSocket server with file watching
- **Git Utils**: Simplified git diff operations
- **Browser/Editor**: Auto-detection and opening

### Frontend Package (`packages/frontend/`)

- **Lit Components**: Modern web components
- **Monaco Integration**: Full-featured code editor
- **WebSocket Client**: Real-time communication
- **State Management**: File and UI state

### Key Features

✅ **MCP Protocol**: Full stdio transport support  
✅ **Git Diff**: Simplified branch comparison  
✅ **Real-time**: Live file updates via WebSocket  
✅ **Cross-platform**: Windows, macOS, Linux  
✅ **Editor Integration**: Cursor and VS Code support  
✅ **Auto Browser**: Opens user's default browser  
✅ **Syntax Highlighting**: 40+ programming languages  
✅ **Line Highlighting**: Precise code navigation

## 📝 Example Workflows

### Interactive Development

```bash
# Start interactive CLI
node diffy-cli.mjs

diffy> open src/main.ts 0 main      # Compare current vs main branch
diffy> highlight src/main.ts 45 60  # Highlight changed function
diffy> open tests/main.test.ts 1    # Open related test file
```

### Automated Code Review

```bash
# Review all files changed in current branch vs main
git diff --name-only main..HEAD | while read file; do
  echo "open $file 0 main"
done | node diffy-cli.mjs
```

### Batch File Analysis

```bash
# Open and highlight specific patterns across multiple files
{
  find src -name "*.ts" | while read file; do
    echo "open $file 0"
    echo "highlight $file 1 5"  # Show file headers
  done
  echo "exit"
} | node diffy-cli.mjs
```

### MCP Client Integration

```bash
# Direct MCP server usage (via Claude or other LLM)
node packages/server/dist/index.js

# MCP client calls:
open /path/to/MyClass.java 0 main
highlight /path/to/MyClass.java 25 30
open /path/to/MyClass.cpp 1

# Browser automatically opens showing:
#    - Left: MyClass.java (diff vs main, lines 25-30 highlighted)
#    - Right: MyClass.cpp (current state)
```

## 🛠️ Development

### Project Structure

```
diffy-mcp/
├── packages/
│   ├── server/          # MCP server implementation
│   └── frontend/        # Web interface (Lit + Monaco)
├── spec.md             # Full implementation specification
└── README.md           # This file
```

### Building

```bash
# Build both packages
npm run build

# Development mode
npm run dev

# Clean
npm run clean
```

### Dependencies

- **Server**: @modelcontextprotocol/sdk, chokidar, ws, express
- **Frontend**: lit, monaco-editor
- **Build**: tsup, typescript

## 📄 License

MIT License - see LICENSE file for details.

---

Built for collaborative development with Claude and other AI assistants. 🤖
