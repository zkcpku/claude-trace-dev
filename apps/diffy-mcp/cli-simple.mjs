#!/usr/bin/env node

/**
 * Simple CLI for Diffy MCP - working version
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';

class SimpleDiffyCLI {
  async start() {
    console.log('🎯 Diffy MCP CLI (Simple Version)');
    console.log('==================================');
    
    // Start server
    const serverPath = './packages/server/dist/index.js';
    console.log('🚀 Starting MCP server...');
    
    const serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Create transport and client
    const transport = new StdioClientTransport({
      reader: serverProcess.stdout,
      writer: serverProcess.stdin
    });

    const client = new Client(
      { name: 'simple-diffy-cli', version: '1.0.0' },
      { capabilities: {} }
    );

    console.log('🔌 Connecting to server...');
    await client.connect(transport);

    // List tools
    const tools = await client.listTools();
    console.log('✅ Connected! Available tools:');
    tools.tools.forEach(tool => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // Interactive session
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'diffy> '
    });

    console.log('Commands:');
    console.log('  open <path> <panel> [branch]  - Open file in panel (0=left, 1=right)');
    console.log('  close <path>                  - Close file');
    console.log('  highlight <path> <start> [end] - Highlight lines');
    console.log('  refresh                       - Refresh all files');
    console.log('  help                          - Show help');
    console.log('  exit                          - Exit');
    console.log('');

    rl.prompt();

    rl.on('line', async (input) => {
      const line = input.trim();
      if (!line) {
        rl.prompt();
        return;
      }

      try {
        await handleCommand(line, client);
      } catch (error) {
        console.error('❌ Error:', error.message);
      }
      
      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\\n👋 Goodbye!');
      serverProcess.kill();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\\n🛑 Shutting down...');
      rl.close();
    });
  }
}

async function handleCommand(command, client) {
  const parts = command.split(' ').filter(p => p.length > 0);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'help':
      console.log('\\nCommands:');
      console.log('  open <path> <panel> [branch]  - Open file');
      console.log('  close <path>                  - Close file');
      console.log('  highlight <path> <start> [end] - Highlight lines');
      console.log('  refresh                       - Refresh files');
      console.log('  exit                          - Exit');
      break;

    case 'open':
      if (parts.length < 3) {
        console.log('❌ Usage: open <path> <panel> [branch]');
        return;
      }
      
      const [, filePath, panelStr, branch] = parts;
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

      console.log(`📂 Opening: ${path.basename(absolutePath)} in ${panel === 0 ? 'left' : 'right'} panel`);
      
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
      break;

    case 'close':
      if (parts.length < 2) {
        console.log('❌ Usage: close <path>');
        return;
      }
      
      const closeAbsolutePath = path.resolve(parts[1]);
      console.log(`🗑️ Closing: ${path.basename(closeAbsolutePath)}`);
      
      const closeResult = await client.callTool({
        name: 'close',
        arguments: { absolutePath: closeAbsolutePath }
      });

      if (closeResult.content?.[0]) {
        console.log('✅', closeResult.content[0].text.split('\\n')[0]);
      }
      break;

    case 'highlight':
      if (parts.length < 3) {
        console.log('❌ Usage: highlight <path> <start> [end]');
        return;
      }
      
      const [, highlightPath, startStr, endStr] = parts;
      const startLine = parseInt(startStr);
      const endLine = endStr ? parseInt(endStr) : undefined;
      
      if (isNaN(startLine) || startLine < 1) {
        console.log('❌ Start line must be a positive number');
        return;
      }

      const highlightAbsolutePath = path.resolve(highlightPath);
      const lineRange = endLine ? `${startLine}-${endLine}` : `${startLine}`;
      console.log(`🎯 Highlighting: ${path.basename(highlightAbsolutePath)} lines ${lineRange}`);
      
      const highlightResult = await client.callTool({
        name: 'highlight',
        arguments: {
          absolutePath: highlightAbsolutePath,
          startLine,
          ...(endLine && { endLine })
        }
      });

      if (highlightResult.content?.[0]) {
        console.log('✅', highlightResult.content[0].text.split('\\n')[0]);
      }
      break;

    case 'refresh':
      console.log('🔄 Refreshing all files...');
      
      const refreshResult = await client.callTool({
        name: 'refresh',
        arguments: {}
      });

      if (refreshResult.content?.[0]) {
        console.log('✅', refreshResult.content[0].text.split('\\n')[0]);
      }
      break;

    case 'exit':
    case 'quit':
      process.exit(0);
      break;

    default:
      console.log(`❌ Unknown command: ${cmd}`);
      console.log('Type "help" for available commands');
  }
}

// Start the CLI
const cli = new SimpleDiffyCLI();
cli.start().catch(console.error);