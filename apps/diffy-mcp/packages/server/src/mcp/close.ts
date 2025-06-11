import { CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DiffyServer } from "../diffy-server.js";
import * as path from "path";

interface CloseArgs {
	absolutePath: string;
}

/**
 * Close tool - closes a file from all panels
 */
export async function closeTool(args: any, diffyServer: DiffyServer): Promise<CallToolResult> {
	try {
		// Validate arguments
		const { absolutePath } = args as CloseArgs;

		if (!absolutePath || typeof absolutePath !== "string") {
			throw new McpError(ErrorCode.InvalidParams, "absolutePath is required and must be a string");
		}

		// Convert to absolute path if needed
		const resolvedPath = path.resolve(absolutePath);

		// Close the file
		await diffyServer.closeFile(resolvedPath);

		return {
			content: [
				{
					type: "text",
					text: `✅ Closed ${path.basename(resolvedPath)}\n\nFile: ${resolvedPath}\n\nThe file has been removed from all panels in the file viewer.`,
				},
			],
		};
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}

		throw new McpError(
			ErrorCode.InternalError,
			`Failed to close file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
