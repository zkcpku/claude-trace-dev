import { describe, it, expect, beforeEach } from 'vitest'
import { OpenAIClient } from '../../src/clients/openai.js'
import { Context } from '../../src/context.js'
import type { OpenAIConfig } from '../../src/types.js'
import { sharedClientTests } from './shared-client-tests.js'

describe('OpenAIClient', () => {
  const testConfig: OpenAIConfig = {
    apiKey: process.env['OPENAI_API_KEY'] || 'test-key',
    model: 'gpt-4o'
  }

  const createClient = (withThinking = false, apiKey?: string) => {
    const config = withThinking ? {
      ...testConfig,
      model: 'o1-mini', // Use reasoning model for reasoning tests
      reasoningEffort: 'medium' as const,
      ...(apiKey && { apiKey })
    } : {
      ...testConfig,
      ...(apiKey && { apiKey })
    }
    return new OpenAIClient(config)
  }

  // Run shared tests
  sharedClientTests(createClient)

  // Provider-specific setup for remaining tests
  let client: OpenAIClient
  let context: Context
  
  beforeEach(() => {
    client = createClient()
    context = new Context()
  })

  // OpenAI-specific tests (truly unique functionality)
  describe('openai-specific features', () => {

    it('should handle streaming properly without reasoning chunks for non-reasoning models', async () => {
      const chunks: string[] = []
      const thinkingChunks: string[] = []

      const result = await client.ask('Count from 1 to 3', {
        context,
        onChunk: (chunk) => chunks.push(chunk),
        onThinkingChunk: (thinking) => thinkingChunks.push(thinking)
      })

      expect(result.type).toBe('success')
      expect(chunks.length).toBeGreaterThan(0)
      expect(thinkingChunks.length).toBe(0) // Non-reasoning models don't have thinking
      
      if (result.type === 'success') {
        expect(result.response.thinking).toBeUndefined()
      }
    }, 10000)
  })
})