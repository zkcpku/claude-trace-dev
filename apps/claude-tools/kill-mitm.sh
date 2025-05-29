#!/bin/bash
# Kill any running mitmproxy processes
# Usage: ./kill-mitm.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Looking for running mitmproxy processes...${NC}"

# Find all mitmproxy-related processes
MITM_PIDS=$(pgrep -f "(mitmdump|mitmproxy|mitmweb)" 2>/dev/null || true)

if [ -z "$MITM_PIDS" ]; then
    echo -e "${GREEN}✅ No mitmproxy processes found running${NC}"
    exit 0
fi

echo -e "${YELLOW}📋 Found mitmproxy processes:${NC}"
# Show the processes we're about to kill
ps -p $MITM_PIDS -o pid,ppid,command 2>/dev/null || true

echo -e "${YELLOW}🔪 Killing mitmproxy processes...${NC}"

# Try graceful shutdown first (SIGTERM)
for pid in $MITM_PIDS; do
    if kill -TERM "$pid" 2>/dev/null; then
        echo -e "  Sent SIGTERM to PID $pid"
    fi
done

# Wait a moment for graceful shutdown
sleep 2

# Check if any are still running and force kill if needed
REMAINING_PIDS=$(pgrep -f "(mitmdump|mitmproxy|mitmweb)" 2>/dev/null || true)

if [ ! -z "$REMAINING_PIDS" ]; then
    echo -e "${YELLOW}⚡ Force killing remaining processes...${NC}"
    for pid in $REMAINING_PIDS; do
        if kill -KILL "$pid" 2>/dev/null; then
            echo -e "  Force killed PID $pid"
        fi
    done
fi

echo -e "${GREEN}✅ All mitmproxy processes stopped${NC}"