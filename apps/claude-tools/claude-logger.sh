#!/bin/bash
# Claude Code Traffic Logger Shell Script
# Starts mitmproxy with claude-logger.py script and then runs Claude CLI interactively
# Usage: ./claude-logger.sh [claude-command]

set -e

# Parse command line arguments
if [ $# -eq 0 ]; then
    CLAUDE_CMD="claude"
else
    CLAUDE_CMD="$*"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Claude Code Traffic Logger${NC}"
echo -e "${YELLOW}This will start mitmproxy and then Claude CLI for interactive use${NC}"
echo ""

# Check dependencies
if ! command -v mitmdump &> /dev/null; then
    echo -e "${RED}❌ mitmproxy not found. Please install: pip install mitmproxy${NC}"
    exit 1
fi

# Extract first word from command to check if it exists
CLAUDE_EXECUTABLE=$(echo "$CLAUDE_CMD" | cut -d' ' -f1)
if ! command -v "$CLAUDE_EXECUTABLE" &> /dev/null; then
    echo -e "${RED}❌ Command not found: '$CLAUDE_EXECUTABLE'. Please check the path or install required dependencies${NC}"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Start mitmproxy silently in background
echo -e "${GREEN}🔄 Starting traffic logger...${NC}"
mitmdump -s "$SCRIPT_DIR/claude-logger.py" --listen-port 8080 --quiet > /dev/null 2>&1 &
MITM_PID=$!

# Wait for mitmproxy to start
sleep 2

# Function to cleanup on exit
cleanup() {
    if [[ ! -z "$MITM_PID" ]]; then
        kill $MITM_PID 2>/dev/null || true
        wait $MITM_PID 2>/dev/null || true
    fi
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

echo -e "${GREEN}✅ Traffic logging started${NC}"
echo ""

# Run Claude CLI with proxy settings
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
eval "$CLAUDE_CMD"