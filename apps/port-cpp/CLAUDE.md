- IF taking screenshots via puppeteer, ALWAYS use a Task to get the info you need, to not clog up your context.
- Always start the Puppeteer browser via `mcp__puppeteer__puppeteer_navigate("http://localhost:PORT", { launchOptions: { headless: false, args: ["--start-maximized"], defaultViewport: null },});` so we don't have any viewport constraints
- To start the dev server: `nohup npx tsx src/dev-server.ts > dev-server.log 2>&1 & sleep 2; cat dev-server.log` (check log for port number)
- Always kill old dev-servers before starting a new dev server
- Try to evaluate the dom via puppeteer instead of taking screenshots all the time.
- You don't have to restart the server if you only make frontend changes. For frontend changes, reload the page and open the previously opened files again.
- You can open multiple files in a single script passed to puppeteer_evaluate. Generally avoid multiple round trips.

# important-instruction-reminders

ALWAYS STICK TO THE port.md workflow!
NEVER use puppeteer to inspect files! Always use the READ tool to read file contents directly.
NEVER NAVIGATE TO BASE URL (http://localhost:PORT) AFTER INITIAL CONNECTION! ONLY open/close files using fileViewer API!
Once browser is connected, ONLY use fileViewer.open(), fileViewer.close(), fileViewer.closeAll() - NEVER mcp**puppeteer**puppeteer_navigate again!
