// Google/Gemini client implementation - placeholder
import type { ChatClient, AskOptions, AskResult, GoogleConfig, ToolResult } from '../types.js'

export class GoogleClient implements ChatClient {
  constructor(private _config: GoogleConfig) {}

  async ask(_prompt: string, _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }

  async sendToolResults(_toolResults: ToolResult[], _options?: AskOptions): Promise<AskResult> {
    // Implementation will be added
    throw new Error('Not implemented yet')
  }
}