# Diffy MCP - File Diff Viewer MCP Server Specification

## Overview

Diffy MCP is a Model Context Protocol (MCP) server that provides collaborative file viewing and diff visualization capabilities. It converts the existing port-cpp file viewer into an MCP server with stdio transport, enabling LLMs to show users files, highlight specific sections, and display git diffs through a web interface.

## Core Concepts

### Simplified Branch Logic

- **No git repo**: File viewing only, no diffs available
- **Git repo, no branch specified**: Diff between HEAD and working state
- **Git repo, branch specified**: Diff between specified branch/commit/tag and working state

### Architecture

- **MCP Server**: Handles tool calls via stdio transport
- **File Server**: Manages file watching, git operations, WebSocket communication
- **Web Frontend**: Lit-based TypeScript interface with Monaco Editor
- **Auto Browser**: Opens user's default browser automatically when needed

## Implementation Phases

### Phase 1: Project Setup & Infrastructure

- [x] Create monorepo structure with packages/server and packages/frontend
- [x] Set up tsup build system for both packages
- [x] Configure TypeScript, testing framework
- [x] Create basic package.json files with dependencies

### Phase 2: Core MCP Server

- [ ] Implement basic MCP server with stdio transport
- [ ] Define MCP tools schema (open, close, highlight, refresh)
- [ ] Add environment variable configuration
- [ ] Implement browser auto-opening utilities
- [ ] Add editor detection (cursor/code/auto)

### Phase 3: File Management System

- [ ] Implement simplified git diff logic
- [ ] Create file watching system with chokidar
- [ ] Build WebSocket server for real-time updates
- [ ] Add file state management and caching

### Phase 4: Frontend Implementation

- [ ] Create Lit-based component architecture
- [ ] Integrate Monaco Editor with TypeScript
- [ ] Implement dual-panel layout system
- [ ] Add file tabs and view mode switching
- [ ] Create highlighting and diff visualization

### Phase 5: Integration & Communication

- [ ] Connect MCP tools to file server
- [ ] Implement WebSocket state synchronization
- [ ] Add browser auto-opening on first tool call
- [ ] Handle WebSocket reconnection and state restoration

### Phase 6: Testing & Polish

- [ ] Create manual testing CLI
- [ ] Add automated integration tests with MCP client
- [ ] Test cross-platform compatibility
- [ ] Add comprehensive error handling

## Technical Specifications

### Project Structure

```
diffy-mcp/
├── packages/
│   ├── server/                 # MCP Server Package
│   │   ├── src/
│   │   │   ├── index.ts       # MCP server entry point
│   │   │   ├── server.ts      # Main MCP server implementation
│   │   │   ├── file-server.ts # File watching & WebSocket server
│   │   │   ├── mcp/           # MCP tool implementations
│   │   │   │   ├── open.ts
│   │   │   │   ├── close.ts
│   │   │   │   ├── highlight.ts
│   │   │   │   └── refresh.ts
│   │   │   └── utils/
│   │   │       ├── git.ts     # Simplified git operations
│   │   │       ├── browser.ts # Browser opening
│   │   │       ├── editor.ts  # Editor detection
│   │   │       └── websocket.ts
│   │   ├── tests/
│   │   │   ├── integration/   # MCP client tests
│   │   │   └── unit/          # Unit tests
│   │   ├── test-cli.ts        # Manual testing CLI
│   │   ├── package.json
│   │   └── tsup.config.ts
│   └── frontend/              # Frontend Package
│       ├── src/
│       │   ├── index.ts       # Main entry point
│       │   ├── app.ts         # Main app shell
│       │   ├── components/    # Lit components
│       │   │   ├── app-shell.ts
│       │   │   ├── file-panel.ts
│       │   │   ├── monaco-editor.ts
│       │   │   ├── file-tabs.ts
│       │   │   └── diff-viewer.ts
│       │   ├── services/      # Business logic
│       │   │   ├── websocket.ts
│       │   │   ├── file-state.ts
│       │   │   └── monaco-manager.ts
│       │   └── styles/
│       │       └── main.css
│       ├── public/
│       │   └── index.html
│       ├── tests/
│       ├── package.json
│       └── tsup.config.ts
├── scripts/
│   ├── test-manual.js         # Manual testing launcher
│   └── test-auto.js          # Automated test runner
├── package.json              # Root package.json
└── tsconfig.json            # Shared TypeScript config
```

### MCP Tools

#### `open` - Open File in Panel

```typescript
{
  name: "open",
  description: "Open a file in the specified panel with optional git diff",
  inputSchema: {
    type: "object",
    properties: {
      absolutePath: { type: "string", description: "Absolute path to file" },
      panel: { type: "number", enum: [0, 1], description: "Panel index (0=left, 1=right)" },
      branch: { type: "string", description: "Optional: branch/commit/tag to diff against" }
    },
    required: ["absolutePath", "panel"]
  }
}
```

#### `close` - Close File

```typescript
{
  name: "close",
  description: "Close a file from all panels",
  inputSchema: {
    type: "object",
    properties: {
      absolutePath: { type: "string", description: "Absolute path to file" }
    },
    required: ["absolutePath"]
  }
}
```

#### `highlight` - Highlight Lines

