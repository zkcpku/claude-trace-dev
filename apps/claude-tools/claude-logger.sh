#!/bin/bash
# Claude Code Traffic Logger Shell Script - New Version
# Starts mitmproxy with claude-logger-new.py script and then runs Claude CLI interactively
# Usage: ./claude-logger-new.sh [claude-command]

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

echo -e "${BLUE}🚀 Claude Code Traffic Logger (New Version)${NC}"
echo -e "${YELLOW}This will start mitmproxy and then Claude CLI for interactive use${NC}"
echo -e "${YELLOW}Logs paired request/responses to claude-traffic.jsonl${NC}"
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

# Function to find a free port
find_free_port() {
    for port in $(seq 8080 8999); do
        if ! nc -z localhost $port 2>/dev/null; then
            echo $port
            return
        fi
    done
    # Fallback to random port if none found in range
    python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"
}

# Find a free port
PROXY_PORT=$(find_free_port)
echo -e "${BLUE}🔍 Using proxy port: $PROXY_PORT${NC}"

# Start mitmproxy silently in background
echo -e "${GREEN}🔄 Starting traffic logger...${NC}"
mitmdump -s "$SCRIPT_DIR/claude-logger.py" --listen-port $PROXY_PORT --quiet > /dev/null 2>&1 &
MITM_PID=$!

# Wait for mitmproxy to start
sleep 2

# Function to cleanup on exit
cleanup() {
    if [[ ! -z "$MITM_PID" ]]; then
        echo -e "\n${YELLOW}🔄 Shutting down traffic logger...${NC}"
        kill $MITM_PID 2>/dev/null || true
        wait $MITM_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Traffic logger stopped${NC}"
    fi
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

echo -e "${GREEN}✅ Traffic logging started (PID: $MITM_PID)${NC}"
echo -e "${BLUE}📁 Logs will be written to: .claude-logger/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}${NC}"
echo ""

# Run Claude CLI with proxy settings but npx wrapper
HTTP_PROXY=http://localhost:$PROXY_PORT \
HTTPS_PROXY=http://localhost:$PROXY_PORT \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
eval "$CLAUDE_CMD"