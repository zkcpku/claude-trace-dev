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
	description:
		"Takes a new screenshot, stores it, and returns as base64 encoded PNG data. Optionally capture a specific window by ID (macOS only). If asked to capture a specific app, ALWAYS use ListWindows tool first, to get the windowId. Without windowId parameter, takes a full screen screenshot.",
	inputSchema: {
		type: "object",
		properties: {
			windowId: {
				type: "number",
				description:
					"Optional window ID to capture specific window (macOS only). If asked to capture a specific app, ALWAYS use ListWindows tool first, to get the windowId.",
			},
		},
		required: [],
	},
};

/**
 * MCP tool definition for listing windows (macOS only)
 */
export const listWindowsTool: Tool = {
	name: "ListWindows",
	description:
		"Lists all visible windows with their IDs, titles, application names, positions, and sizes (macOS only). Window IDs can be used with TakeScreenshot to capture specific windows. Use this tool FIRST when asked to capture a specific application or window.",
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
};

/**
 * Array of all available MCP tools for the snap-happy server
 */
export const tools: Tool[] = [getLastScreenshotTool, takeScreenshotTool, listWindowsTool];
