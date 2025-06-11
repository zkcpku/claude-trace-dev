import { CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DiffyServer } from "../diffy-server.js";
import * as fs from "fs";
import * as path from "path";

interface HighlightArgs {
	absolutePath: string;
	startLine: number;
	endLine?: number;
}

/**
 * Highlight tool - highlights specific lines in a file (content mode only)
 */
export async function highlightTool(args: any, diffyServer: DiffyServer): Promise<CallToolResult> {
	try {
		// Validate arguments
		const { absolutePath, startLine, endLine } = args as HighlightArgs;

		if (!absolutePath || typeof absolutePath !== "string") {
			throw new McpError(ErrorCode.InvalidParams, "absolutePath is required and must be a string");
		}

		if (startLine === undefined || typeof startLine !== "number" || startLine < 1) {
			throw new McpError(ErrorCode.InvalidParams, "startLine is required and must be a positive number");
		}

		if (endLine !== undefined && (typeof endLine !== "number" || endLine < startLine)) {
			throw new McpError(ErrorCode.InvalidParams, "endLine must be a number >= startLine");
		}

		// Validate file exists
		if (!fs.existsSync(absolutePath)) {
			throw new McpError(ErrorCode.InvalidParams, `File does not exist: ${absolutePath}`);
		}

		// Convert to absolute path if needed
		const resolvedPath = path.resolve(absolutePath);

		// Validate line numbers against file content
		try {
			const content = fs.readFileSync(resolvedPath, "utf8");
			const lineCount = content.split("\n").length;

			if (startLine > lineCount) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`startLine ${startLine} exceeds file length (${lineCount} lines)`,
				);
			}

			if (endLine && endLine > lineCount) {
				throw new McpError(ErrorCode.InvalidParams, `endLine ${endLine} exceeds file length (${lineCount} lines)`);
			}
		} catch (error) {
			if (error instanceof McpError) {
				throw error;
			}
			throw new McpError(
				ErrorCode.InternalError,
				`Failed to read file for validation: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Highlight the lines
		await diffyServer.highlightFile(resolvedPath, startLine, endLine);

		const lineRange = endLine && endLine !== startLine ? `lines ${startLine}-${endLine}` : `line ${startLine}`;

		return {
			content: [
				{
					type: "text",
					text: `✅ Highlighted ${lineRange} in ${path.basename(resolvedPath)}\n\nFile: ${resolvedPath}\nHighlighted: ${lineRange}\n\nThe highlighted lines will be visible in the file viewer (content mode only).`,
				},
			],
		};
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}

		throw new McpError(
			ErrorCode.InternalError,
			`Failed to highlight lines: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
