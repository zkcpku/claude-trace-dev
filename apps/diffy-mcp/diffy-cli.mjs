#!/usr/bin/env node

/**
 * Diffy MCP CLI - Complete working version
 * Usage: node diffy-cli.mjs
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';

const DEMO_COMMANDS = `
Demo Commands to Try:
  open demo.js 0              # Open demo.js in left panel
  open demo.py 1              # Open demo.py in right panel  
  highlight demo.js 12 15     # Highlight lines 12-15 in demo.js
  open README.md 0 main       # Open README.md vs main branch (if in git repo)
  refresh                     # Refresh all files
  close demo.js               # Close demo.js
`;

async function startCLI() {
  console.log('🎯 Diffy MCP Interactive CLI');
  console.log('============================');
  console.log('🚀 Starting Diffy MCP server...');
  
  // Start the server
  const serverPath = path.resolve('./packages/server/dist/index.js');
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server not found at: ${serverPath}. Run 'npm run build' first.`);
  }
  
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('✅ Server started!');

  // Create MCP client  
  const transport = new StdioClientTransport({
    reader: serverProcess.stdout,
    writer: serverProcess.stdin
  });

  const client = new Client(
    { name: 'diffy-cli', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log('🔌 Connecting to MCP server...');
  await client.connect(transport);

  // Get available tools
  const { tools } = await client.listTools();
  console.log('✅ Connected! Available MCP tools:');
  tools.forEach(tool => {
    console.log(`  • ${tool.name}: ${tool.description}`);
  });

  console.log(DEMO_COMMANDS);
  console.log('Commands:');
  console.log('  open <path> <panel> [branch]  - Open file (panel: 0=left, 1=right)');
  console.log('  close <path>                  - Close file from all panels');
  console.log('  highlight <path> <start> [end] - Highlight lines (1-indexed)');
  console.log('  refresh                       - Refresh all watched files');
  console.log('  help                          - Show this help');
  console.log('  exit                          - Exit CLI');
  console.log('');
  console.log('💡 Tips:');
  console.log('  • Relative paths are resolved to current directory');
  console.log('  • Browser will auto-open when you first open a file');
  console.log('  • Use Ctrl+C to exit');
  console.log('');

  // Interactive readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'diffy> '
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    try {
      await executeCommand(line, client);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\\n👋 Goodbye!');
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\\n🛑 Shutting down Diffy CLI...');
    rl.close();
  });
}

async function executeCommand(commandLine, client) {
  const args = commandLine.split(' ').filter(arg => arg.length > 0);
  const command = args[0].toLowerCase();

  switch (command) {
    case 'help':
      console.log('\\nAvailable commands:');
      console.log('  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)');
      console.log('  close <path>                  - Close file from all panels');
      console.log('  highlight <path> <start> [end] - Highlight lines (1-indexed)');
      console.log('  refresh                       - Refresh all watched files');
      console.log('  help                          - Show this help');
      console.log('  exit                          - Exit CLI');
      console.log(DEMO_COMMANDS);
      break;

    case 'open':
      await handleOpen(args.slice(1), client);
      break;

    case 'close':
      await handleClose(args.slice(1), client);
      break;

    case 'highlight':
      await handleHighlight(args.slice(1), client);
      break;

    case 'refresh':
      await handleRefresh(client);
      break;

    case 'exit':
    case 'quit':
      process.exit(0);
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Type "help" for available commands');
  }
}

async function handleOpen(args, client) {
  if (args.length < 2) {
    console.log('❌ Usage: open <path> <panel> [branch]');
    console.log('   Example: open demo.js 0');
    console.log('   Example: open README.md 1 main');
    return;
  }

  const [filePath, panelStr, branch] = args;
  const panel = parseInt(panelStr);

  if (panel !== 0 && panel !== 1) {
    console.log('❌ Panel must be 0 (left) or 1 (right)');
    return;
  }

  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    console.log(`❌ File does not exist: ${absolutePath}`);
    return;
  }

  const panelName = panel === 0 ? 'left' : 'right';
  const branchInfo = branch ? ` (diff vs ${branch})` : '';
  console.log(`📂 Opening: ${path.basename(absolutePath)} in ${panelName} panel${branchInfo}`);

  const result = await client.callTool({
    name: 'open',
    arguments: {
      absolutePath,
      panel,
      ...(branch && { branch })
    }
  });

  if (result.content?.[0]) {
    console.log('✅', result.content[0].text.split('\\n')[0]);
  }
}

async function handleClose(args, client) {
  if (args.length < 1) {
    console.log('❌ Usage: close <path>');
    console.log('   Example: close demo.js');
    return;
  }

  const absolutePath = path.resolve(args[0]);
  console.log(`🗑️ Closing: ${path.basename(absolutePath)}`);

  const result = await client.callTool({
    name: 'close',
    arguments: { absolutePath }
  });

  if (result.content?.[0]) {
    console.log('✅', result.content[0].text.split('\\n')[0]);
  }
}

async function handleHighlight(args, client) {
  if (args.length < 2) {
    console.log('❌ Usage: highlight <path> <start> [end]');
    console.log('   Example: highlight demo.js 10');
    console.log('   Example: highlight demo.js 10 15');
    return;
  }

  const [filePath, startStr, endStr] = args;
  const startLine = parseInt(startStr);
  const endLine = endStr ? parseInt(endStr) : undefined;

  if (isNaN(startLine) || startLine < 1) {
    console.log('❌ Start line must be a positive number');
    return;
  }

  if (endLine !== undefined && (isNaN(endLine) || endLine < startLine)) {
    console.log('❌ End line must be >= start line');
    return;
  }

  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    console.log(`❌ File does not exist: ${absolutePath}`);
    return;
  }

  const lineRange = endLine ? `${startLine}-${endLine}` : `${startLine}`;
  console.log(`🎯 Highlighting: ${path.basename(absolutePath)} lines ${lineRange}`);

  const result = await client.callTool({
    name: 'highlight',
    arguments: {
      absolutePath,
      startLine,
      ...(endLine && { endLine })
    }
  });

  if (result.content?.[0]) {
    console.log('✅', result.content[0].text.split('\\n')[0]);
  }
}

async function handleRefresh(client) {
  console.log('🔄 Refreshing all files...');

  const result = await client.callTool({
    name: 'refresh',
    arguments: {}
  });

  if (result.content?.[0]) {
    console.log('✅', result.content[0].text.split('\\n')[0]);
  }
}

// Start the CLI
startCLI().catch(error => {
  console.error('❌ Failed to start CLI:', error);
  process.exit(1);
});