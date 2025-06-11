import { CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DiffyServer } from "../diffy-server.js";
import * as fs from "fs";
import * as path from "path";

interface OpenArgs {
	absolutePath: string;
	panel: number;
	branch?: string;
}

/**
 * Open tool - opens a file in the specified panel with optional git diff
 */
export async function openTool(args: any, diffyServer: DiffyServer): Promise<CallToolResult> {
	try {
		// Validate arguments
		const { absolutePath, panel, branch } = args as OpenArgs;

		if (!absolutePath || typeof absolutePath !== "string") {
			throw new McpError(ErrorCode.InvalidParams, "absolutePath is required and must be a string");
		}

		if (panel === undefined || (panel !== 0 && panel !== 1)) {
			throw new McpError(ErrorCode.InvalidParams, "panel is required and must be 0 (left) or 1 (right)");
		}

		if (branch !== undefined && typeof branch !== "string") {
			throw new McpError(ErrorCode.InvalidParams, "branch must be a string if provided");
		}

		// Validate file exists
		if (!fs.existsSync(absolutePath)) {
			throw new McpError(ErrorCode.InvalidParams, `File does not exist: ${absolutePath}`);
		}

		// Validate it's a file, not a directory
		const stats = fs.statSync(absolutePath);
		if (!stats.isFile()) {
			throw new McpError(ErrorCode.InvalidParams, `Path is not a file: ${absolutePath}`);
		}

		// Convert to absolute path if needed
		const resolvedPath = path.resolve(absolutePath);

		// Open the file
		await diffyServer.openFile(resolvedPath, panel, branch);

		const panelName = panel === 0 ? "left" : "right";
		const branchInfo = branch ? ` (diff vs ${branch})` : "";

		return {
			content: [
				{
					type: "text",
					text: `✅ Opened ${path.basename(resolvedPath)} in ${panelName} panel${branchInfo}\n\nFile: ${resolvedPath}\nPanel: ${panelName}\nBranch: ${branch || "none (working vs HEAD)"}\n\nThe file viewer interface will open automatically in your default browser.`,
				},
			],
		};
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}

		throw new McpError(
			ErrorCode.InternalError,
			`Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
