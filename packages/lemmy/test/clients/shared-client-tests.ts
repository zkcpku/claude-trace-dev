import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '../../src/context.js'
import { defineTool } from '../../src/tools/index.js'
import { findModelData } from '../../src/models.js'
import { z } from 'zod'
import type { ChatClient, Message } from '../../src/types.js'

export function sharedClientTests(
  createClient: (withThinking?: boolean, apiKey?: string) => ChatClient
) {
  let client: ChatClient
  let context: Context

  beforeEach(() => {
    client = createClient()
    context = new Context()
  })

    describe('ask method', () => {
      it('should handle successful text response', async () => {
        const initialMessageCount = context.getMessages().length

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

          // Verify cost calculation uses model registry data
          const { tokens } = result.response
          const modelData = findModelData(client.getModel())
          expect(modelData).toBeDefined()
          expect(modelData?.pricing).toBeDefined()

          if (modelData?.pricing) {
            const expectedCost = (tokens.input * modelData.pricing.inputPerMillion / 1_000_000) +
                               (tokens.output * modelData.pricing.outputPerMillion / 1_000_000)
            expect(result.response.cost).toBeCloseTo(expectedCost, 6)
          }

          // Verify context was updated properly (user + assistant messages)
          expect(context.getMessages().length).toBe(initialMessageCount + 2)
          const assistantMessage = context.getMessages()[context.getMessages().length - 1]
          expect(assistantMessage?.role).toBe('assistant')
          expect(assistantMessage?.content).toBe(result.response.content)
          if (assistantMessage?.role === 'assistant') {
            expect(assistantMessage.provider).toBe(client.getProvider())
            expect(assistantMessage.model).toBe(client.getModel())
            expect(assistantMessage.tokens).toEqual(result.response.tokens)
            expect(assistantMessage.timestamp).toBeInstanceOf(Date)
          }
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
        const initialMessageCount = context.getMessages().length

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

          // Verify context was updated with user + assistant message containing tool calls
          expect(context.getMessages().length).toBe(initialMessageCount + 2)
          const assistantMessage = context.getMessages()[context.getMessages().length - 1]
          expect(assistantMessage?.role).toBe('assistant')
          if (assistantMessage?.role === 'assistant') {
            expect(assistantMessage.provider).toBe(client.getProvider())
            expect(assistantMessage.model).toBe(client.getModel())
            expect(assistantMessage.timestamp).toBeInstanceOf(Date)
            // Note: tool call messages may have different content structure
          }
        }
      }, 15000)

      it('should handle streaming with onChunk callback', async () => {
        const chunks: string[] = []
        const onChunk = (chunk: string) => chunks.push(chunk)
        const initialMessageCount = context.getMessages().length

        const result = await client.ask('Count from 1 to 5, each number on a new line.', {
          context,
          onChunk
        })

        expect(result.type).toBe('success')
        expect(chunks.length).toBeGreaterThan(0)
        expect(chunks.join('')).toBe(result.type === 'success' ? result.response.content : '')

        // Verify context was updated properly even with streaming (user + assistant messages)
        expect(context.getMessages().length).toBe(initialMessageCount + 2)
        const assistantMessage = context.getMessages()[context.getMessages().length - 1]
        expect(assistantMessage?.role).toBe('assistant')
        if (assistantMessage?.role === 'assistant') {
          expect(assistantMessage.provider).toBe(client.getProvider())
          expect(assistantMessage.model).toBe(client.getModel())
          if (result.type === 'success') {
            expect(assistantMessage.content).toBe(result.response.content)
          }
        }
      }, 10000)

      it('should add messages to context', async () => {
        const initialCount = context.getMessages().length

        const result = await client.ask('Say "test response"', { context })

        expect(result.type).toBe('success')
        expect(context.getMessages().length).toBe(initialCount + 2)

        const assistantMessage = context.getMessages()[context.getMessages().length - 1]
        expect(assistantMessage?.role).toBe('assistant')
        if (assistantMessage?.role === 'assistant') {
          expect(assistantMessage.provider).toBe(client.getProvider())
          expect(assistantMessage.model).toBe(client.getModel())
          expect(assistantMessage.timestamp).toBeInstanceOf(Date)
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
        // Create client with explicitly invalid API key
        const invalidClient = createClient(false, 'invalid-api-key-12345')
        
        const result = await invalidClient.ask('Hello', { context })

        expect(result.type).toBe('model_error')
        if (result.type === 'model_error') {
          expect(result.error.type).toBe('auth')
          expect(result.error.retryable).toBe(false)
        }
      }, 10000)

      it('should calculate cost correctly using model pricing', async () => {
        const initialMessageCount = context.getMessages().length
        const initialCost = context.getTotalCost()

        const result = await client.ask('Say "cost test"', { context })

        expect(result.type).toBe('success')
        if (result.type === 'success') {
          // Cost should be calculated based on token usage and model pricing
          expect(result.response.cost).toBeGreaterThan(0)

          // Verify cost calculation uses model registry data
          const { tokens } = result.response
          const modelData = findModelData(client.getModel())
          expect(modelData).toBeDefined()
          expect(modelData?.pricing).toBeDefined()

          if (modelData?.pricing) {
            const expectedCost = (tokens.input * modelData.pricing.inputPerMillion / 1_000_000) +
                               (tokens.output * modelData.pricing.outputPerMillion / 1_000_000)
            expect(result.response.cost).toBeCloseTo(expectedCost, 6)
          }

          // Verify context was updated and cost tracking works (user + assistant messages)
          expect(context.getMessages().length).toBe(initialMessageCount + 2)
          expect(context.getTotalCost()).toBeCloseTo(initialCost + result.response.cost, 6)
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
          // Model might make 1 or more calls to the ping tool
          expect(result.toolCalls.length).toBeGreaterThanOrEqual(1)
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
        const result = await client.ask('Use the ping tool to ping the server twice', { context })

        // Models may respond directly instead of using tools, so be flexible
        if (result.type === 'success') {
          console.log('⚠️  Model responded directly without using tools - skipping multiple tool calls test')
          return
        }
        
        expect(result.type).toBe('tool_call')
        if (result.type === 'tool_call') {
          // Model might make 1 or 2 calls - both are valid
          expect(result.toolCalls.length).toBeGreaterThanOrEqual(1)
          expect(result.toolCalls.length).toBeLessThanOrEqual(2)

          // Verify each tool call has a unique ID
          const toolCallIds = result.toolCalls.map(tc => tc.id)
          const uniqueIds = new Set(toolCallIds)
          expect(uniqueIds.size).toBe(toolCallIds.length) // All IDs should be unique

          // Execute all tool calls and add their results
          for (const toolCall of result.toolCalls) {
            const toolResult = await context.executeTool(toolCall)
            console.log(`Executed tool ${toolCall.name} with args:`, toolCall.arguments, 'result:', toolResult)
            context.addToolResult(toolCall.id, toolResult)
          }

          // Continue the conversation - the model might need to complete the second ping
          const continueResult = await client.ask('Here are the results of the ping operations. Say "done".', { context })

          // Model might respond with success or make another tool call
          expect(['success', 'tool_call']).toContain(continueResult.type)
          if (continueResult.type === 'success') {
            expect(continueResult.response.content.toLowerCase()).toMatch(/done/i)
          }

          // Verify context contains the proper message sequence
          const messages = context.getMessages()

          // Message count depends on how many tool calls were made and model behavior
          const minExpectedMessages = 4 + result.toolCalls.length // user + assistant + N tool results + user + (assistant or more)
          expect(messages.length).toBeGreaterThanOrEqual(minExpectedMessages)

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
        }
      }, 20000)

      it('should handle multiple tool calls with sendToolResults', async () => {
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
        const result = await client.ask('Use the ping tool to ping the server twice', { context })

        // Models may respond directly instead of using tools, so be flexible
        if (result.type === 'success') {
          console.log('⚠️  Model responded directly without using tools - skipping sendToolResults multiple calls test')
          return
        }
        
        expect(result.type).toBe('tool_call')
        if (result.type === 'tool_call') {
          // Handle case where model might only make 1 call initially
          if (result.toolCalls.length === 1) {
            // Execute first call and ask for another to get 2 total calls
            const firstToolResult = await context.executeTool(result.toolCalls[0]!)
            const toolResults = [{
              toolCallId: result.toolCalls[0]!.id,
              content: String(firstToolResult.success ? firstToolResult.result : `Error: ${firstToolResult.error?.message}`)
            }]
            
            // Send first result and ask for another ping
            const continueResult = await client.sendToolResults(toolResults, { context })
            // Model might respond with success or make another tool call
            expect(['success', 'tool_call']).toContain(continueResult.type)
            
            // Request second ping
            const secondResult = await client.ask('Now ping one more time to complete the second ping.', { context })
            // Model might make tool call, respond with success, or error - all valid
            expect(['success', 'tool_call', 'model_error']).toContain(secondResult.type)
            if (secondResult.type === 'tool_call') {
              expect(secondResult.toolCalls.length).toBe(1)
              
              // Execute second call
              const secondToolResult = await context.executeTool(secondResult.toolCalls[0]!)
              const finalToolResults = [{
                toolCallId: secondResult.toolCalls[0]!.id,
                content: String(secondToolResult.success ? secondToolResult.result : `Error: ${secondToolResult.error?.message}`)
              }]
              
              // Send final result
              const finalResult = await client.sendToolResults(finalToolResults, { context })
              expect(finalResult.type).toBe('success')
              
              // Verify the message structure - should have multiple messages with tool results
              const messages = context.getMessages()
              expect(messages.length).toBeGreaterThanOrEqual(6)
              
              // Verify tool result messages exist and have correct IDs
              const toolResultMessages = messages.filter(m => m.role === 'tool_result')
              expect(toolResultMessages.length).toBe(2)
              expect(toolResultMessages[0]?.tool_call_id).toBe(result.toolCalls[0]!.id)
              expect(toolResultMessages[1]?.tool_call_id).toBe(secondResult.toolCalls[0]!.id)
            }
            return
          }
          
          // If we got 2 calls initially, continue with original logic
          expect(result.toolCalls.length).toBe(2)

          // Verify each tool call has a unique ID
          const toolCallIds = result.toolCalls.map(tc => tc.id)
          const uniqueIds = new Set(toolCallIds)
          expect(uniqueIds.size).toBe(toolCallIds.length) // All IDs should be unique

          // Execute all tool calls
          const toolResults = []
          for (const toolCall of result.toolCalls) {
            const toolResult = await context.executeTool(toolCall)
            console.log(`Executed tool ${toolCall.name} with args:`, toolCall.arguments, 'result:', toolResult)
            toolResults.push({
              toolCallId: toolCall.id,
              content: String(toolResult.success ? toolResult.result : `Error: ${toolResult.error?.message}`)
            })
          }

          const messageCountBeforeSend = context.getMessages().length
          
          // Use sendToolResults to continue the conversation
          const finalResult = await client.sendToolResults(toolResults, { context })

          expect(finalResult.type).toBe('success')
          if (finalResult.type === 'success') {
            expect(finalResult.response.content.length).toBeGreaterThan(0)
          }

          // Verify context contains the proper message sequence
          const messages = context.getMessages()

          // Should have: original user message, assistant message with tool calls, 2 tool result messages, final assistant message
          expect(messages.length).toBe(5)

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

          // Verify sendToolResults added the correct number of messages
          // Should add: 2 tool result messages + 1 assistant message = +3 total
          expect(context.getMessages().length).toBe(messageCountBeforeSend + 3)
        }
      }, 20000)

      it('should handle sendToolResults correctly', async () => {
        // First make a tool call
        const calculatorTool = defineTool({
          name: 'calculator',
          description: 'Perform basic arithmetic',
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

        // Make initial tool call
        const toolCallResult = await client.ask('Calculate 10 + 5 using the calculator', { context })
        expect(toolCallResult.type).toBe('tool_call')

        if (toolCallResult.type === 'tool_call') {
          expect(toolCallResult.toolCalls).toHaveLength(1)
          const toolCall = toolCallResult.toolCalls[0]!

          // Execute the tool
          const toolResult = await context.executeTool(toolCall)
          expect(toolResult.success).toBe(true)

          // Send tool results back using sendToolResults
          const toolResults = [{
            toolCallId: toolCall.id,
            content: String(toolResult.result)
          }]

          const messageCountBeforeSend = context.getMessages().length
          const finalResult = await client.sendToolResults(toolResults, { context })

          if (finalResult.type === 'model_error') {
            console.log('sendToolResults error:', finalResult.error)
          }
          expect(finalResult.type).toBe('success')
          if (finalResult.type === 'success') {
            // Should contain the calculation result
            expect(finalResult.response.content).toContain('15')
          }

          // Verify sendToolResults added 1 TOOL_RESULT message + 1 ASSISTANT message = +2 total
          expect(context.getMessages().length).toBe(messageCountBeforeSend + 2)

          // Check the tool result message was added (1 tool result in this case)
          const toolResultMessage = context.getMessages()[context.getMessages().length - 2]
          expect(toolResultMessage?.role).toBe('tool_result')
          if (toolResultMessage?.role === 'tool_result') {
            expect(toolResultMessage.content).toContain('15')
            expect(toolResultMessage.tool_call_id).toBe(toolCall.id)
          }

          // Check the assistant response was added
          const assistantMessage = context.getMessages()[context.getMessages().length - 1]
          expect(assistantMessage?.role).toBe('assistant')
          if (assistantMessage?.role === 'assistant') {
            expect(assistantMessage.provider).toBe(client.getProvider())
            expect(assistantMessage.model).toBe(client.getModel())
          }
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
          provider: client.getProvider(),
          model: client.getModel(),
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

    describe('thinking/reasoning support', () => {
      it('should handle thinking on supported models', async () => {
        // Skip if not a thinking-capable model
        const thinkingModels = ['claude-sonnet-4-20250514', 'o1-mini', 'o1-preview']
        const testModel = client.getModel()
        if (!thinkingModels.includes(testModel)) {
          console.log(`⚠️  Skipping thinking test - ${testModel} is not a thinking-capable model`)
          return
        }

        // Create thinking-enabled client
        const thinkingClient = createClient(true)
        
        const thinkingChunks: string[] = []
        const onThinkingChunk = (chunk: string) => thinkingChunks.push(chunk)
        const initialMessageCount = context.getMessages().length

        const result = await thinkingClient.ask(
          'Solve this step by step: What is 127 * 83? Show your reasoning.',
          {
            context,
            onThinkingChunk
          }
        )

        expect(result.type).toBe('success')
        if (result.type === 'success') {
          // Should have regular content
          expect(result.response.content.length).toBeGreaterThan(0)

          // When thinking is supported and enabled, should have thinking content
          if (thinkingChunks.length > 0) {
            expect(result.response.thinking).toBeDefined()
            expect(result.response.thinking!.length).toBeGreaterThan(0)
            // Thinking should contain reasoning steps
            expect(result.response.thinking!.toLowerCase()).toMatch(/step|think|reason|calculate|multiply/i)
            console.log('✓ Thinking content captured:', result.response.thinking!.substring(0, 100) + '...')

            // Should have received thinking chunks during streaming
            expect(thinkingChunks.join('')).toBe(result.response.thinking)
            console.log('✓ Thinking chunks streamed correctly')
          } else {
            console.log('⚠️  No thinking content received - model may not support reasoning')
          }

          // Token counts should be valid
          expect(result.response.tokens.output).toBeGreaterThan(0)
          expect(result.response.cost).toBeGreaterThan(0)

          // Verify context was updated (user + assistant messages)
          expect(context.getMessages().length).toBe(initialMessageCount + 2)
          const assistantMessage = context.getMessages()[context.getMessages().length - 1]
          expect(assistantMessage?.role).toBe('assistant')
          if (assistantMessage?.role === 'assistant') {
            expect(assistantMessage.provider).toBe(client.getProvider())
            expect(assistantMessage.model).toBe(client.getModel())
            expect(assistantMessage.content).toBe(result.response.content)
          }
        }
      }, 30000)

      it('should handle thinking with tool calls', async () => {
        // Skip if not a thinking-capable model
        const thinkingModels = ['claude-sonnet-4-20250514', 'o1-mini', 'o1-preview']
        const testModel = client.getModel()
        if (!thinkingModels.includes(testModel)) {
          console.log(`⚠️  Skipping thinking+tools test - ${testModel} is not a thinking-capable model`)
          return
        }

        // Create thinking-enabled client
        const thinkingClient = createClient(true)

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

        const result = await thinkingClient.ask(
          'I have $1000 to invest. If I can get 5% annual interest compounded monthly, how much will I have after 2 years? Then calculate what percentage increase that represents.',
          {
            context,
            onThinkingChunk
          }
        )

        if (result.type === 'model_error') {
          // Handle model access issues gracefully
          if (result.error.message.includes('does not support thinking') ||
              result.error.message.includes('does not support') ||
              result.error.message.includes('model:')) {
            console.log(`⚠️  ${client.getProvider()} thinking+tools not accessible - skipping test`)
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
          const finalResult = await thinkingClient.ask('Continue with the percentage calculation.', {
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

          // Validate thinking content was captured during tool usage
          if (thinkingChunks.length > 0) {
            const fullThinking = thinkingChunks.join('')
            expect(fullThinking.toLowerCase()).toMatch(/tool|calculate|compound|interest|percentage/i)
            console.log('✓ Thinking captured tool reasoning:', fullThinking.substring(0, 150) + '...')
          }
        }
      }, 30000)
    })

    describe('error handling', () => {
      it('should handle invalid model name', async () => {
        // This test would need a way to create a client with invalid model
        // Skip for now as it requires provider-specific setup
      })
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
        expect(costByProvider[client.getProvider()]).toBeGreaterThan(0)

        // Verify cost breakdown by model
        const costByModel = context.getCostByModel()
        expect(costByModel[client.getModel()]).toBeGreaterThan(0)
      }, 20000)
    })
}