import { findModelData, type ModelData } from "./model-registry.js";
import { validateAndExecute } from "./tools/index.js";
import type { Message, TokenUsage, ToolCall, ToolDefinition, ToolError, ToolExecutionResult } from "./types.js";

export class Context {
	private systemMessage?: string;
	private messages: Message[] = [];
	private tools = new Map<string, ToolDefinition<any, any>>();

	setSystemMessage(message: string): void {
		this.systemMessage = message;
	}

	getSystemMessage(): string | undefined {
		return this.systemMessage;
	}

	addMessage(message: Message): void {
		this.messages.push(message);
	}

	getMessages(): Message[] {
		return this.messages;
	}

	getLastMessage(): Message | undefined {
		return this.messages[this.messages.length - 1];
	}

	clear(): void {
		this.messages = [];
	}

	clone(): Context {
		const newContext = new Context();
		newContext.messages = [...this.messages];
		newContext.tools = new Map(this.tools);
		return newContext;
	}

	getTotalCost(): number {
		return this.messages.reduce((total, message) => {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					return total + inputCost + outputCost;
				}
			}
			return total;
		}, 0);
	}

	getTokenUsage(): TokenUsage {
		return this.messages.reduce(
			(acc, message) => {
				if (message.role === "assistant" && message.usage) {
					return {
						input: acc.input + message.usage.input,
						output: acc.output + message.usage.output,
					};
				}
				return acc;
			},
			{ input: 0, output: 0 },
		);
	}

	getCostByProvider(): Record<string, number> {
		const costs: Record<string, number> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					costs[message.provider] = (costs[message.provider] || 0) + inputCost + outputCost;
				}
			}
		}
		return costs;
	}

	getCostByModel(): Record<string, number> {
		const costs: Record<string, number> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					costs[message.model] = (costs[message.model] || 0) + inputCost + outputCost;
				}
			}
		}
		return costs;
	}

	getTokensByProvider(): Record<string, TokenUsage> {
		const tokens: Record<string, TokenUsage> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				if (!tokens[message.provider]) {
					tokens[message.provider] = { input: 0, output: 0 };
				}
				const providerTokens = tokens[message.provider]!;
				providerTokens.input += message.usage.input;
				providerTokens.output += message.usage.output;
			}
		}
		return tokens;
	}

	getTokensByModel(): Record<string, TokenUsage> {
		const tokens: Record<string, TokenUsage> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				if (!tokens[message.model]) {
					tokens[message.model] = { input: 0, output: 0 };
				}
				const modelTokens = tokens[message.model]!;
				modelTokens.input += message.usage.input;
				modelTokens.output += message.usage.output;
			}
		}
		return tokens;
	}

	private findModelData(model: string): ModelData | undefined {
		return findModelData(model);
	}

	addTool<T = Record<string, unknown>, R = unknown>(tool: ToolDefinition<T, R>): void {
		this.tools.set(tool.name, tool);
	}

	getTool(name: string): ToolDefinition<any, any> | undefined {
		return this.tools.get(name);
	}

	listTools(): ToolDefinition<any, any>[] {
		return Array.from(this.tools.values());
	}

	async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
		const tool = this.tools.get(toolCall.name);
		if (!tool) {
			const error: ToolError = {
				type: "execution_failed",
				message: `Tool not found: ${toolCall.name}`,
				toolName: toolCall.name,
			};
			return { success: false, error, toolCallId: toolCall.id };
		}

		return validateAndExecute(tool, toolCall);
	}

	/**
	 * Execute multiple tools in parallel
	 * @param toolCalls Array of tool calls to execute
	 * @returns Promise resolving to array of results in the same order
	 */
	async executeTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
		return Promise.all(toolCalls.map((toolCall) => this.executeTool(toolCall)));
	}
}
