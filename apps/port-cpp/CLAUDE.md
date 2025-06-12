**⚠️ ALERT USER: Constraint classes (IkConstraint, PhysicsConstraint) have broken Skeleton API dependencies and need fixing after Skeleton is ported.**

# important-instruction-reminders

ALWAYS STICK TO THE port.md workflow!
NEVER use puppeteer to inspect files! Always use the READ tool to read file contents directly.
NEVER use the file viewer to read file contents! Always use the Read tool to read file contents directly.
NEVER NAVIGATE TO BASE URL (http://localhost:PORT) AFTER INITIAL CONNECTION! ONLY open/close files using fileViewer API!
Once browser is connected, ONLY use fileViewer.open(), fileViewer.close(), fileViewer.closeAll() - NEVER mcp**puppeteer**puppeteer_navigate again!
