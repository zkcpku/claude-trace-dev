import { describe, it, expect } from 'vitest'
import { Context } from '../src/context.js'
import type { Message } from '../src/types.js'

describe('Context', () => {
  it('should create empty context', () => {
    const context = new Context()
    expect(context.getMessages()).toHaveLength(0)
    expect(context.getTotalCost()).toBe(0)
    expect(context.getTokenUsage()).toEqual({ input: 0, output: 0 })
  })

  it('should add and retrieve messages', () => {
    const context = new Context()
    const message: Message = {
      role: 'user',
      content: 'Hello',
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
      timestamp: new Date()
    }

    const message2: Message = {
      role: 'assistant',
      content: 'Second message',
      timestamp: new Date(),
      usage: { input: 0, output: 0 },
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
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
      timestamp: new Date()
    }

    context.addMessage(message)
    expect(context.getMessages()).toHaveLength(1)

    context.clear()
    expect(context.getMessages()).toHaveLength(0)
    expect(context.getTotalCost()).toBe(0)
    expect(context.getTokenUsage()).toEqual({ input: 0, output: 0 })
  })

  describe('token tracking', () => {
    it('should aggregate token usage across messages', () => {
      const context = new Context()

      const message1: Message = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      }

      const message2: Message = {
        role: 'assistant',
        content: 'Hi there!',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date(),
        usage: { input: 5, output: 10 },
      }

      context.addMessage(message1)
      context.addMessage(message2)

      expect(context.getTokenUsage()).toEqual({ input: 5, output: 10 })
    })

    it('should track tokens by provider', () => {
      const context = new Context()

      const anthropicMessage: Message = {
        role: 'assistant',
        content: 'Hello from Claude',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date(),
        usage: { input: 15, output: 10 },
      }

      const openaiMessage: Message = {
        role: 'assistant',
        content: 'Hello from GPT',
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: new Date(),
        usage: { input: 15, output: 10 },
      }

      context.addMessage(anthropicMessage)
      context.addMessage(openaiMessage)

      const tokensByProvider = context.getTokensByProvider()
      expect(tokensByProvider).toEqual({
        anthropic: { input: 15, output: 10 },
        openai: { input: 15, output: 10 }
      })
    })

    it('should track tokens by model', () => {
      const context = new Context()

      const sonnetMessage: Message = {
        role: 'assistant',
        content: 'Hello from Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date(),
        usage: { input: 15, output: 10 },
      }

      const haikuMessage: Message = {
        role: 'assistant',
        content: 'Hello from Haiku',
        usage: { input: 8, output: 10 },
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        timestamp: new Date()
      }

      context.addMessage(sonnetMessage)
      context.addMessage(haikuMessage)

      const tokensByModel = context.getTokensByModel()
      expect(tokensByModel).toEqual({
        'claude-3-5-sonnet-20241022': { input: 15, output: 10 },
        'claude-3-5-haiku-20241022': { input: 8, output: 10 }
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
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date(),
        usage: { input: 0, output: 2000 },
      }

      context.addMessage(message)

      // Expected cost: assistant message with 2000 output tokens: (2000 * 15) / 1_000_000 = 0.03
      expect(context.getTotalCost()).toBeCloseTo(0.03, 5)
    })

    it('should return zero cost for unknown models', () => {
      const context = new Context()

      const message: Message = {
        role: 'assistant',
        content: 'Hello',
        provider: 'local',
        model: 'unknown-model',
        timestamp: new Date(),
        usage: { input: 0, output: 2000 },
      }

      context.addMessage(message)
      expect(context.getTotalCost()).toBe(0)
    })

    it('should track costs by provider', () => {
      const context = new Context()

      const anthropicMessage: Message = {
        role: 'assistant',
        content: 'Hello from Claude',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date(),
        usage: { input: 0, output: 1000 },
      }

      const openaiMessage: Message = {
        role: 'assistant',
        content: 'Hello from GPT',
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: new Date(),
        usage: { input: 0, output: 1000 },
      }

      context.addMessage(anthropicMessage)
      context.addMessage(openaiMessage)

      const costsByProvider = context.getCostByProvider()

      // Claude: assistant message with 1000 output tokens: (1000 * 15) / 1_000_000 = 0.015
      // GPT-4o: assistant message with 1000 output tokens: (1000 * 10) / 1_000_000 = 0.01
      expect(costsByProvider['anthropic']).toBeCloseTo(0.015, 5)
      expect(costsByProvider['openai']).toBeCloseTo(0.01, 5)
    })

    it('should track costs by model', () => {
      const context = new Context()

      const sonnetMessage: Message = {
        role: 'assistant',
        content: 'Hello from Sonnet',
        usage: { input: 0, output: 1000 },
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: new Date()
      }

      const haikuMessage: Message = {
        role: 'assistant',
        content: 'Hello from Haiku',
        usage: { input: 0, output: 1000 },
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        timestamp: new Date()
      }

      context.addMessage(sonnetMessage)
      context.addMessage(haikuMessage)

      const costsByModel = context.getCostByModel()

      // Sonnet: assistant message with 1000 output tokens: (1000 * 15) / 1_000_000 = 0.015
      // Haiku: assistant message with 1000 output tokens: (1000 * 4) / 1_000_000 = 0.004
      expect(costsByModel['claude-3-5-sonnet-20241022']).toBeCloseTo(0.015, 5)
      expect(costsByModel['claude-3-5-haiku-20241022']).toBeCloseTo(0.004, 5)
    })

    it('should handle models without pricing', () => {
      const context = new Context()

      const message: Message = {
        role: 'assistant',
        content: 'Hello',
        provider: 'openai',
        model: 'text-moderation-latest', // This model has pricing: null
        timestamp: new Date(),
        usage: { input: 0, output: 0 },
      }

      context.addMessage(message)
      expect(context.getTotalCost()).toBe(0)
    })
  })
})