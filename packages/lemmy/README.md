# Lemmy

TypeScript API wrapper for multiple LLM providers (Anthropic, OpenAI, Google, Ollama).

## Installation

```bash
npm install lemmy
```

## Usage

```typescript
import { lemmy, Context } from 'lemmy'

const claude = lemmy.anthropic({ 
  apiKey: 'your-key',
  model: 'claude-3-5-sonnet-20241022'
})

const context = new Context()
const result = await claude.ask("Hello!", { context })

if (result.type === 'success') {
  console.log(result.response.content)
  console.log(`Cost: $${result.response.cost}`)
}
```

See the [main repository](https://github.com/your-org/lemmy) for full documentation.