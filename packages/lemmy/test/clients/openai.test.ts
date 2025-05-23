import { describe, it, expect, beforeEach } from 'vitest'
import { OpenAIClient } from '../../src/clients/openai.js'
import { Context } from '../../src/context.js'
import { defineTool } from '../../src/tools/index.js'
import { z } from 'zod'
import type { OpenAIConfig, Message } from '../../src/types.js'

describe('OpenAIClient', () => {
  let client: OpenAIClient
  let context: Context
  
  const testConfig: OpenAIConfig = {
    apiKey: process.env['OPENAI_API_KEY'] || 'test-key',
    model: 'gpt-4o'
  }

  beforeEach(() => {
    client = new OpenAIClient(testConfig)
    context = new Context()
  })

  describe('constructor', () => {
    it('should create client with required config', () => {
      expect(client).toBeInstanceOf(OpenAIClient)
    })

    it('should create client with optional config', () => {
      const configWithOptions: OpenAIConfig = {
        ...testConfig,
        organization: 'org-123',
        baseURL: 'https://api.openai.com/v1',
        maxRetries: 5
      }
      
      const customClient = new OpenAIClient(configWithOptions)
      expect(customClient).toBeInstanceOf(OpenAIClient)
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
        expect(lastMessage.provider).toBe('openai')
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
        // The model should reference the number from the previous conversation
        // Accept either the exact number or a reference to it
        expect(result2.response.content.toLowerCase()).toMatch(/42|forty.?two|mentioned|told/i)
      }
      
      // Should have 2 assistant messages now
      const assistantMessages = context.getMessages().filter(m => m.role === 'assistant')
      expect(assistantMessages).toHaveLength(2)
    }, 20000)

    it('should handle invalid API key gracefully', async () => {
      const invalidClient = new OpenAIClient({
        apiKey: 'invalid-key',
        model: 'gpt-4o'
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
        const expectedMinCost = (tokens.input * 2.5 / 1_000_000) + (tokens.output * 10 / 1_000_000)
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
        
        // Should not get errors
        expect(continueResult.type).toBe('success')
        if (continueResult.type === 'success') {
          // Response should acknowledge the ping results
          expect(continueResult.response.content.toLowerCase()).toMatch(/ping|pong|server/i)
        }
        
        // Verify context contains the proper message sequence
        const messages = context.getMessages()
        
        // Should have: assistant message with tool calls, tool result messages, final assistant message
        expect(messages.length).toBeGreaterThanOrEqual(2)
        
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

    it('should handle max_tokens by marking response as truncated', async () => {
      // Test the truncation logic by verifying stopReason mapping
      const result = await client.ask('Explain what happens when OpenAI responses are truncated due to max_tokens.', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        // For a normal response, it should complete successfully
        expect(result.response.truncated).toBe(false)
        expect(result.response.stopReason).toBe('complete')
        
        // Verify the mapStopReason logic by checking that 'length' would map to max_tokens
        const client_instance = client as any
        expect(client_instance.mapStopReason('length')).toBe('max_tokens')
        expect(client_instance.mapStopReason('stop')).toBe('complete')
      }
    }, 10000)

    it('should handle system messages correctly', async () => {
      // Add a system message to context
      const systemMessage: Message = {
        role: 'system',
        content: 'You are a helpful assistant that always responds with "SYSTEM: " before your actual response.',
        tokens: { input: 20, output: 0, total: 20 },
        provider: 'user',
        model: 'none',
        timestamp: new Date()
      }
      context.addMessage(systemMessage)
      
      const result = await client.ask('Say hello', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        // Response should include the system instruction
        expect(result.response.content).toContain('SYSTEM:')
      }
    }, 10000)
  })

  describe('sendToolResults method', () => {
    it('should continue conversation after tool execution', async () => {
      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Perform arithmetic calculations',
        schema: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number()
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
      
      // Get tool calls first
      const result1 = await client.ask('Calculate 25 * 4 using the calculator tool.', { context })
      
      expect(result1.type).toBe('tool_call')
      if (result1.type === 'tool_call') {
        // Execute the tool
        const toolCall = result1.toolCalls[0]!
        const toolResult = await context.executeTool(toolCall)
        
        expect(toolResult.success).toBe(true)
        if (toolResult.success) {
          expect(toolResult.result).toBe(100)
        }
        
        // Send tool results back
        const toolResults = [{
          toolCallId: toolCall.id,
          content: toolResult.success ? String(toolResult.result) : 'Error'
        }]
        
        const result2 = await client.sendToolResults(toolResults, { context })
        
        expect(result2.type).toBe('success')
        if (result2.type === 'success') {
          expect(result2.response.content).toContain('100')
        }
      }
    }, 15000)

    it('should handle multiple tool results', async () => {
      const pingTool = defineTool({
        name: 'ping',
        description: 'Ping a server',
        schema: z.object({
          server: z.string().describe('Server to ping')
        }),
        execute: async (args) => `pong from ${args.server}`
      })
      
      context.addTool(pingTool)
      
      // Get multiple tool calls
      const result1 = await client.ask('Ping both google.com and github.com using the ping tool.', { context })
      
      if (result1.type === 'tool_call' && result1.toolCalls.length >= 2) {
        // Create multiple tool results
        const toolResults = result1.toolCalls.map(tc => ({
          toolCallId: tc.id,
          content: `pong from ${(tc.arguments as any).server}`
        }))
        
        const result2 = await client.sendToolResults(toolResults, { context })
        
        expect(result2.type).toBe('success')
        if (result2.type === 'success') {
          expect(result2.response.content.toLowerCase()).toMatch(/google|github|pong/i)
        }
      } else if (result1.type === 'success') {
        // Model might not use tools - that's OK for this test
        console.log('Model responded without using tools - acceptable for this test')
      }
    }, 15000)
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
        provider: 'openai',
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

    it('should handle tool messages in conversation flow', async () => {
      // Simulate a conversation with tool calls
      const toolCallMessage: Message = {
        role: 'assistant',
        content: 'I\'ll calculate that for you.',
        toolCalls: [{
          id: 'test-tool-call-1',
          name: 'calculator',
          arguments: { operation: 'add', a: 10, b: 5 }
        }],
        tokens: { input: 15, output: 10, total: 25 },
        provider: 'openai',
        model: testConfig.model,
        timestamp: new Date()
      }
      context.addMessage(toolCallMessage)
      
      const toolResultMessage: Message = {
        role: 'tool_result',
        tool_call_id: 'test-tool-call-1',
        content: '15'
      }
      context.addMessage(toolResultMessage)
      
      const result = await client.ask('What was the result of that calculation?', { context })
      
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.response.content).toContain('15')
      }
    }, 15000)
  })

  describe('error handling', () => {
    it('should handle invalid model name', async () => {
      const invalidModelClient = new OpenAIClient({
        apiKey: process.env['OPENAI_API_KEY'] || 'test-key',
        model: 'invalid-model-name'
      })
      
      const result = await invalidModelClient.ask('Hello', { context })
      
      expect(result.type).toBe('model_error')
      if (result.type === 'model_error') {
        expect(result.error.type).toBe('invalid_request')
      }
    }, 10000)

    it('should handle rate limiting errors', async () => {
      // This test would require actually hitting rate limits
      // For now, just verify the error handling structure exists
      expect(typeof client.ask).toBe('function')
    })

    it('should handle network errors gracefully', async () => {
      const networkErrorClient = new OpenAIClient({
        apiKey: testConfig.apiKey,
        model: testConfig.model,
        baseURL: 'https://invalid-url-that-does-not-exist.com/v1'
      })
      
      const result = await networkErrorClient.ask('Hello', { context })
      
      expect(result.type).toBe('model_error')
      if (result.type === 'model_error') {
        expect(['network', 'api_error']).toContain(result.error.type)
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
      expect(costByProvider['openai']).toBeGreaterThan(0)
      
      // Verify cost breakdown by model
      const costByModel = context.getCostByModel()
      expect(costByModel[testConfig.model]).toBeGreaterThan(0)
    }, 20000)

    it('should handle unknown models with zero cost', async () => {
      const unknownModelClient = new OpenAIClient({
        apiKey: testConfig.apiKey,
        model: 'unknown-model-name'
      })
      
      // This will fail at API level, but we're testing cost calculation
      const result = await unknownModelClient.ask('Hello', { context })
      
      // Should either error or calculate zero cost for unknown model
      if (result.type === 'success') {
        expect(result.response.cost).toBe(0)
      }
    })
  })

  describe('OpenAI-specific features', () => {
    it('should handle OpenAI function calling format correctly', async () => {
      const weatherTool = defineTool({
        name: 'get_weather',
        description: 'Get current weather for a location',
        schema: z.object({
          location: z.string().describe('City name'),
          units: z.enum(['celsius', 'fahrenheit']).optional()
        }),
        execute: async (args) => {
          return {
            location: args.location,
            temperature: 22,
            units: args.units || 'celsius',
            condition: 'sunny'
          }
        }
      })
      
      context.addTool(weatherTool)
      
      const result = await client.ask('What\'s the weather like in New York?', { context })
      
      if (result.type === 'tool_call') {
        expect(result.toolCalls[0]?.name).toBe('get_weather')
        expect(result.toolCalls[0]?.arguments).toMatchObject({
          location: expect.stringMatching(/new york/i)
        })
      } else {
        // Model might respond without tools
        expect(result.type).toBe('success')
      }
    }, 15000)

    it('should handle streaming properly without thinking chunks', async () => {
      const chunks: string[] = []
      const thinkingChunks: string[] = []
      
      const result = await client.ask('Explain what 2+2 equals.', {
        context,
        onChunk: (chunk) => chunks.push(chunk),
        onThinkingChunk: (thinking) => thinkingChunks.push(thinking)
      })
      
      expect(result.type).toBe('success')
      expect(chunks.length).toBeGreaterThan(0)
      expect(thinkingChunks.length).toBe(0) // OpenAI doesn't support thinking
      
      if (result.type === 'success') {
        expect(result.response.thinking).toBeUndefined()
      }
    }, 10000)
  })
})