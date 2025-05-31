#!/bin/bash

# Setup script for snap-happy MCP server with Claude

echo "🔧 Setting up snap-happy MCP server..."

# Create screenshot directory
SCREENSHOT_DIR="/Users/badlogic/Desktop/snaphappy"
echo "📁 Creating screenshot directory: $SCREENSHOT_DIR"
mkdir -p "$SCREENSHOT_DIR"

# Set environment variable for current session
export SNAP_HAPPY_SCREENSHOT_PATH="$SCREENSHOT_DIR"

# Add to shell profile for permanent setup
SHELL_PROFILE=""
if [[ $SHELL == */zsh* ]]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [[ $SHELL == */bash* ]]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
    echo "🔧 Adding environment variable to $SHELL_PROFILE"
    
    # Check if already exists
    if ! grep -q "SNAP_HAPPY_SCREENSHOT_PATH" "$SHELL_PROFILE"; then
        echo "" >> "$SHELL_PROFILE"
        echo "# Snap Happy MCP Server" >> "$SHELL_PROFILE"
        echo "export SNAP_HAPPY_SCREENSHOT_PATH=\"$SCREENSHOT_DIR\"" >> "$SHELL_PROFILE"
        echo "✅ Added to $SHELL_PROFILE"
    else
        echo "ℹ️  Environment variable already exists in $SHELL_PROFILE"
    fi
fi

# Remove existing MCP server
echo "🗑️  Removing existing snap-happy MCP server..."
claude mcp remove snap-happy 2>/dev/null || true

# Add MCP server
echo "➕ Adding snap-happy MCP server to Claude..."
claude mcp add snap-happy npx tsx "$(pwd)/src/index.ts"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 To test, run:"
echo "   echo 'Take a screenshot' | claude -p"
echo ""
echo "🔄 If you added to shell profile, restart your terminal or run:"
echo "   source $SHELL_PROFILE"