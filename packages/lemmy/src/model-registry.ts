import { lemmy } from "./index.js";
import {
  ModelToProvider,
  AnthropicModelData,
  OpenAIModelData,
  GoogleModelData,
  AllModels,
  AnthropicModels,
  OpenAIModels,
  GoogleModels,
  OllamaModels,
} from "./models.js";
import {
  AnthropicConfig,
  OpenAIConfig,
  GoogleConfig,
  OllamaConfig,
  ChatClient,
  TokenUsage,
} from "./types.js";

// Re-export model types and data
export * from "./models.js";

// Type-safe factory function for CLI usage
export function createClientForModel(
  model: AllModels,
  config: AnthropicConfig | OpenAIConfig | GoogleConfig | OllamaConfig
): ChatClient {
  const provider = ModelToProvider[model as keyof typeof ModelToProvider];

  if (provider === "anthropic") {
    return lemmy.anthropic({ ...config, model } as AnthropicConfig);
  } else if (provider === "openai") {
    return lemmy.openai({ ...config, model } as OpenAIConfig);
  } else if (provider === "google") {
    return lemmy.google({ ...config, model } as GoogleConfig);
  } else {
    // For ollama models (which are strings and not in ModelToProvider)
    // or for any unknown provider, default to ollama
    return lemmy.ollama({ ...config, model } as OllamaConfig);
  }
}

// Helper functions for model lookup
export function findModelData(model: string): ModelData | undefined {
  if (AnthropicModelData[model as keyof typeof AnthropicModelData]) {
    return AnthropicModelData[
      model as keyof typeof AnthropicModelData
    ] as ModelData;
  }
  if (OpenAIModelData[model as keyof typeof OpenAIModelData]) {
    return OpenAIModelData[model as keyof typeof OpenAIModelData] as ModelData;
  }
  if (GoogleModelData[model as keyof typeof GoogleModelData]) {
    return GoogleModelData[model as keyof typeof GoogleModelData] as ModelData;
  }
  return undefined;
}

export function calculateTokenCost(model: string, tokens: TokenUsage): number {
  const modelData = findModelData(model);
  if (!modelData?.pricing) {
    return 0;
  }

  const inputCost =
    (tokens.input * modelData.pricing.inputPerMillion) / 1_000_000;
  const outputCost =
    (tokens.output * modelData.pricing.outputPerMillion) / 1_000_000;

  return inputCost + outputCost;
}

export interface ModelData {
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsImageInput: boolean;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  } | null;
}
