/**
 * MCP (Model Context Protocol) integration for lemmy-tools
 *
 * This module provides tools for integrating with MCP servers,
 * allowing lemmy to use tools from external MCP-compatible applications.
 */

export { MCPClient } from "./client.js";
export { MCPRegistry } from "./registry.js";

export type { MCPServerConfig, MCPToolDefinition } from "../types.js";
