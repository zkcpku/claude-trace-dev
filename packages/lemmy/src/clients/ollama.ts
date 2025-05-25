// Ollama client implementation - placeholder
import type { ChatClient, AskOptions, AskResult, OllamaConfig, ToolResult, UserInput } from '../types.js'

export class OllamaClient implements ChatClient {
  constructor(private _config: OllamaConfig) {}

  getModel(): string {
    return this._config.model
  }

  getProvider(): string {
    return 'ollama'
  }

  ask(_input: string | UserInput, _options?: AskOptions): Promise<AskResult> {
    throw new Error('Not implemented yet')
  }
}