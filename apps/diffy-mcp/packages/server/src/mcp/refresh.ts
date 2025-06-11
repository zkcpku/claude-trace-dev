import { CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DiffyServer } from "../diffy-server.js";

/**
 * Refresh tool - refreshes all watched files and recalculates diffs
 */
export async function refreshTool(args: any, diffyServer: DiffyServer): Promise<CallToolResult> {
	try {
		// No arguments needed for refresh

		// Refresh all files
		await diffyServer.refreshFiles();

		return {
			content: [
				{
					type: "text",
					text: `✅ Refreshed all files\n\nAll watched files have been refreshed and git diffs recalculated. The file viewer will update automatically.`,
				},
			],
		};
	} catch (error) {
		throw new McpError(
			ErrorCode.InternalError,
			`Failed to refresh files: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
