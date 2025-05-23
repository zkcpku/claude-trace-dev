import { describe, it, expect } from 'vitest'
import { Context } from '../src/context.js'
import type { Message } from '../src/types.js'

describe('Context', () => {
  it('should create empty context', () => {
    const context = new Context()
    expect(context.getMessages()).toHaveLength(0)
    expect(context.getTotalCost()).toBe(0)
    expect(context.getTokenUsage()).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('should add and retrieve messages', () => {
    const context = new Context()
    const message: Message = {
      role: 'user',
      content: 'Hello',
      tokens: { input: 5, output: 0, total: 5 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timestamp: new Date()
    }
    
    context.addMessage(message)
    expect(context.getMessages()).toHaveLength(1)
    expect(context.getMessages()[0]).toEqual(message)
  })

  it('should get last message', () => {
    const context = new Context()
    
    // Empty context should return undefined
    expect(context.getLastMessage()).toBeUndefined()
    
    const message1: Message = {
      role: 'user',
      content: 'First message',
      tokens: { input: 5, output: 0, total: 5 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timestamp: new Date()
    }
    
    const message2: Message = {
      role: 'assistant',
      content: 'Second message',
      tokens: { input: 0, output: 8, total: 8 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timestamp: new Date()
    }
    
    context.addMessage(message1)
    expect(context.getLastMessage()).toEqual(message1)
    
    context.addMessage(message2)
    expect(context.getLastMessage()).toEqual(message2)
  })

  it('should clone context', () => {
    const context = new Context()
    const message: Message = {
      role: 'user',
      content: 'Hello',
      tokens: { input: 5, output: 0, total: 5 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timestamp: new Date()
    }
    
    context.addMessage(message)
    const cloned = context.clone()
    
    expect(cloned.getMessages()).toHaveLength(1)
    expect(cloned.getMessages()[0]).toEqual(message)
    
    // Should be independent
    context.clear()
    expect(context.getMessages()).toHaveLength(0)
    expect(cloned.getMessages()).toHaveLength(1)
  })

  it('should clear messages', () => {
    const context = new Context()
    const message: Message = {
      role: 'user',
      content: 'Hello',
      tokens: { input: 5, output: 0, total: 5 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timestamp: new Date()
    }
    
    context.addMessage(message)
    expect(context.getMessages()).toHaveLength(1)
    
    context.clear()
    expect(context.getMessages()).toHaveLength(0)
    expect(context.getTotalCost()).toBe(0)
    expect(context.getTokenUsage()).toEqual({ input: 0, output: 0, total: 0 })
  })

  describe('token tracking', () => {
    it('should aggregate token usage across messages', () => {
      const context = new Context()
      
      const message1: Message = {
        role: 'user',
        content: 'Hello',
        tokens: { input: 5, output: 0, total: 5 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const message2: Message = {
        role: 'assistant',
        content: 'Hi there!',
        tokens: { input: 0, output: 10, total: 10 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      context.addMessage(message1)
      context.addMessage(message2)
      
      expect(context.getTokenUsage()).toEqual({ input: 5, output: 10, total: 15 })
    })

    it('should track tokens by provider', () => {
      const context = new Context()
      
      const anthropicMessage: Message = {
        role: 'assistant',
        content: 'Hello from Claude',
        tokens: { input: 0, output: 15, total: 15 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const openaiMessage: Message = {
        role: 'assistant',
        content: 'Hello from GPT',
        tokens: { input: 0, output: 10, total: 10 },
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: new Date()
      }
      
      context.addMessage(anthropicMessage)
      context.addMessage(openaiMessage)
      
      const tokensByProvider = context.getTokensByProvider()
      expect(tokensByProvider).toEqual({
        anthropic: { input: 0, output: 15, total: 15 },
        openai: { input: 0, output: 10, total: 10 }
      })
    })

    it('should track tokens by model', () => {
      const context = new Context()
      
      const sonnetMessage: Message = {
        role: 'assistant',
        content: 'Hello from Sonnet',
        tokens: { input: 0, output: 15, total: 15 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const haikuMessage: Message = {
        role: 'assistant',
        content: 'Hello from Haiku',
        tokens: { input: 0, output: 8, total: 8 },
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        timestamp: new Date()
      }
      
      context.addMessage(sonnetMessage)
      context.addMessage(haikuMessage)
      
      const tokensByModel = context.getTokensByModel()
      expect(tokensByModel).toEqual({
        'claude-3-5-sonnet-20241022': { input: 0, output: 15, total: 15 },
        'claude-3-5-haiku-20241022': { input: 0, output: 8, total: 8 }
      })
    })
  })

  describe('cost calculation', () => {
    it('should calculate cost for known models', () => {
      const context = new Context()
      
      // Claude 3.5 Sonnet pricing: $3 input, $15 output per million tokens
      const message: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 1000, output: 2000, total: 3000 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      context.addMessage(message)
      
      // Expected cost: (1000 * 3 + 2000 * 15) / 1_000_000 = 0.033
      expect(context.getTotalCost()).toBeCloseTo(0.033, 5)
    })

    it('should return zero cost for unknown models', () => {
      const context = new Context()
      
      const message: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 1000, output: 2000, total: 3000 },
        provider: 'local',
        model: 'unknown-model',
        timestamp: new Date()
      }
      
      context.addMessage(message)
      expect(context.getTotalCost()).toBe(0)
    })

    it('should track costs by provider', () => {
      const context = new Context()
      
      const anthropicMessage: Message = {
        role: 'assistant',
        content: 'Hello from Claude',
        tokens: { input: 1000, output: 1000, total: 2000 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const openaiMessage: Message = {
        role: 'assistant',
        content: 'Hello from GPT',
        tokens: { input: 1000, output: 1000, total: 2000 },
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: new Date()
      }
      
      context.addMessage(anthropicMessage)
      context.addMessage(openaiMessage)
      
      const costsByProvider = context.getCostByProvider()
      
      // Claude: (1000 * 3 + 1000 * 15) / 1_000_000 = 0.018
      // GPT-4o: (1000 * 2.5 + 1000 * 10) / 1_000_000 = 0.0125
      expect(costsByProvider['anthropic']).toBeCloseTo(0.018, 5)
      expect(costsByProvider['openai']).toBeCloseTo(0.0125, 5)
    })

    it('should track costs by model', () => {
      const context = new Context()
      
      const sonnetMessage: Message = {
        role: 'assistant',
        content: 'Hello from Sonnet',
        tokens: { input: 1000, output: 1000, total: 2000 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const haikuMessage: Message = {
        role: 'assistant',
        content: 'Hello from Haiku',
        tokens: { input: 1000, output: 1000, total: 2000 },
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        timestamp: new Date()
      }
      
      context.addMessage(sonnetMessage)
      context.addMessage(haikuMessage)
      
      const costsByModel = context.getCostByModel()
      
      // Sonnet: (1000 * 3 + 1000 * 15) / 1_000_000 = 0.018
      // Haiku: (1000 * 0.8 + 1000 * 4) / 1_000_000 = 0.0048
      expect(costsByModel['claude-3-5-sonnet-20241022']).toBeCloseTo(0.018, 5)
      expect(costsByModel['claude-3-5-haiku-20241022']).toBeCloseTo(0.0048, 5)
    })

    it('should handle models without pricing', () => {
      const context = new Context()
      
      const message: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 1000, output: 2000, total: 3000 },
        provider: 'openai',
        model: 'text-moderation-latest', // This model has pricing: null
        timestamp: new Date()
      }
      
      context.addMessage(message)
      expect(context.getTotalCost()).toBe(0)
    })
  })

  describe('tool result messages', () => {
    it('should add tool result messages correctly', () => {
      const context = new Context()
      
      // Add a tool result using the helper method
      context.addToolResult('tool-call-123', { result: 'success', value: 42 })
      
      const messages = context.getMessages()
      expect(messages).toHaveLength(1)
      
      const toolResult = messages[0]
      expect(toolResult?.role).toBe('tool_result')
      if (toolResult?.role === 'tool_result') {
        expect(toolResult.tool_call_id).toBe('tool-call-123')
        expect(toolResult.content).toBe('{\n  "result": "success",\n  "value": 42\n}')
      }
    })

    it('should handle different result types in tool results', () => {
      const context = new Context()
      
      // Test string result
      context.addToolResult('call-1', 'string result')
      
      // Test number result
      context.addToolResult('call-2', 42)
      
      // Test boolean result
      context.addToolResult('call-3', true)
      
      // Test null result
      context.addToolResult('call-4', null)
      
      // Test object result
      context.addToolResult('call-5', { key: 'value' })
      
      const messages = context.getMessages()
      expect(messages).toHaveLength(5)
      
      // Check each message type
      expect(messages[0]?.content).toBe('string result')
      expect(messages[1]?.content).toBe('42')
      expect(messages[2]?.content).toBe('true')
      expect(messages[3]?.content).toBe('null')
      expect(messages[4]?.content).toBe('{\n  "key": "value"\n}')
    })

    it('should exclude tool result messages from token calculations', () => {
      const context = new Context()
      
      // Add a regular message with tokens
      const regularMessage: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 5, output: 10, total: 15 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      context.addMessage(regularMessage)
      
      // Add a tool result (should not contribute to token count)
      context.addToolResult('tool-123', 'tool response')
      
      // Token usage should only include the regular message
      expect(context.getTokenUsage()).toEqual({ input: 5, output: 10, total: 15 })
      
      // Should have 2 messages total
      expect(context.getMessages()).toHaveLength(2)
    })

    it('should exclude tool result messages from cost calculations', () => {
      const context = new Context()
      
      // Add a regular message with cost
      const costlyMessage: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 1000, output: 1000, total: 2000 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      context.addMessage(costlyMessage)
      
      const costAfterRegular = context.getTotalCost()
      expect(costAfterRegular).toBeGreaterThan(0)
      
      // Add tool results (should not affect cost)
      context.addToolResult('tool-1', 'result 1')
      context.addToolResult('tool-2', 'result 2')
      
      // Cost should remain the same
      expect(context.getTotalCost()).toBe(costAfterRegular)
      
      // Provider and model cost breakdowns should also exclude tool results
      const costByProvider = context.getCostByProvider()
      const costByModel = context.getCostByModel()
      
      expect(costByProvider['anthropic']).toBe(costAfterRegular)
      expect(costByModel['claude-3-5-sonnet-20241022']).toBe(costAfterRegular)
      
      // Should have 3 messages total (1 regular + 2 tool results)
      expect(context.getMessages()).toHaveLength(3)
    })

    it('should exclude tool result messages from token tracking by provider/model', () => {
      const context = new Context()
      
      // Add regular messages
      const message1: Message = {
        role: 'assistant',
        content: 'Hello',
        tokens: { input: 10, output: 20, total: 30 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }
      
      const message2: Message = {
        role: 'assistant',
        content: 'Hi',
        tokens: { input: 5, output: 8, total: 13 },
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: new Date()
      }
      
      context.addMessage(message1)
      context.addMessage(message2)
      
      // Add tool results
      context.addToolResult('tool-1', 'result from tool 1')
      context.addToolResult('tool-2', { data: 'result from tool 2' })
      
      // Token tracking should only include regular messages
      const tokensByProvider = context.getTokensByProvider()
      expect(tokensByProvider['anthropic']).toEqual({ input: 10, output: 20, total: 30 })
      expect(tokensByProvider['openai']).toEqual({ input: 5, output: 8, total: 13 })
      
      const tokensByModel = context.getTokensByModel()
      expect(tokensByModel).toEqual({
        'claude-3-5-sonnet-20241022': { input: 10, output: 20, total: 30 },
        'gpt-4o': { input: 5, output: 8, total: 13 }
      })
    })
  })
})