# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Trace is a tool that records and visualizes all interactions with Claude Code during development. It consists of two main parts:

1. **Backend** (`src/`) - Node.js CLI that intercepts Claude Code API calls and generates logs
2. **Frontend** (`frontend/src/`) - Lit-based web interface for viewing conversation logs

## Development Commands

### Core Development

```bash
# Install dependencies (run in both root and frontend/)
npm install && cd frontend && npm install && cd ..

# Start development mode (watches both backend and frontend)
npm run dev

# Build everything
npm run build

# Test compiled CLI
node --no-deprecation dist/cli.js

# Test TypeScript source directly
npx tsx --no-deprecation src/cli.ts

# Type checking
npm run typecheck
```

### Frontend Development

```bash
cd frontend/

# Build CSS and JS separately
npm run build:css
npm run build:js

# Generate test HTML file
npm run build:html

# Start development server on localhost:8080
npm run dev

# Type checking frontend only
npm run typecheck
```

### Testing

```bash
# Basic CLI test
npm run test

# Generate HTML from test data
npm run test:generate
```

## Architecture Overview

### Request Interception Flow

1. CLI (`cli.ts`) launches Claude Code with interceptor injection
2. Interceptor (`interceptor.ts`) hooks into `fetch()` calls within Claude Code
3. API requests/responses are logged to `.claude-trace/log-*.jsonl` files
4. HTML Generator (`html-generator.ts`) creates self-contained HTML reports

### Key Components

**Backend (`src/`)**

- `cli.ts` - Main CLI interface and argument parsing
- `interceptor.ts` - Fetch interception and JSONL logging
- `html-generator.ts` - Embeds frontend bundle into standalone HTML
- `shared-conversation-processor.ts` - Core conversation processing shared with frontend
- `index-generator.ts` - AI-powered conversation summarization
- `token-extractor.js` - OAuth token extraction utility

**Frontend (`frontend/src/`)**

- `app.ts` - Main ClaudeApp LitElement component with view switching
- `components/simple-conversation-view.ts` - Primary conversation display
- `components/raw-pairs-view.ts` - Raw HTTP traffic viewer
- `components/json-view.ts` - JSON debug viewer
- `utils/data.ts` - HTTP pair processing and SSE reconstruction

### Data Flow

1. Raw HTTP request/response pairs captured by interceptor
2. SSE streams reconstructed into discrete events
3. Conversations grouped by message context
4. Frontend renders with tool call visualization and token metrics

### Build System

- TypeScript compilation for backend (`tsc`)
- Frontend uses Tsup for bundling + Tailwind for CSS
- HTML generation embeds the entire frontend bundle for portability
- Concurrently runs parallel development watchers

## Type Safety

- All API structures defined in `src/types.ts`
- Frontend types in `frontend/src/types/claude-data.ts`
- Shared conversation processing ensures type consistency between backend and frontend

## Key Files to Understand

- `src/interceptor.ts` - Core interception logic
- `src/shared-conversation-processor.ts` - Message processing algorithm
- `frontend/src/app.ts` - Main UI state management
- `frontend/src/utils/data.ts` - HTTP pair processing
