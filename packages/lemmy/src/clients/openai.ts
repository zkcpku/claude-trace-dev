// OpenAI client implementation - placeholder
import type { ChatClient, AskOptions, AskResult, OpenAIConfig, ToolResult } from '../types.js'

export class OpenAIClient implements ChatClient {
  constructor(private _config: OpenAIConfig) {}

  async ask(_prompt: string, _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }

  async sendToolResults(_toolResults: ToolResult[], _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }
}