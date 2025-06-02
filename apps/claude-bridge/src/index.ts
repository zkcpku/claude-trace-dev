// Main exports for claude-bridge
export { ClaudeBridgeInterceptor, initializeInterceptor, getInterceptor } from "./interceptor.js";
export * from "./types.js";

// Export CLI functions for testing
export { default as main, runClaudeWithBridge } from "./cli.js";
