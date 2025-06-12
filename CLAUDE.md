**CRITICAL: Avoid `any` at all costs!** Use proper TypeScript types wherever possible:

- Import and use the specific types from packages/lemmy/src/types.ts (AskOptions, AnthropicAskOptions, OpenAIAskOptions, GoogleAskOptions, etc.)
- Never use `any` when a proper type exists
- If dynamic properties are needed, use proper type unions or mapped types
- Always prefer type safety over convenience
- When you see `: any` in code, consider it a bug that needs fixing
