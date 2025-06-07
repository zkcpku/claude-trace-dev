# Port-C++ - Java Code Porting Tool

Automated toolkit for porting Java code changes to other languages (e.g., C++) in the Spine Runtime project with Claude assistance.

## Purpose

Port Java changes to target languages (e.g., C++) while giving Claude and users tools to review original Java and Claude's target language changes in a collaborative web interface. Analyzes git diffs, generates priority-ordered porting plans, provides real-time file viewing with syntax highlighting and diff visualization.

## Workflow

1. **Generate porting plan**: `npx tsx src/port-cpp.ts <prev-branch> <current-branch> <spine-runtimes-dir>` - Creates priority-ordered porting plan from git diffs of Java sources
2. **Give Claude the prompt**: Point Claude to `port.md` and let it execute the step-by-step workflow. Claude starts dev server and file viewer in Puppeteer browser. Claude controls file viewer via Puppeteer.
3. **Collaborate**: Claude ports one Java type at a time to target language (e.g., C++) in collaboration with the user, controls web interface to show user file changes, and updates porting-plan.json for status tracking

## Quick Start

```bash
# Generate plan
npx tsx src/port-cpp.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes porting-plan.json

# Tell Claude:
Read port.md and execute the workflow starting from Load Porting Plan metadata
```

## Plan Generation

The porting plan analyzes git diffs between branches for the Java sources and extracts affected Java types (classes/interfaces/enums), maps them to target language files (e.g., C++ headers/sources), and creates a dependency-based priority order of what types to port. Outputs `porting-plan.json` containing metadata, deleted files list, and `PortingOrderItem` array with file paths, line ranges, and target file locations (see [`src/types.ts`](src/types.ts) for complete type definitions).

## Collaboration

Claude uses `porting-plan.json` to find the next Java type to port, opens the Java source file and candidate target language files in the file viewer, then starts the porting process as outlined in [`port.md`](port.md). The dual-panel interface displays:

- **Left panel**: Multiple target language files (e.g., C++ header/source) being edited by Claude. Diff shown between current state and last commit.
- **Right panel**: Single Java file being ported (one type at a time). Diff shown between previous branch and current branch, e.g. 4.2, 4.3-beta.

The user observes changes being made live in the file viewer as Claude ports the Java type to the target language. Claude can also use the file viewer to highlight any changes requiring additional user input. The interface updates in real-time with syntax highlighting and diff visualization (content/inline/side-by-side modes).

```javascript
// Claude shows target language files it's modifying (left panel, tabbed)
mcp__puppeteer__puppeteer_evaluate(`
    fileViewer.open("/path/to/Animation.h", 0);
    fileViewer.open("/path/to/Animation.cpp", 0);
`);

// Claude shows the Java source being ported (right panel, with git diffs)
mcp__puppeteer__puppeteer_evaluate(`
    fileViewer.open("/path/to/Animation.java", 1, "4.2", "4.3-beta");
`);
```

Claude controls the file viewer in which files are being shown by injecting Javascript via Puppeteer into the web interface which calls a simple file viewer API to open and close files.

### File Viewer API

```javascript
// Open files with git diff visualization
fileViewer.open("/absolute/path/to/file.java", 0, "4.2", "4.3-beta"); // Left panel
fileViewer.open("/absolute/path/to/file.h", 1); // Right panel
fileViewer.close("/path/to/file");
fileViewer.closeAll();
fileViewer.refresh();

// Enhanced highlighting API (content mode only)
fileViewer.highlight("/path/to/file"); // Clear highlights
fileViewer.highlight("/path/to/file", 25); // Highlight line 25
fileViewer.highlight("/path/to/file", 10, 20); // Highlight lines 10-20 (inclusive)
```

## Implementation Details

**Core Pipeline** ([`src/port-cpp.ts`](src/port-cpp.ts)): Analyzes git diffs → extracts Java types → maps to target language files → calculates dependency-based porting order → outputs `porting-plan.json` with priority-ordered tasks

**Dev Server** ([`src/dev-server.ts`](src/dev-server.ts)): WebSocket server with real-time file watching, git diff calculation, and multi-client support

**Frontend** ([`src/frontend/`](src/frontend/)): VS Code-like interface with Monaco Editor, dual-panel layout, syntax highlighting, and 2-mode diff visualization (content/side-by-side)

**Porting Plan** (`porting-plan.json`): Priority-ordered porting tasks (see [`src/types.ts`](src/types.ts) for schemas), generated via [`src/port-cpp.ts`](src/port-cpp.ts)

**Type Definitions** ([`src/types.ts`](src/types.ts)): TypeScript interfaces for PortingPlan, PortingOrderItem, etc.

**Workflow Documentation** ([`port.md`](port.md)): Complete porting workflow documentation for Claude, including descriptions on how to open and control file viewer and build target language code base

**Build Integration** ([`build.sh`](build.sh)): CMake integration for testing target language compilation (failures expected due to circular dependencies)

## Debug Mode

The file viewer frontend uses a configurable logging system. **By default, all logging is disabled** for clean console output and optimal performance.

### Enabling Debug Logging

**Quick URL method:**

```
http://localhost:PORT/?debug=true
```

**Runtime console commands:**

```javascript
// Enable all logging
fileViewerLogger.enableAll();

// Enable specific levels
fileViewerLogger.enable("error");
fileViewerLogger.enable("log");

// Disable logging
fileViewerLogger.disableAll();

// Check current settings
fileViewerLogger.getConfig();
```

Debug logging shows file operations, WebSocket events, panel updates, and error details. Settings persist across browser sessions via localStorage.
