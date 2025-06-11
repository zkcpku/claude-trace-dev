#!/bin/bash
# Demo Script for Diffy MCP
# This script demonstrates the CLI functionality

echo "=== Diffy MCP Demo Script ==="
echo ""

# Demo 1: Open files in both panels
echo "📂 Opening demo files..."
echo "open $(pwd)/demo-typescript.ts 0"
echo "open $(pwd)/README.md 1"

# Demo 2: Highlight specific sections
echo ""
echo "🎯 Highlighting code sections..."
echo "highlight $(pwd)/demo-typescript.ts 5 15"
echo "highlight $(pwd)/README.md 1 10"

# Demo 3: Refresh and exit
echo ""
echo "🔄 Refreshing all files..."
echo "refresh"

echo ""
echo "✅ Demo complete! Type 'exit' to quit."
echo "exit"