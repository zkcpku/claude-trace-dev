import { z } from "zod";
import type {
	DefineToolParams,
	ToolDefinition,
	ExecuteToolResult,
	ToolError,
	ToolCall,
	ToolResult,
	AskInput,
} from "../types.js";

// Tool system exports
export * from "./zod-converter.js";

/**
 * Define a tool with Zod schema validation and type-safe execution
 * @param params Tool definition parameters
 * @returns A typed tool definition with preserved return type
 */
export function defineTool<T extends Record<string, unknown>, R>(params: DefineToolParams<T, R>): ToolDefinition<T, R> {
	return {
		name: params.name,
		description: params.description,
		schema: params.schema,
		execute: params.execute,
	};
}

/**
 * Validate and execute a tool call
 * @param tool The tool definition
 * @param toolCall The tool call to execute
 * @returns Promise resolving to execution result with typed result
 */
export async function validateAndExecute<T extends Record<string, unknown>, R>(
	tool: ToolDefinition<T, R>,
	toolCall: ToolCall,
): Promise<ExecuteToolResult> {
	try {
		// Validate the arguments using the Zod schema
		const validatedArgs = tool.schema.parse(toolCall.arguments);

		// Execute the tool with validated arguments - preserve original return type
		const result = await tool.execute(validatedArgs);

		return {
			success: true,
			toolCallId: toolCall.id,
			result,
		};
	} catch (error) {
		// Handle Zod validation errors
		if (error instanceof z.ZodError) {
			const toolError: ToolError = {
				type: "invalid_args",
				message: `Invalid arguments for tool '${tool.name}': ${error.message}`,
				toolName: tool.name,
			};
			return {
				success: false,
				toolCallId: toolCall.id,
				error: toolError,
			};
		}

		// Handle execution errors
		const toolError: ToolError = {
			type: "execution_failed",
			message: error instanceof Error ? error.message : "Unknown error during tool execution",
			toolName: tool.name,
		};
		return {
			success: false,
			toolCallId: toolCall.id,
			error: toolError,
		};
	}
}

/**
 * Validate tool call arguments against a tool's schema
 * @param tool The tool definition
 * @param args The arguments to validate
 * @returns True if valid, throws ZodError if invalid
 */
export function validateToolCall<T extends Record<string, unknown>>(tool: ToolDefinition<T, any>, args: unknown): T {
	return tool.schema.parse(args);
}

/**
 * Convert tool execution result to string for LLM consumption
 * @param result The result from tool execution
 * @returns String representation suitable for LLM
 */
export function resultToString(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}
	if (result === null || result === undefined) {
		return String(result);
	}
	if (typeof result === "object" || Array.isArray(result)) {
		// JSON stringify both arrays and objects
		return JSON.stringify(result, null, 2);
	}
	return String(result);
}

/**
 * Convert a tool execution result to a ToolResult for LLM consumption
 */
export function toToolResult(executionResult: ExecuteToolResult): ToolResult {
	const content = executionResult.success
		? resultToString(executionResult.result)
		: `Error: ${executionResult.error.message}`;

	return {
		toolCallId: executionResult.toolCallId,
		content,
	};
}

/**
 * Convert an array of tool execution results to an array of ToolResults for LLM consumption
 */
export function toToolResults(executionResults: ExecuteToolResult[]): ToolResult[] {
	return executionResults.map(toToolResult);
}

/**
 * Convert ExecuteToolResult(s) to AskInput
 */
export function toAskInput(input: ExecuteToolResult | ExecuteToolResult[]): AskInput {
	const results = Array.isArray(input) ? input : [input];
	return { toolResults: toToolResults(results) };
}
