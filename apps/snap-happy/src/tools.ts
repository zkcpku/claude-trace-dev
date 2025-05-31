import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool definition for retrieving the most recent screenshot
 */
export const getLastScreenshotTool: Tool = {
	name: "GetLastScreenshot",
	description: "Returns the most recent screenshot as base64 encoded PNG data",
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
};

/**
 * MCP tool definition for taking a new screenshot
 */
export const takeScreenshotTool: Tool = {
	name: "TakeScreenshot",
	description: "Takes a new screenshot, stores it, and returns as base64 encoded PNG data",
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
};

/**
 * Array of all available MCP tools for the snap-happy server
 */
export const tools: Tool[] = [getLastScreenshotTool, takeScreenshotTool];