```typescript
{
  name: "highlight",
  description: "Highlight specific lines in a file (content mode only)",
  inputSchema: {
    type: "object",
    properties: {
      absolutePath: { type: "string", description: "Absolute path to file" },
      startLine: { type: "number", description: "Start line number (1-indexed)" },
      endLine: { type: "number", description: "End line number (1-indexed, optional)" }
    },
    required: ["absolutePath", "startLine"]
  }
}
```

#### `refresh` - Refresh All Files

```typescript
{
  name: "refresh",
  description: "Refresh all watched files and recalculate diffs",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
}
```

### Environment Variables

```bash
DIFFY_EDITOR=cursor|code|auto    # Editor preference (auto-detect if not set)
DIFFY_AUTO_OPEN_BROWSER=true    # Auto-open browser on first tool call
DIFFY_HOST=127.0.0.1            # Server bind host
DIFFY_PORT=0                    # Server port (0 = random)
DIFFY_LOG_LEVEL=info            # Logging level
```

### Git Integration

Based on the existing implementation, simplified to:

```typescript
interface GitDiffOptions {
	filePath: string;
	branch?: string; // If provided, diff against this branch
}

// Logic:
// 1. Check if file is in git repo (walk up directory tree looking for .git)
// 2. If no git repo: return error
// 3. If no branch: `git diff HEAD -- <file>`
// 4. If branch specified: `git diff <branch> -- <file>`
```

### WebSocket Protocol

```typescript
// Client -> Server
interface ClientMessage {
	type: "watch" | "unwatch" | "refresh";
	absolutePath: string;
	branch?: string;
}

// Server -> Client
interface ServerMessage {
	type: "fileUpdate" | "fileRemoved";
	absolutePath: string;
	content?: string;
	diff?: string;
	originalContent?: string; // Full content from branch
	modifiedContent?: string; // Full working content
	error?: string;
}
```

### Frontend Architecture

#### Lit Components

- **AppShell**: Main application container, handles layout
- **FilePanel**: Panel container with tabs and view mode switching
- **FileTabs**: Tab management and switching
- **MonacoEditor**: Monaco editor wrapper with diff support
- **DiffViewer**: Specialized diff visualization component

#### State Management

```typescript
interface AppState {
	panels: [FilePanel[], FilePanel[]]; // Left and right panels
	activeTabs: [string | null, string | null];
	viewModes: Map<string, "content" | "diff" | "fullDiff">;
	highlights: Map<string, { start: number; end: number }>;
	webSocketConnected: boolean;
}
```

### Browser Integration

- Auto-detect and open user's default browser
- Cross-platform support (Windows: `start`, macOS: `open`, Linux: `xdg-open`)
- Auto-open on first MCP tool call if no WebSocket connection exists
- Handle browser close/reopen with state restoration

### Testing Strategy

#### Manual Testing CLI

```bash
npm run test:manual

# Interactive CLI:
> open /path/to/file.java 0
> open /path/to/file.cpp 1 main
> highlight /path/to/file.java 25 30
> refresh
> close /path/to/file.java
```

#### Automated Integration Tests

```typescript
// Test MCP tools using @modelcontextprotocol/sdk client
describe("MCP Integration", () => {
	it("should open file and return success", async () => {
		const result = await client.callTool("open", {
			absolutePath: "/path/to/test.txt",
			panel: 0,
		});
		expect(result.content).toContain("success");
	});
});
```

## Key Features from Existing Implementation

### From analysis of port-cpp source:

#### DevServer Features:

- WebSocket-based real-time file watching
- Git diff calculation between branches
- Multi-client support with cleanup
- Cursor editor integration
- File system watching with chokidar

#### Frontend Features:

- Monaco Editor integration with custom dark theme
- Dual-panel layout with resizable panels
- Three view modes: content, context diff, side-by-side full diff
- Tab management with close buttons
- Real-time file updates via WebSocket
- Syntax highlighting based on file extension
- Line highlighting with decorations
- Click-to-open in editor functionality

#### FileIdentity System:

- Unique file keys based on path + branch combination
- WebSocket subscription management
- File state tracking and caching

#### UI/UX Features:

- VS Code-like interface styling
- Connection status indicator
- Error handling and display
- Empty state messaging
- Responsive layout with panel resizing

## Success Criteria

1. **MCP Integration**: Server responds to all MCP tool calls correctly
2. **File Operations**: Can open, close, highlight files in both panels
3. **Git Diff**: Shows diffs between working state and specified branches
4. **Real-time Updates**: File changes reflect immediately in UI
5. **Browser Integration**: Auto-opens user's default browser
6. **Cross-platform**: Works on Windows, macOS, Linux
7. **Testing**: Manual CLI and automated tests pass
8. **Error Handling**: Graceful error messages for all failure cases

## Implementation Notes

### Monaco Editor Configuration

- Use existing custom dark theme from port-cpp
- Support all file types with proper syntax highlighting
- Implement line decorations for highlighting
- Handle view state persistence across mode switches

### WebSocket State Synchronization

- Maintain file state on server side
- Restore state when browser reconnects
- Queue operations if browser is disconnected
- Handle multiple concurrent connections

### Git Operations

- Reuse existing git diff parsing logic
- Handle non-git repositories gracefully
- Support commits, branches, and tags
- Cache git operations for performance

This specification provides a complete roadmap for implementing the diffy-mcp server while maintaining all the functionality of the existing port-cpp implementation.
