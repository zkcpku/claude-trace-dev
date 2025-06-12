/**
 * Built-in tools for lemmy-tools
 *
 * This module exports all the built-in tools that can be used with lemmy.
 * Each tool is implemented as a LemmyTool with proper schema validation.
 */

// Shell tools
export { bashTool } from "./bash.js";

// Filesystem tools
export { readTool, writeTool, editTool, multiEditTool, lsTool } from "./filesystem.js";

// Search tools
export { globTool, grepTool } from "./search.js";

// Productivity tools
export { todoReadTool, todoWriteTool } from "./todo.js";

// Task/Agent tool
export { taskTool } from "./task.js";

import type { LemmyTool } from "../types.js";
import { bashTool } from "./bash.js";
import { readTool, writeTool, editTool, multiEditTool, lsTool } from "./filesystem.js";
import { globTool, grepTool } from "./search.js";
import { todoReadTool, todoWriteTool } from "./todo.js";
import { taskTool } from "./task.js";

/**
 * Get all built-in tools as an array
 */
export function getBuiltinTools(): LemmyTool[] {
	return [
		// Shell
		bashTool,

		// Filesystem
		readTool,
		writeTool,
		editTool,
		multiEditTool,
		lsTool,

		// Search
		globTool,
		grepTool,

		// Productivity
		todoReadTool,
		todoWriteTool,

		// Task/Agent
		taskTool,
	];
}

/**
 * Get built-in tools by category
 */
export function getBuiltinToolsByCategory(category: string): LemmyTool[] {
	return getBuiltinTools().filter((tool) => tool.category === category);
}

/**
 * Get built-in tool by name
 */
export function getBuiltinTool(name: string): LemmyTool | undefined {
	return getBuiltinTools().find((tool) => tool.name === name);
}
