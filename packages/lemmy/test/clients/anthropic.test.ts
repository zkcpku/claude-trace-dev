import { describe, it, expect, beforeEach } from 'vitest'
import { AnthropicClient } from '../../src/clients/anthropic.js'
import { Context } from '../../src/context.js'
import type { AnthropicConfig } from '../../src/types.js'
import { sharedClientTests } from './shared-client-tests.js'
import { AllModels } from '../../src/models.js'

describe('AnthropicClient', () => {
  const testConfig: AnthropicConfig = {
    apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
    model: 'claude-3-5-sonnet-20241022'
  }

  const createClient = (withThinking = false, apiKey?: string, withImageInput = false) => {
    let model = testConfig.model;
    let config: AnthropicConfig = { ...testConfig };
    
    if (withThinking || withImageInput) {
      // claude-sonnet-4-20250514 supports both thinking and image input
      model = "claude-sonnet-4-20250514";
      config.model = model;
    }
    
    if (withThinking) {
      config.thinking = { enabled: true, budgetTokens: 3000 };
    }
    
    if (apiKey) {
      config.apiKey = apiKey;
    }
    
    return new AnthropicClient(config);
  }

  // Run shared tests
  sharedClientTests(createClient)

  // Provider-specific setup for remaining tests
  let client: AnthropicClient
  let context: Context

  beforeEach(() => {
    client = createClient()
    context = new Context()
  })

  // Anthropic-specific tests (truly unique functionality)

  describe('anthropic-specific thinking features', () => {
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

  })
})