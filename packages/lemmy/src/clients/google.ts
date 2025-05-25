// Google/Gemini client implementation - placeholder
import type { ChatClient, AskOptions, AskResult, GoogleConfig, ToolResult, UserInput } from '../types.js'

export class GoogleClient implements ChatClient {
  constructor(private _config: GoogleConfig) {}

  getModel(): string {
    return this._config.model
  }

  getProvider(): string {
    return 'google'
  }

  ask(_input: string | UserInput, _options?: AskOptions): Promise<AskResult> {
    throw new Error('Not implemented yet')
  }
}