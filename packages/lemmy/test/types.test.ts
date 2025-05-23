import { describe, it, expect } from 'vitest'
import type { ChatClient, AskOptions, AskResult } from '../src/types.js'

describe('types', () => {
  it('should have proper type definitions', () => {
    // Basic type checking test - ensures types are properly exported
    const options: AskOptions = {}
    const result: AskResult = {
      type: 'success',
      response: {
        content: 'test',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.01
      }
    }
    
    expect(options).toBeDefined()
    expect(result.type).toBe('success')
  })
})