import { describe, it, expect, beforeEach } from 'vitest'
import { AnthropicClient } from '../../src/clients/anthropic.js'
import { Context } from '../../src/context.js'
import { defineTool } from '../../src/tools/index.js'
import { z } from 'zod'
import type { AnthropicConfig, Message } from '../../src/types.js'

describe('AnthropicClient', () => {
  let client: AnthropicClient
  let context: Context
  
  const testConfig: AnthropicConfig = {
    apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
    model: 'claude-3-5-sonnet-20241022'
  }

  beforeEach(() => {
    client = new AnthropicClient(testConfig)
    context = new Context()
  })

  describe('constructor', () => {
    it('should create client with required config', () => {
      expect(client).toBeInstanceOf(AnthropicClient)
    })

    it('should create client with optional config', () => {
      const configWithOptions: AnthropicConfig = {
        ...testConfig,
        baseURL: 'https://api.anthropic.com',
        maxRetries: 5
      }
      
      const customClient = new AnthropicClient(configWithOptions)
      expect(customClient).toBeInstanceOf(AnthropicClient)
    })
  })

  describe('ask method', () => {
    it('should handle successful text response', async () => {
      const result = await client.ask('Say "Hello world" and nothing else.', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.response.content).toContain('Hello world')
        expect(result.response.tokens.input).toBeGreaterThan(0)
        expect(result.response.tokens.output).toBeGreaterThan(0)
        expect(result.response.tokens.total).toBe(result.response.tokens.input + result.response.tokens.output)
        expect(result.response.stopReason).toBe('complete')
        expect(result.response.cost).toBeGreaterThan(0)
        expect(result.response.truncated).toBe(false)
      }
    }, 10000)

    it('should handle tool calls', async () => {
      // Add a simple tool to context
      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Perform basic arithmetic calculations',
        schema: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        }),
        execute: async (args) => {
          switch (args.operation) {
            case 'add': return args.a + args.b
            case 'subtract': return args.a - args.b
            case 'multiply': return args.a * args.b
            case 'divide': return args.a / args.b
            default: throw new Error('Invalid operation')
          }
        }
      })
      
      context.addTool(calculatorTool)
      
      const result = await client.ask('Calculate 15 + 27 using the calculator tool.', { context })
      
      expect(result.type).toBe('tool_call')
      if (result.type === 'tool_call') {
        expect(result.toolCalls).toHaveLength(1)
        expect(result.toolCalls[0]?.name).toBe('calculator')
        expect(result.toolCalls[0]?.arguments).toMatchObject({
          operation: 'add',
          a: 15,
          b: 27
        })
      }
    }, 15000)

    it('should handle streaming with onChunk callback', async () => {
      const chunks: string[] = []
      const onChunk = (chunk: string) => chunks.push(chunk)
      
      const result = await client.ask('Count from 1 to 5, each number on a new line.', { 
        context, 
        onChunk 
      })
      
      expect(result.type).toBe('success')
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.join('')).toBe(result.type === 'success' ? result.response.content : '')
    }, 10000)

    it('should add messages to context', async () => {
      const initialCount = context.getMessages().length
      
      const result = await client.ask('Say "test response"', { context })
      
      expect(result.type).toBe('success')
      expect(context.getMessages().length).toBe(initialCount + 1)
      
      const lastMessage = context.getMessages()[context.getMessages().length - 1]
      expect(lastMessage?.role).toBe('assistant')
      if (lastMessage?.role === 'assistant') {
        expect(lastMessage.provider).toBe('anthropic')
        expect(lastMessage.model).toBe(testConfig.model)
        expect(lastMessage.timestamp).toBeInstanceOf(Date)
      }
    }, 10000)

    it('should maintain conversation context', async () => {
      // First message
      const result1 = await client.ask('Remember this number: 42', { context })
      expect(result1.type).toBe('success')
      
      // Second message referencing the first
      const result2 = await client.ask('What number did I just tell you to remember?', { context })
      expect(result2.type).toBe('success')
      
      if (result2.type === 'success') {
        expect(result2.response.content).toContain('42')
      }
      
      // Should have 2 assistant messages now
      const assistantMessages = context.getMessages().filter(m => m.role === 'assistant')
      expect(assistantMessages).toHaveLength(2)
    }, 20000)

    it('should handle invalid API key gracefully', async () => {
      const invalidClient = new AnthropicClient({
        apiKey: 'invalid-key',
        model: 'claude-3-5-sonnet-20241022'
      })
      
      const result = await invalidClient.ask('Hello', { context })
      
      expect(result.type).toBe('model_error')
      if (result.type === 'model_error') {
        expect(result.error.type).toBe('auth')
        expect(result.error.retryable).toBe(false)
      }
    }, 10000)

    it('should calculate cost correctly using model pricing', async () => {
      const result = await client.ask('Say "cost test"', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        // Cost should be calculated based on token usage and model pricing
        expect(result.response.cost).toBeGreaterThan(0)
        
        // Verify cost calculation makes sense
        const { tokens } = result.response
        const expectedMinCost = (tokens.input * 3 / 1_000_000) + (tokens.output * 15 / 1_000_000)
        expect(result.response.cost).toBeCloseTo(expectedMinCost, 6)
      }
    }, 10000)

    it('should handle tools with zero arguments', async () => {
      // Add a tool with no parameters
      const pingTool = defineTool({
        name: 'ping',
        description: 'Simple ping tool with no parameters',
        schema: z.object({}),
        execute: async () => 'pong'
      })
      
      context.addTool(pingTool)
      
      const result = await client.ask('Use the ping tool to test connectivity.', { context })
      
      if (result.type === 'tool_call') {
        expect(result.toolCalls).toHaveLength(1)
        expect(result.toolCalls[0]?.name).toBe('ping')
        expect(result.toolCalls[0]?.arguments).toEqual({})
      } else {
        // Sometimes the model might respond without using the tool
        expect(result.type).toBe('success')
      }
    }, 10000)

    it('should handle multiple tools in context', async () => {
      // Add multiple tools
      const mathTool = defineTool({
        name: 'math',
        description: 'Basic math operations',
        schema: z.object({
          expression: z.string().describe('Math expression to evaluate')
        }),
        execute: async (args) => `Result: ${eval(args.expression)}`
      })
      
      const timeTool = defineTool({
        name: 'current_time',
        description: 'Get current time',
        schema: z.object({}),
        execute: async () => new Date().toISOString()
      })
      
      context.addTool(mathTool)
      context.addTool(timeTool)
      
      const tools = context.listTools()
      expect(tools).toHaveLength(2)
      expect(tools.map(t => t.name)).toContain('math')
      expect(tools.map(t => t.name)).toContain('current_time')
      
      // Test that the client can see and potentially use these tools
      const result = await client.ask('I have math and time tools available. Just say "tools ready".', { context })
      expect(result.type).toBe('success')
    }, 10000)

    it('should handle multiple tool calls with correct ID matching', async () => {
      // Add a simple ping tool that we can call multiple times
      const pingTool = defineTool({
        name: 'ping',
        description: 'Ping a server to test connectivity',
        schema: z.object({
          server: z.string().optional().describe('Server to ping (optional)')
        }),
        execute: async (args) => `pong${args.server ? ` from ${args.server}` : ''}`
      })
      
      context.addTool(pingTool)
      
      // Request multiple tool calls
      const result = await client.ask('Please ping the server twice - once without specifying a server, and once to "api.example.com"', { context })
      
      if (result.type === 'tool_call') {
        expect(result.toolCalls.length).toBeGreaterThanOrEqual(1)
        
        // Verify each tool call has a unique ID
        const toolCallIds = result.toolCalls.map(tc => tc.id)
        const uniqueIds = new Set(toolCallIds)
        expect(uniqueIds.size).toBe(toolCallIds.length) // All IDs should be unique
        
        // Execute all tool calls and add their results
        for (const toolCall of result.toolCalls) {
          const toolResult = await context.executeTool(toolCall)
          context.addToolResult(toolCall.id, toolResult)
        }
        
        // Continue the conversation - this should work without tool_use_id errors
        const continueResult = await client.ask('Continue with the conversation', { context })
        
        // Should not get a tool_use_id error
        expect(continueResult.type).toBe('success')
        if (continueResult.type === 'success') {
          // Response should acknowledge the ping results
          expect(continueResult.response.content.toLowerCase()).toMatch(/ping|pong|server/i)
        }
        
        // Verify context contains the proper message sequence
        const messages = context.getMessages()
        
        // Should have: original user message, assistant message with tool calls, tool result messages, final assistant message
        expect(messages.length).toBeGreaterThanOrEqual(3)
        
        // Find the assistant message with tool calls
        const assistantWithToolCalls = messages.find(m => 
          m.role === 'assistant' && 
          'toolCalls' in m && 
          Array.isArray((m as any).toolCalls)
        ) as any
        
        expect(assistantWithToolCalls).toBeDefined()
        expect(assistantWithToolCalls.toolCalls).toHaveLength(result.toolCalls.length)
        
        // Verify tool result messages reference correct IDs
        const toolResultMessages = messages.filter(m => m.role === 'tool_result')
        expect(toolResultMessages.length).toBe(result.toolCalls.length)
        
        for (const toolResult of toolResultMessages) {
          const matchingToolCall = result.toolCalls.find(tc => tc.id === toolResult.tool_call_id)
          expect(matchingToolCall).toBeDefined()
        }
        
      } else if (result.type === 'success') {
        // Sometimes the model might respond without using tools
        console.log('Model responded without using tools - this is acceptable behavior')
      } else {
        throw new Error(`Unexpected result type: ${result.type}`)
      }
    }, 20000)

    it('should handle thinking request on non-thinking model gracefully', async () => {
      // Test with Claude 3.5 Sonnet (current testConfig model) which doesn't support thinking
      const nonThinkingClient = new AnthropicClient({
        ...testConfig, // Uses claude-3-5-sonnet-20241022 which doesn't support thinking
        thinking: {
          enabled: true,
          budgetTokens: 2000
        }
      })
      
      const result = await nonThinkingClient.ask(
        'What is 15 * 23?',
        { context }
      )
      
      // Should get a model error indicating thinking is not supported
      expect(result.type).toBe('model_error')
      if (result.type === 'model_error') {
        expect(result.error.type).toBe('invalid_request')
        expect(result.error.message).toContain('does not support thinking')
        console.log('✓ Correctly rejected thinking request for non-thinking model')
      }
    }, 10000)

    it('should handle extended thinking on supported model', async () => {
      // Test with Claude Sonnet 4.0 which supports thinking
      const sonnet4Client = new AnthropicClient({
        apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
        model: 'claude-sonnet-4-20250514', // Claude Sonnet 4 with thinking support
        thinking: {
          enabled: true,
          budgetTokens: 2000
        }
      })
      
      const thinkingChunks: string[] = []
      const onThinkingChunk = (chunk: string) => thinkingChunks.push(chunk)
      
      const result = await sonnet4Client.ask(
        'Solve this step by step: What is 127 * 83? Show your reasoning.',
        { 
          context,
          onThinkingChunk
        }
      )
      
      if (result.type === 'model_error') {
        // Handle various expected scenarios for thinking-capable models
        if (result.error.message.includes('does not support thinking')) {
          console.log('⚠️  Model does not support thinking - test validates error handling')
          expect(result.error.type).toBe('invalid_request')
          return
        } else if (result.error.message.includes('model: claude-sonnet-4')) {
          console.log('⚠️  Sonnet 4.0 model not accessible with current API key - may require special access')
          expect(result.error.type).toBe('invalid_request')
          return
        } else {
          // Unexpected error - fail the test
          throw new Error(`Unexpected error: ${result.error.message}`)
        }
      }
      
      // If thinking is supported, validate the full functionality
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        // Should have regular content
        expect(result.response.content.length).toBeGreaterThan(0)
        
        // When thinking is supported and enabled, should have thinking content
        if (result.response.thinking) {
          expect(result.response.thinking.length).toBeGreaterThan(0)
          // Thinking should contain reasoning steps
          expect(result.response.thinking.toLowerCase()).toMatch(/step|think|reason|calculate|multiply/i)
          console.log('✓ Thinking content captured:', result.response.thinking.substring(0, 100) + '...')
        }
        
        // Should have received thinking chunks during streaming if thinking was used
        if (thinkingChunks.length > 0) {
          expect(thinkingChunks.join('')).toBe(result.response.thinking || '')
          console.log('✓ Thinking chunks streamed correctly')
        }
        
        // Token counts should include thinking tokens
        expect(result.response.tokens.output).toBeGreaterThan(0)
        expect(result.response.cost).toBeGreaterThan(0)
        
        console.log('✓ Extended thinking test completed successfully with thinking-capable model')
      }
    }, 20000)

    it('should handle thinking with tool calls', async () => {
      // Test Claude Sonnet 4 with thinking enabled and tools available
      const sonnet4Client = new AnthropicClient({
        apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
        model: 'claude-sonnet-4-20250514',
        thinking: {
          enabled: true,
          budgetTokens: 3000 // More budget for complex reasoning with tools
        }
      })

      // Add a calculator tool
      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Perform arithmetic calculations',
        schema: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        }),
        execute: async (args) => {
          const { operation, a, b } = args
          switch (operation) {
            case 'add': return a + b
            case 'subtract': return a - b
            case 'multiply': return a * b
            case 'divide': return b !== 0 ? a / b : 'Error: Division by zero'
            default: return 'Error: Invalid operation'
          }
        }
      })

      // Add a compound interest tool
      const compoundInterestTool = defineTool({
        name: 'compound_interest',
        description: 'Calculate compound interest',
        schema: z.object({
          principal: z.number().describe('Initial amount'),
          rate: z.number().describe('Annual interest rate (as decimal)'),
          time: z.number().describe('Time in years'),
          compound_frequency: z.number().describe('Times compounded per year')
        }),
        execute: async (args) => {
          const { principal, rate, time, compound_frequency } = args
          const amount = principal * Math.pow(1 + rate/compound_frequency, compound_frequency * time)
          return {
            final_amount: Math.round(amount * 100) / 100,
            interest_earned: Math.round((amount - principal) * 100) / 100
          }
        }
      })

      context.addTool(calculatorTool)
      context.addTool(compoundInterestTool)

      const thinkingChunks: string[] = []
      const onThinkingChunk = (chunk: string) => thinkingChunks.push(chunk)

      const result = await sonnet4Client.ask(
        'I have $1000 to invest. If I can get 5% annual interest compounded monthly, how much will I have after 2 years? Then calculate what percentage increase that represents.',
        { 
          context,
          onThinkingChunk
        }
      )

      if (result.type === 'model_error') {
        // Handle model access issues
        if (result.error.message.includes('model: claude-sonnet-4') || 
            result.error.message.includes('does not support thinking')) {
          console.log('⚠️  Sonnet 4.0 not accessible or thinking not supported - skipping thinking+tools test')
          return
        } else {
          throw new Error(`Unexpected error: ${result.error.message}`)
        }
      }

      // Should request tool calls for compound interest calculation
      expect(result.type).toBe('tool_call')
      if (result.type === 'tool_call') {
        expect(result.toolCalls.length).toBeGreaterThan(0)
        
        // Should use compound_interest tool for the main calculation
        const compoundCall = result.toolCalls.find(call => call.name === 'compound_interest')
        expect(compoundCall).toBeDefined()
        expect(compoundCall?.arguments).toMatchObject({
          principal: 1000,
          rate: 0.05,
          time: 2,
          compound_frequency: 12
        })

        // Execute the compound interest tool
        const compoundResult = await context.executeTool(compoundCall!)
        console.log('✓ Compound interest calculated:', compoundResult)

        // Add tool result to context and continue
        context.addToolResult(compoundCall!.id, compoundResult)

        // Continue conversation to get percentage calculation
        const finalResult = await sonnet4Client.ask('Continue with the percentage calculation.', { 
          context,
          onThinkingChunk 
        })

        if (finalResult.type === 'tool_call') {
          // Might use calculator for percentage calculation
          const calcCall = finalResult.toolCalls.find(call => call.name === 'calculator')
          if (calcCall) {
            console.log('✓ Calculator tool call for percentage:', calcCall.arguments)
          }
        } else if (finalResult.type === 'success') {
          console.log('✓ Final response with calculation:', finalResult.response.content.substring(0, 100) + '...')
        }

        // Validate thinking content was captured
        if (thinkingChunks.length > 0) {
          const fullThinking = thinkingChunks.join('')
          expect(fullThinking.toLowerCase()).toMatch(/tool|calculate|compound|interest|percentage/i)
          console.log('✓ Thinking captured tool reasoning:', fullThinking.substring(0, 150) + '...')
        }
      }
    }, 30000)
  })

  describe('message conversion', () => {
    it('should convert context messages correctly in multi-turn conversation', async () => {
      // Add a user message manually to test conversion
      const userMessage: Message = {
        role: 'user',
        content: 'My name is Alice',
        tokens: { input: 5, output: 0, total: 5 },
        provider: 'user',
        model: 'none',
        timestamp: new Date()
      }
      context.addMessage(userMessage)
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: 'Nice to meet you, Alice!',
        tokens: { input: 0, output: 8, total: 8 },
        provider: 'anthropic',
        model: testConfig.model,
        timestamp: new Date()
      }
      context.addMessage(assistantMessage)
      
      const result = await client.ask('What is my name?', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.response.content.toLowerCase()).toContain('alice')
      }
    }, 15000)
  })

  describe('error handling', () => {
    it('should handle invalid model name', async () => {
      const invalidModelClient = new AnthropicClient({
        apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
        model: 'invalid-model-name'
      })
      
      const result = await invalidModelClient.ask('Hello', { context })
      
      expect(result.type).toBe('model_error')
      if (result.type === 'model_error') {
        expect(result.error.type).toBe('invalid_request')
      }
    }, 10000)
  })

  describe('cost tracking integration', () => {
    it('should track costs in context across multiple requests', async () => {
      const initialCost = context.getTotalCost()
      
      await client.ask('First message', { context })
      const costAfterFirst = context.getTotalCost()
      expect(costAfterFirst).toBeGreaterThan(initialCost)
      
      await client.ask('Second message', { context })
      const costAfterSecond = context.getTotalCost()
      expect(costAfterSecond).toBeGreaterThan(costAfterFirst)
      
      // Verify cost breakdown by provider
      const costByProvider = context.getCostByProvider()
      expect(costByProvider['anthropic']).toBeGreaterThan(0)
      
      // Verify cost breakdown by model
      const costByModel = context.getCostByModel()
      expect(costByModel[testConfig.model]).toBeGreaterThan(0)
    }, 20000)
  })
})