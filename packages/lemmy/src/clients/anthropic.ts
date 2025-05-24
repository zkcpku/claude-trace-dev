import Anthropic from '@anthropic-ai/sdk'
import type {
  ChatClient,
  AskOptions,
  AskResult,
  AnthropicConfig,
  Message,
  ChatResponse,
  TokenUsage,
  ModelError,
  ToolCall,
  ToolResult
} from '../types.js'
import { zodToAnthropic } from '../tools/zod-converter.js'
import { findModelData } from '../models.js'

export class AnthropicClient implements ChatClient {
  private anthropic: Anthropic
  private config: AnthropicConfig

  constructor(config: AnthropicConfig) {
    this.config = config
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: config.maxRetries ?? 3
    })
  }

  getModel(): string {
    return this.config.model
  }

  getProvider(): string {
    return 'anthropic'
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

      // Convert context messages to Anthropic format
      const messages = this.convertMessages(prompt, options?.context?.getMessages() || [])
      const tools = options?.context?.listTools() || []

      // Convert tools to Anthropic format
      const anthropicTools = tools.map((tool: any) => zodToAnthropic(tool))

      // Calculate appropriate token limits
      const modelData = findModelData(this.config.model)
      const defaultMaxTokens = this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096
      const thinkingBudget = this.config.thinking?.budgetTokens || 3000
      const maxTokens = this.config.thinking?.enabled 
        ? Math.max(defaultMaxTokens, thinkingBudget + 1000) // Ensure max_tokens > budget_tokens
        : defaultMaxTokens
        
      // Build request parameters
      const requestParams = {
        model: this.config.model,
        max_tokens: maxTokens,
        messages,
        ...(anthropicTools.length > 0 && { tools: anthropicTools }),
        ...(this.config.thinking?.enabled && {
          thinking: {
            type: 'enabled' as const,
            budget_tokens: thinkingBudget
          }
        })
      }

      // Execute streaming request
      const stream = await this.anthropic.messages.create({
        ...requestParams,
        stream: true
      })

      return await this.processStream(stream, options)
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

      // Convert context messages to Anthropic format (toolResults are already in context)
      const messages = this.convertMessagesForToolResults(options?.context?.getMessages() || [], [])
      const tools = options?.context?.listTools() || []

      // Convert tools to Anthropic format
      const anthropicTools = tools.map((tool: any) => zodToAnthropic(tool))

      // Calculate appropriate token limits
      const modelData = findModelData(this.config.model)
      const defaultMaxTokens = this.config.maxOutputTokens || modelData?.maxOutputTokens || 4096
      const thinkingBudget = this.config.thinking?.budgetTokens || 3000
      const maxTokens = this.config.thinking?.enabled 
        ? Math.max(defaultMaxTokens, thinkingBudget + 1000) // Ensure max_tokens > budget_tokens
        : defaultMaxTokens
        
      // Build request parameters
      const requestParams = {
        model: this.config.model,
        max_tokens: maxTokens,
        messages,
        ...(anthropicTools.length > 0 && { tools: anthropicTools }),
        ...(this.config.thinking?.enabled && {
          thinking: {
            type: 'enabled' as const,
            budget_tokens: thinkingBudget
          }
        })
      }

      // Execute streaming request
      const stream = await this.anthropic.messages.create({
        ...requestParams,
        stream: true
      })

      return await this.processStream(stream, options)
    } catch (error) {
      return this.handleError(error)
    }
  }

  private convertMessages(prompt: string, contextMessages: readonly Message[]): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = []

    // Add context messages first
    for (const msg of contextMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        const assistantMsg = msg as any // Type assertion to access toolCalls
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          // Create content array with text and tool_use blocks
          const contentBlocks: any[] = []
          
          // Add text content if present
          if (msg.content.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content })
          }
          
          // Add tool_use blocks
          for (const toolCall of assistantMsg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.arguments
            })
          }
          
          messages.push({ role: 'assistant', content: contentBlocks })
        } else {
          // Regular text-only assistant message
          messages.push({ role: 'assistant', content: msg.content })
        }
      } else if (msg.role === 'tool_result') {
        // Handle tool results - in Anthropic these are part of user messages with tool_use_id
        messages.push({ 
          role: 'user', 
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            }
          ]
        })
      }
      // Skip system messages for now - will be handled later
    }

    // Add the current prompt as user message
    messages.push({ role: 'user', content: prompt })

    return messages
  }

  private convertMessagesForToolResults(contextMessages: readonly Message[], toolResults: ToolResult[]): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = []

    // Add context messages first
    for (const msg of contextMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        const assistantMsg = msg as any // Type assertion to access toolCalls
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          // Create content array with text and tool_use blocks
          const contentBlocks: any[] = []
          
          // Add text content if present
          if (msg.content.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content })
          }
          
          // Add tool_use blocks
          for (const toolCall of assistantMsg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.arguments
            })
          }
          
          messages.push({ role: 'assistant', content: contentBlocks })
        } else {
          // Regular text-only assistant message
          messages.push({ role: 'assistant', content: msg.content })
        }
      } else if (msg.role === 'tool_result') {
        // Handle tool results - in Anthropic these are part of user messages with tool_use_id
        messages.push({ 
          role: 'user', 
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            }
          ]
        })
      }
      // Skip system messages for now - will be handled later
    }

    // Add the new tool results as user messages
    if (toolResults.length > 0) {
      const toolResultBlocks = toolResults.map(result => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: result.content
      }))
      
      messages.push({ 
        role: 'user', 
        content: toolResultBlocks
      })
    }

    return messages
  }

  private async processStream(
    stream: AsyncIterable<Anthropic.MessageStreamEvent>,
    options?: AskOptions
  ): Promise<AskResult> {
    let content = ''
    let thinkingContent = ''
    let inputTokens = 0
    let outputTokens = 0
    let stopReason: string | undefined
    let toolCalls: ToolCall[] = []
    let currentToolCall: { id?: string; name?: string; arguments?: string | Record<string, unknown> } | null = null
    let currentBlockType: 'text' | 'thinking' | 'tool_use' | null = null

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            inputTokens = event.message.usage.input_tokens
            // message_start may contain initial output tokens (usually 0 or low)
            outputTokens = event.message.usage.output_tokens
            break

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const chunk = event.delta.text
              if (currentBlockType === 'thinking') {
                // This shouldn't happen, but handle gracefully
                thinkingContent += chunk
                options?.onThinkingChunk?.(chunk)
              } else {
                // Regular text content
                content += chunk
                options?.onChunk?.(chunk)
              }
            } else if (event.delta.type === 'thinking_delta') {
              // Handle thinking deltas - these are internal reasoning steps
              const thinkingChunk = event.delta.thinking || ''
              thinkingContent += thinkingChunk
              options?.onThinkingChunk?.(thinkingChunk)
              // Note: thinking tokens are included in the total output_tokens count
              // but represent internal reasoning, not user-facing content
            } else if (event.delta.type === 'input_json_delta') {
              // Tool call argument streaming - accumulate JSON
              if (currentToolCall) {
                const currentArgs = typeof currentToolCall.arguments === 'string' ? currentToolCall.arguments : ''
                currentToolCall.arguments = currentArgs + event.delta.partial_json
              }
            }
            break

          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              // Start of a new tool call
              currentBlockType = 'tool_use'
              currentToolCall = {
                id: event.content_block.id,
                name: event.content_block.name,
                arguments: '' as string | Record<string, unknown>
              }
            } else if (event.content_block.type === 'text') {
              currentBlockType = 'text'
            } else if (event.content_block.type === 'thinking') {
              currentBlockType = 'thinking'
            }
            break

          case 'content_block_stop':
            // Complete the current tool call
            if (currentBlockType === 'tool_use' && currentToolCall && currentToolCall.id && currentToolCall.name) {
              try {
                let argsString = typeof currentToolCall.arguments === 'string' ? currentToolCall.arguments : '{}'
                // Handle empty arguments (tools with no parameters)
                if (argsString.trim() === '') {
                  argsString = '{}'
                }
                const parsedArgs = JSON.parse(argsString)
                toolCalls.push({
                  id: currentToolCall.id!,
                  name: currentToolCall.name!,
                  arguments: parsedArgs
                })
              } catch (error) {
                // Invalid JSON in tool arguments - we'll handle this as an error
                console.error('Failed to parse tool arguments:', error)
              }
              currentToolCall = null
            }
            // Reset current block type
            currentBlockType = null
            break

          case 'message_delta':
            if (event.delta.stop_reason) {
              stopReason = event.delta.stop_reason
            }
            // message_delta contains cumulative output token counts
            if ((event as any).usage?.output_tokens !== undefined) {
              outputTokens = (event as any).usage.output_tokens
            }
            break

          case 'message_stop':
            // message_stop typically doesn't contain additional usage data
            // Final token counts should already be captured from message_delta
            break
        }
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
            provider: 'anthropic',
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
          provider: 'anthropic',
          model: this.config.model,
          timestamp: new Date()
        }
        options.context.addMessage(message)
      }

      // Handle automatic continuation for max_tokens
      if (stopReason === 'max_tokens' && content.trim()) {
        // Add the partial response to context first
        if (options?.context) {
          const partialMessage: Message = {
            role: 'assistant',
            content,
            tokens,
            provider: 'anthropic',
            model: this.config.model,
            timestamp: new Date()
          }
          options.context.addMessage(partialMessage)
        }

        // Continue the conversation to get the rest
        const continuationResult = await this.ask('Please continue.', options)

        if (continuationResult.type === 'success') {
          // Merge the responses
          const mergedTokens: TokenUsage = {
            input: tokens.input + continuationResult.response.tokens.input,
            output: tokens.output + continuationResult.response.tokens.output,
            total: tokens.total + continuationResult.response.tokens.total
          }

          const mergedCost = cost + continuationResult.response.cost
          const mergedContent = content + continuationResult.response.content

          // Update the message in context with merged content
          if (options?.context) {
            // Replace the last message with the merged one
            const messages = options.context.getMessages()
            if (messages.length > 0) {
              // Remove the partial message we added earlier
              (options.context as any).messages.pop()

              // Add the complete merged message
              const mergedMessage: Message = {
                role: 'assistant',
                content: mergedContent,
                tokens: mergedTokens,
                provider: 'anthropic',
                model: this.config.model,
                timestamp: new Date()
              }
              options.context.addMessage(mergedMessage)
            }
          }

          const response: ChatResponse = {
            content: mergedContent,
            ...(thinkingContent && { thinking: thinkingContent }),
            tokens: mergedTokens,
            cost: mergedCost,
            stopReason: continuationResult.response.stopReason || 'complete',
            truncated: continuationResult.response.truncated || false
          }

          return { type: 'success', response }
        } else {
          // If continuation failed, return the partial response
          const response: ChatResponse = {
            content,
            ...(thinkingContent && { thinking: thinkingContent }),
            tokens,
            cost,
            stopReason: 'max_tokens',
            truncated: true
          }

          return { type: 'success', response }
        }
      }

      // Return successful response (no continuation needed)
      const response: ChatResponse = {
        content,
        ...(thinkingContent && { thinking: thinkingContent }),
        tokens,
        cost,
        stopReason: this.mapStopReason(stopReason) || 'complete',
        truncated: false
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
      case 'end_turn':
        return 'complete'
      case 'max_tokens':
        return 'max_tokens'
      case 'stop_sequence':
        return 'stop_sequence'
      case 'tool_use':
        return 'tool_call'
      default:
        return undefined
    }
  }

  private handleError(error: unknown): AskResult {
    // Convert various error types to ModelError
    if (error instanceof Error && 'status' in error) {
      const apiError = error as any // Type assertion for Anthropic API error
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