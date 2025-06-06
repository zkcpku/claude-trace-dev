# Port-C++ - Java to C++ Porting Tool

A sophisticated toolkit for porting Java code changes to C++ in the Spine Runtime project. This tool automates the analysis of git diffs, generates priority-ordered porting plans, and provides a collaborative web-based interface for viewing and editing code during the porting process.

## Overview

The Spine Runtime is a skeletal animation library with parallel implementations in multiple languages. This tool helps maintain synchronization between Java and C++ versions by:

1. **Analyzing git diffs** between branches to identify changed Java files
2. **Extracting Java types** (classes, interfaces, enums) from changed files
3. **Mapping Java types to C++ files** using existing codebase analysis
4. **Calculating optimal porting order** based on dependencies
5. **Providing a web-based interface** for collaborative code review and editing

## Project Structure

```
port-cpp/
├── src/
│   ├── port-cpp.ts           # Main CLI tool for generating porting plans
│   ├── types.ts              # TypeScript interfaces for all data structures
│   ├── dev-server.ts         # WebSocket dev server for file viewer
│   ├── frontend/             # Web-based file viewer interface
│   │   ├── app.js           # Main frontend application
│   │   ├── index.html       # HTML shell
│   │   └── styles.css       # CSS styles
│   ├── analyze-dependencies.ts    # Java dependency analysis
│   ├── enumerate-changed-java-files.ts  # Git diff analysis
│   ├── extract-java-types.ts      # Java AST parsing
│   ├── extract-cpp-types.ts       # C++ file analysis
│   ├── map-java-to-cpp.ts         # Java→C++ file mapping
│   └── verify-coverage.ts         # Coverage verification
├── build.sh              # CMake build script for testing
├── port.md               # Comprehensive porting workflow documentation
├── package.json          # Node.js dependencies
└── tsconfig.json         # TypeScript configuration
```

## Core Components

### 1. Port-CPP Tool (`src/port-cpp.ts`)

The main CLI tool that orchestrates the entire porting analysis pipeline:

**Purpose**: Generate priority-ordered porting plans from git branch differences

**Usage**:

```bash
npx tsx src/port-cpp.ts <prev-branch> <current-branch> <spine-runtimes-dir> [output-file]

# Examples:
npx tsx src/port-cpp.ts 4.2 4.3-beta /path/to/spine-runtimes
npx tsx src/port-cpp.ts 4.2 4.3-beta /path/to/spine-runtimes porting-plan.json
```

**Pipeline Phases**:

1. **Phase 1**: Enumerate changed Java files using git diff
2. **Phase 2**: Extract Java types (classes/interfaces/enums) from changed files
3. **Phase 3a**: Create C++ type mapping from existing codebase
4. **Phase 3b**: Map Java types to suggested C++ target files
5. **Phase 4**: Calculate optimal porting order based on dependencies
6. **Phase 5**: Verify coverage and generate final plan

**Output**: A `porting-plan.json` file containing:

- Metadata (branches, directories, timestamps)
- Deleted files list for cleanup tracking
- Priority-ordered array of `PortingOrderItem` objects with complete porting information

### 2. Development Server (`src/dev-server.ts`)

A WebSocket-based development server providing real-time file watching and collaborative editing interface.

**Purpose**: Enable real-time collaboration during porting with live file updates and git diff visualization

**Features**:

- Real-time file watching with automatic updates
- Git diff calculation between any branches or vs HEAD
- WebSocket communication for instant updates
- Multi-client support for collaborative editing
- Refresh API for recalculating git state

**Start Server**:

```bash
nohup npx tsx src/dev-server.ts > dev-server.log 2>&1 &
sleep 2
cat dev-server.log  # Check for port number
```

**WebSocket API**:

- `{ type: "watch", absolutePath: "/path/to/file", prevBranch?: "...", currBranch?: "..." }`
- `{ type: "unwatch", absolutePath: "/path/to/file" }`
- `{ type: "refresh" }` - Recalculate all file states with fresh git diffs

### 3. Frontend Interface (`src/frontend/`)

A sophisticated web-based file viewer with Monaco Editor integration for syntax highlighting and diff visualization.

**Purpose**: Provide a VS Code-like interface for viewing files, diffs, and collaborative code review

**Features**:

- **Dual-panel layout**: Tabbed left panel (multiple files) + single-file right panel
- **Monaco Editor integration**: Full syntax highlighting, IntelliSense-style editing
- **Git diff visualization**: Inline diff, side-by-side diff, or content-only views
- **Real-time updates**: Files update automatically when changed on disk
- **Tab management**: VS Code-style tabs with close buttons
- **Flicker-free updates**: In-place content updates preserve cursor position

**API**:

```javascript
// Open files (all paths must be absolute)
fileViewer.open("/absolute/path/to/file.java", 0, "4.2", "4.3-beta"); // Panel 0 with git diff
fileViewer.open("/absolute/path/to/file.h", 1); // Panel 1, content only

// Close files
fileViewer.close("/absolute/path/to/file.java");
fileViewer.closeAll();

// Refresh all files (recalculate git diffs)
fileViewer.refresh();
```

**Git Diff Logic**:

