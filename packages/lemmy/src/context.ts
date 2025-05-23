// Context class for managing conversation state and tools
import type { Message, TokenUsage, ToolDefinition, ToolCall, ToolExecutionResult, ToolError } from './types.js'
import { findModelData, type ModelData } from './models.js'

export class Context {
  private messages: Message[] = []
  private tools = new Map<string, ToolDefinition<any, any>>()

  addMessage(message: Message): void {
    this.messages.push(message)
  }

  getMessages(): readonly Message[] {
    return this.messages
  }

  getLastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1]
  }

  clear(): void {
    this.messages = []
  }

  clone(): Context {
    const newContext = new Context()
    newContext.messages = [...this.messages]
    newContext.tools = new Map(this.tools)
    return newContext
  }

  getTotalCost(): number {
    return this.messages.reduce((total, message) => {
      return total + this.calculateMessageCost(message)
    }, 0)
  }

  getTokenUsage(): TokenUsage {
    return this.messages.reduce(
      (acc, message) => {
        // Tool result messages don't have token usage
        if (message.role === 'tool_result') {
          return acc
        }
        return {
          input: acc.input + message.tokens.input,
          output: acc.output + message.tokens.output,
          total: acc.total + message.tokens.total
        }
      },
      { input: 0, output: 0, total: 0 }
    )
  }

  getCostByProvider(): Record<string, number> {
    const costs: Record<string, number> = {}
    for (const message of this.messages) {
      // Tool result messages don't have provider info
      if (message.role === 'tool_result') {
        continue
      }
      costs[message.provider] = (costs[message.provider] || 0) + this.calculateMessageCost(message)
    }
    return costs
  }

  getCostByModel(): Record<string, number> {
    const costs: Record<string, number> = {}
    for (const message of this.messages) {
      // Tool result messages don't have model info
      if (message.role === 'tool_result') {
        continue
      }
      costs[message.model] = (costs[message.model] || 0) + this.calculateMessageCost(message)
    }
    return costs
  }

  getTokensByProvider(): Record<string, TokenUsage> {
    const tokens: Record<string, TokenUsage> = {}
    for (const message of this.messages) {
      // Tool result messages don't have provider or token info
      if (message.role === 'tool_result') {
        continue
      }
      if (!tokens[message.provider]) {
        tokens[message.provider] = { input: 0, output: 0, total: 0 }
      }
      const providerTokens = tokens[message.provider]!
      providerTokens.input += message.tokens.input
      providerTokens.output += message.tokens.output
      providerTokens.total += message.tokens.total
    }
    return tokens
  }

  getTokensByModel(): Record<string, TokenUsage> {
    const tokens: Record<string, TokenUsage> = {}
    for (const message of this.messages) {
      // Tool result messages don't have model or token info
      if (message.role === 'tool_result') {
        continue
      }
      if (!tokens[message.model]) {
        tokens[message.model] = { input: 0, output: 0, total: 0 }
      }
      const modelTokens = tokens[message.model]!
      modelTokens.input += message.tokens.input
      modelTokens.output += message.tokens.output
      modelTokens.total += message.tokens.total
    }
    return tokens
  }

  private findModelData(model: string): ModelData | undefined {
    return findModelData(model)
  }

  private calculateMessageCost(message: Message): number {
    // Tool result messages don't have cost - they're just passing data back to LLM
    if (message.role === 'tool_result') {
      return 0
    }
    
    const modelData = this.findModelData(message.model)
    if (!modelData?.pricing) {
      return 0 // Return 0 for unknown models or local models without pricing
    }
    
    const inputCost = (message.tokens.input * modelData.pricing.inputPerMillion) / 1_000_000
    const outputCost = (message.tokens.output * modelData.pricing.outputPerMillion) / 1_000_000
    
    return inputCost + outputCost
  }

  addTool<T = Record<string, unknown>, R = unknown>(tool: ToolDefinition<T, R>): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name)
  }

  listTools(): ToolDefinition<any, any>[] {
    return Array.from(this.tools.values())
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolCall.name)
    if (!tool) {
      const error: ToolError = {
        type: 'execution_failed',
        message: `Tool not found: ${toolCall.name}`,
        toolName: toolCall.name
      }
      return { success: false, error }
    }

    try {
      // Validate arguments using the tool's Zod schema
      const validatedArgs = tool.schema.parse(toolCall.arguments)
      const result = await tool.execute(validatedArgs)
      return { success: true, result }
    } catch (error) {
      // Handle Zod validation errors
      if (error && typeof error === 'object' && 'issues' in error) {
        const toolError: ToolError = {
          type: 'invalid_args',
          message: `Invalid arguments for tool '${toolCall.name}': ${(error as any).message}`,
          toolName: toolCall.name
        }
        return { success: false, error: toolError }
      }
      
      // Handle execution errors
      const toolError: ToolError = {
        type: 'execution_failed',
        message: error instanceof Error ? error.message : 'Unknown error during tool execution',
        toolName: toolCall.name
      }
      return { success: false, error: toolError }
    }
  }

  /**
   * Execute multiple tools in parallel
   * @param toolCalls Array of tool calls to execute
   * @returns Promise resolving to array of results in the same order
   */
  async executeTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
    return Promise.all(toolCalls.map(toolCall => this.executeTool(toolCall)))
  }

  /**
   * Create a tool result message and add it to the conversation
   * @param toolCallId - The ID of the tool call this result responds to
   * @param result - The result from tool execution (will be converted to string)
   */
  addToolResult(toolCallId: string, result: unknown): void {
    const content = this.resultToString(result)
    const toolResultMessage: Message = {
      role: 'tool_result',
      tool_call_id: toolCallId,
      content
    }
    this.addMessage(toolResultMessage)
  }

  /**
   * Add multiple tool results to the conversation
   * @param results - Array of tool execution results to add
   */
  addToolResults(results: Array<{ toolCallId: string; result: unknown }>): void {
    for (const { toolCallId, result } of results) {
      this.addToolResult(toolCallId, result)
    }
  }

  /**
   * Convert any tool result to a string for LLM consumption
   */
  private resultToString(result: unknown): string {
    if (result === null || result === undefined) {
      return String(result)
    }
    if (typeof result === 'string') {
      return result
    }
    if (typeof result === 'number' || typeof result === 'boolean') {
      return String(result)
    }
    if (typeof result === 'object') {
      try {
        return JSON.stringify(result, null, 2)
      } catch {
        return String(result)
      }
    }
    return String(result)
  }
}