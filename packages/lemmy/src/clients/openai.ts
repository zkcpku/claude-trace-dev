import OpenAI from 'openai'
import type {
  ChatClient,
  AskOptions,
  AskResult,
  OpenAIConfig,
  Message,
  ChatResponse,
  TokenUsage,
  ModelError,
  ToolCall,
  ToolResult
} from '../types.js'
import { zodToOpenAI } from '../tools/zod-converter.js'
import { findModelData } from '../models.js'

export class OpenAIClient implements ChatClient {
  private openai: OpenAI
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
      maxRetries: config.maxRetries ?? 3
    })
  }

  getModel(): string {
    return this.config.model
  }

  getProvider(): string {
    return 'openai'
  }

  async ask(prompt: string, options?: AskOptions): Promise<AskResult> {
    try {
      // Add user message to context first
      if (options?.context) {
        const userMessage: Message = {
          role: 'user',
          content: prompt,
          tokens: { input: 0, output: 0, total: 0 }, // Will be updated with actual usage
          provider: 'user',
          model: 'none',
          timestamp: new Date()
        }
        options.context.addMessage(userMessage)
      }

      // Convert context messages to OpenAI format
      const messages = this.convertMessages(prompt, options?.context?.getMessages() || [])
      const tools = options?.context?.listTools() || []

      // Convert tools to OpenAI format
      const openaiTools = tools.map((tool: any) => zodToOpenAI(tool))

      // Calculate appropriate token limits
      const modelData = findModelData(this.config.model)
      const maxCompletionTokens = this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096

      // Build request parameters
      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.config.model,
        max_completion_tokens: maxCompletionTokens,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(openaiTools.length > 0 && {
          tools: openaiTools,
          tool_choice: 'auto' as const
        }),
        ...(this.config.reasoningEffort && {
          reasoning_effort: this.config.reasoningEffort
        })
      }

      // Execute streaming request
      const stream = await this.openai.chat.completions.create(requestParams)

      return await this.processStream(stream as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>, options)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async sendToolResults(toolResults: ToolResult[], options?: AskOptions): Promise<AskResult> {
    try {
      // Add tool result messages to context first
      if (options?.context && toolResults.length > 0) {
        for (const result of toolResults) {
          options.context.addToolResult(result.toolCallId, result.content)
        }
      }

      // Convert context messages to OpenAI format
      const messages = this.convertMessagesForToolResults(options?.context?.getMessages() || [], [])
      const tools = options?.context?.listTools() || []

      // Convert tools to OpenAI format
      const openaiTools = tools.map((tool: any) => zodToOpenAI(tool))

      // Calculate appropriate token limits
      const modelData = findModelData(this.config.model)
      const maxCompletionTokens = this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096

      // Build request parameters
      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.config.model,
        max_completion_tokens: maxCompletionTokens,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(openaiTools.length > 0 && {
          tools: openaiTools,
          tool_choice: 'auto' as const
        }),
        ...(this.config.reasoningEffort && {
          reasoning_effort: this.config.reasoningEffort
        })
      }

      // Execute streaming request
      const stream = await this.openai.chat.completions.create(requestParams)

      return await this.processStream(stream as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>, options)
    } catch (error) {
      return this.handleError(error)
    }
  }

  private convertMessages(prompt: string, contextMessages: readonly Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // Add context messages first
    for (const msg of contextMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        const assistantMsg = msg as any // Type assertion to access toolCalls
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          // Create assistant message with tool calls
          const toolCalls = assistantMsg.toolCalls.map((toolCall: ToolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments)
            }
          }))

          messages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: toolCalls
          })
        } else {
          // Regular text-only assistant message
          messages.push({ role: 'assistant', content: msg.content })
        }
      } else if (msg.role === 'tool_result') {
        // Handle tool results - in OpenAI these are tool messages
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content
        })
      } else if (msg.role === 'system') {
        // Add system messages at the beginning
        messages.unshift({ role: 'system', content: msg.content })
      }
    }

    // Add the current prompt as user message
    messages.push({ role: 'user', content: prompt })

    return messages
  }

  private convertMessagesForToolResults(contextMessages: readonly Message[], toolResults: ToolResult[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // Add context messages first
    for (const msg of contextMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        const assistantMsg = msg as any // Type assertion to access toolCalls
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          // Create assistant message with tool calls
          const toolCalls = assistantMsg.toolCalls.map((toolCall: ToolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments)
            }
          }))

          messages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: toolCalls
          })
        } else {
          // Regular text-only assistant message
          messages.push({ role: 'assistant', content: msg.content })
        }
      } else if (msg.role === 'tool_result') {
        // Handle tool results - in OpenAI these are tool messages
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content
        })
      } else if (msg.role === 'system') {
        // Add system messages at the beginning
        messages.unshift({ role: 'system', content: msg.content })
      }
    }

    // Add the new tool results as tool messages
    for (const result of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: result.content
      })
    }

    return messages
  }

  private async processStream(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    options?: AskOptions
  ): Promise<AskResult> {
    let content = ''
    let thinkingContent = ''
    let inputTokens = 0
    let outputTokens = 0
    let stopReason: string | undefined
    let toolCalls: ToolCall[] = []
    const currentToolCalls = new Map<number, { id?: string; name?: string; arguments?: string }>()

    try {
      for await (const chunk of stream) {
        // Handle usage information (comes in final chunk with stream_options)
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0
          outputTokens = chunk.usage.completion_tokens || 0
        }

        // Handle reasoning events (for o1-mini and similar reasoning models)
        // Check for reasoning_summary_part or other reasoning events
        if ((chunk as any).type === 'reasoning_summary_part') {
          const reasoningChunk = (chunk as any).reasoning || (chunk as any).content || ''
          thinkingContent += reasoningChunk
          options?.onThinkingChunk?.(reasoningChunk)
          continue
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        // Handle content deltas
        if (choice.delta?.content) {
          const contentChunk = choice.delta.content
          content += contentChunk
          options?.onChunk?.(contentChunk)
        }

        // Handle reasoning deltas (for o1-mini and similar reasoning models)
        if ((choice as any).delta?.reasoning) {
          const reasoningChunk = (choice as any).delta.reasoning
          thinkingContent += reasoningChunk
          options?.onThinkingChunk?.(reasoningChunk)
        }

        // Handle tool call deltas
        if (choice.delta?.tool_calls) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const index = toolCallDelta.index!

            if (!currentToolCalls.has(index)) {
              currentToolCalls.set(index, {})
            }

            const currentToolCall = currentToolCalls.get(index)!

            if (toolCallDelta.id) {
              currentToolCall.id = toolCallDelta.id
            }

            if (toolCallDelta.function) {
              if (toolCallDelta.function.name) {
                currentToolCall.name = toolCallDelta.function.name
              }

              if (toolCallDelta.function.arguments) {
                currentToolCall.arguments = (currentToolCall.arguments || '') + toolCallDelta.function.arguments
              }
            }
          }
        }

        // Handle finish reason
        if (choice.finish_reason) {
          stopReason = choice.finish_reason
        }
      }

      // Process completed tool calls
      for (const [_, toolCallData] of currentToolCalls) {
        if (toolCallData.id && toolCallData.name) {
          try {
            let argsString = toolCallData.arguments || '{}'
            // Handle empty arguments (tools with no parameters)
            if (argsString.trim() === '') {
              argsString = '{}'
            }
            const parsedArgs = JSON.parse(argsString)
            toolCalls.push({
              id: toolCallData.id,
              name: toolCallData.name,
              arguments: parsedArgs
            })
          } catch (error) {
            // Invalid JSON in tool arguments - we'll handle this as an error
            console.error('Failed to parse tool arguments:', error)
          }
        }
      }

      // If no usage info from streaming, estimate tokens
      if (inputTokens === 0 && outputTokens === 0 && content) {
        // Rough token estimation as fallback - very approximate
        inputTokens = Math.ceil(content.length / 6) // Conservative input estimate
        outputTokens = Math.ceil(content.length / 4) // Output tokens from response
      }

      // Calculate tokens and cost
      const tokens: TokenUsage = {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      }

      const cost = this.calculateCost(tokens)

      // Check if there were tool calls
      if (toolCalls.length > 0) {
        // Add the assistant message with tool calls to context for proper conversation flow
        if (options?.context) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: content, // Any text content that came before tool calls
            toolCalls: toolCalls, // Store the tool calls
            tokens,
            provider: 'openai',
            model: this.config.model,
            timestamp: new Date()
          }
          options.context.addMessage(assistantMessage)
        }

        return { type: 'tool_call', toolCalls }
      }

      // Add message to context if provided (only for non-tool-call responses)
      if (options?.context) {
        const message: Message = {
          role: 'assistant',
          content,
          tokens,
          provider: 'openai',
          model: this.config.model,
          timestamp: new Date()
        }
        options.context.addMessage(message)
      }

      // Handle max_tokens case (no auto-continuation for OpenAI)
      const truncated = stopReason === 'length'

      // Return successful response
      const response: ChatResponse = {
        content,
        ...(thinkingContent && { thinking: thinkingContent }),
        tokens,
        cost,
        stopReason: this.mapStopReason(stopReason) || 'complete',
        truncated
      }

      return { type: 'success', response }

    } catch (error) {
      return this.handleError(error)
    }
  }

  private calculateCost(tokens: TokenUsage): number {
    const modelData = findModelData(this.config.model)
    if (!modelData?.pricing) {
      return 0 // Return 0 for unknown models
    }

    const inputCost = (tokens.input * modelData.pricing.inputPerMillion) / 1_000_000
    const outputCost = (tokens.output * modelData.pricing.outputPerMillion) / 1_000_000

    return inputCost + outputCost
  }

  private mapStopReason(reason: string | undefined): ChatResponse['stopReason'] | undefined {
    switch (reason) {
      case 'stop':
        return 'complete'
      case 'length':
        return 'max_tokens'
      case 'content_filter':
        return 'stop_sequence'
      case 'tool_calls':
        return 'tool_call'
      default:
        return undefined
    }
  }

  private handleError(error: unknown): AskResult {
    // Convert various error types to ModelError
    if (error instanceof Error && 'status' in error) {
      const apiError = error as any // Type assertion for OpenAI API error
      const modelError: ModelError = {
        type: this.getErrorType(apiError.status),
        message: apiError.message,
        retryable: this.isRetryable(apiError.status),
        ...(this.getRetryAfter(apiError) !== undefined && { retryAfter: this.getRetryAfter(apiError)! })
      }
      return { type: 'model_error', error: modelError }
    }

    // Handle other error types
    const modelError: ModelError = {
      type: 'api_error',
      message: error instanceof Error ? error.message : 'Unknown error',
      retryable: false
    }
    return { type: 'model_error', error: modelError }
  }

  private getErrorType(status?: number): ModelError['type'] {
    switch (status) {
      case 401:
        return 'auth'
      case 429:
        return 'rate_limit'
      case 400:
      case 404:
      case 422:
        return 'invalid_request'
      default:
        return 'api_error'
    }
  }

  private isRetryable(status?: number): boolean {
    return status === 429 || (status !== undefined && status >= 500)
  }

  private getRetryAfter(error: any): number | undefined {
    // Extract retry-after header if available
    const retryAfter = error.headers?.['retry-after']
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10)
      return isNaN(seconds) ? undefined : seconds
    }
    return undefined
  }
}