- **Both branches**: `prevBranch..currBranch` diff
- **Only prevBranch**: Current state vs branch
- **No branches**: Current state vs HEAD (if git repo)

### 4. Puppeteer Integration

The frontend is designed to work seamlessly with Puppeteer for automated testing and collaborative workflows.

**Setup**:

```javascript
// Navigate with maximized window (recommended for full-screen usage)
mcp__puppeteer__puppeteer_navigate("http://localhost:PORT", {
	launchOptions: {
		headless: false,
		args: ["--start-maximized"],
	},
});

// Execute fileViewer commands
mcp__puppeteer__puppeteer_evaluate(`
    fileViewer.open("/absolute/path/to/Animation.java", 0, "4.2", "4.3-beta");
    fileViewer.open("/absolute/path/to/Animation.h", 1);
`);

// Test refresh functionality
mcp__puppeteer__puppeteer_evaluate("fileViewer.refresh()");
```

## Port.md Workflow Documentation

The `port.md` file contains comprehensive documentation for the collaborative Java-to-C++ porting workflow:

**Purpose**: Provide step-by-step instructions for human-AI collaboration in porting Java code changes to C++

**Key Sections**:

- **Tools**: File viewer setup, build system usage
- **Step-by-Step Workflow**: 8-phase porting process
- **Spine-C++ Conventions**: Type mappings, code patterns, memory management

**Critical Workflow Steps**:

1. **Load porting plan** from `porting-plan.json`
2. **Start dev server** and open file viewer
3. **Find next type** using jq to query pending items
4. **Confirm with user** before proceeding
5. **Read Java source** using exact line ranges from plan
6. **Check git changes** to verify actual modifications
7. **Port to C++** with complete mechanical translation
8. **Update porting plan** and STOP for user confirmation

## Starting a Porting Adventure

Here's the complete process to begin a Java-to-C++ porting session:

### Step 1: Generate Porting Plan

```bash
# Navigate to port-cpp directory
cd /path/to/port-cpp

# Generate porting plan (replace with actual branches and spine-runtimes path)
npx tsx src/port-cpp.ts 4.2 4.3-beta /Users/badlogic/workspaces/spine-runtimes porting-plan.json

# Verify plan was created
ls -la porting-plan.json
```

### Step 2: Start Claude and Initialize Context

```bash
# Start Claude in the port-cpp directory
# Point Claude to the workflow documentation
```

**Initial Claude Prompt**:

```
I'm starting a Java-to-C++ porting session for the Spine Runtime.

Please read port.md to understand the complete workflow, then execute the step-by-step process starting from "Load Porting Plan".

The porting-plan.json file should be in the current directory. Follow the workflow exactly as documented, including:
- Starting the dev server for collaborative viewing
- Using puppeteer for file visualization
- Confirming each type before porting
- Stopping after each completed type for user confirmation

Begin by reading port.md and then loading the porting plan.
```

### Step 3: Claude Executes Workflow

Claude will:

1. Read `port.md` to understand the complete process
2. Load `porting-plan.json` and extract spine-runtimes directory
3. Start the development server using the documented commands
4. Open file viewer with puppeteer for collaborative viewing
5. Find the next pending type using jq commands
6. Confirm with user before proceeding
7. Execute the complete porting workflow as documented

### Step 4: Collaborative Porting

- Claude handles the mechanical translation following spine-cpp conventions
- User provides guidance, reviews changes, and confirms progress
- File viewer shows real-time updates and git diffs
- Each type completion requires explicit user confirmation before proceeding

## Technical Features

### Real-time File Watching

- Chokidar-based file system monitoring
- Automatic git diff recalculation on file changes
- WebSocket broadcasting to all connected clients
- Efficient in-place content updates to prevent editor flicker

### Monaco Editor Integration

- Full syntax highlighting for 20+ languages
- TypeScript definitions for IntelliSense
- Custom dark theme matching VS Code
- Diff rendering with inline and side-by-side modes
- View state preservation (cursor position, scroll, selections)

### Git Integration

- Git diff calculation between any branches or commits
- Support for comparing current state vs HEAD
- Automatic detection of git repositories
- Unified diff parsing for visualization

### Type Safety

- Complete TypeScript coverage for all components
- Proper interface definitions in `src/types.ts`
- No `any` types - full type safety throughout codebase
- Strict TypeScript compilation with no errors

### Error Handling

- Graceful handling of missing files, invalid git refs
- WebSocket reconnection on connection loss
- Comprehensive error reporting in all phases
- Build system integration with expected failure handling

## Dependencies

- **Node.js 18+**: Runtime environment
- **TypeScript**: Type-safe development
- **tsx**: TypeScript execution
- **express**: Web server framework
- **ws**: WebSocket implementation
- **chokidar**: File system watching
- **Monaco Editor**: Code editor (loaded via CDN)

## Build System Integration

The included `build.sh` script provides CMake integration for testing C++ compilation:

```bash
./build.sh  # Test compilation after porting changes
```

**Important**: Build failures are often expected due to circular dependencies. Multiple related types may need porting before clean compilation.

---

This tool provides a complete end-to-end solution for maintaining synchronization between Java and C++ implementations in the Spine Runtime project, with sophisticated tooling for analysis, planning, and collaborative editing.
