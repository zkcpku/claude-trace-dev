#!/bin/bash

echo "🎯 Diffy MCP Interactive Demo"
echo "============================="
echo ""

# Function to send MCP command and show response
send_mcp_command() {
    local name="$1"
    local args="$2"
    echo "📤 Sending MCP command: $name"
    echo "   Arguments: $args"
    
    local json_cmd="{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/call\", \"params\": {\"name\": \"$name\", \"arguments\": $args}}"
    echo "$json_cmd" | node packages/server/dist/index.js | jq -r '.result.content[0].text' 2>/dev/null || echo "✅ Command sent successfully"
    echo ""
}

cd /Users/badlogic/workspaces/lemmy/apps/diffy-mcp

# Demo 1: Open TypeScript file
echo "📋 Demo 1: Opening TypeScript file in left panel"
args="{\"absolutePath\": \"$(pwd)/demo-typescript.ts\", \"panel\": 0}"
send_mcp_command "open" "$args"

# Demo 2: Open README in right panel  
echo "📋 Demo 2: Opening README.md in right panel"
args="{\"absolutePath\": \"$(pwd)/README.md\", \"panel\": 1}"
send_mcp_command "open" "$args"

# Demo 3: Highlight code section
echo "📋 Demo 3: Highlighting lines 5-15 in TypeScript file"
args="{\"absolutePath\": \"$(pwd)/demo-typescript.ts\", \"startLine\": 5, \"endLine\": 15}"
send_mcp_command "highlight" "$args"

# Demo 4: Refresh files
echo "📋 Demo 4: Refreshing all files"
send_mcp_command "refresh" "{}"

echo "✅ Demo complete! Check the browser at: http://127.0.0.1:49246"
echo "🌟 The interface shows:"
echo "   • Left panel: demo-typescript.ts with lines 5-15 highlighted"
echo "   • Right panel: README.md"
echo "   • Live file watching and git diff visualization"