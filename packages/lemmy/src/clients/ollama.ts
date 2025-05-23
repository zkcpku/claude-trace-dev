// Ollama client implementation - placeholder
import type { ChatClient, AskOptions, AskResult, OllamaConfig, ToolResult } from '../types.js'

export class OllamaClient implements ChatClient {
  constructor(private _config: OllamaConfig) {}

  async ask(_prompt: string, _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }

  async sendToolResults(_toolResults: ToolResult[], _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }
}