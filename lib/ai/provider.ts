import type { AIProvider, AIEmbeddingProvider } from '@/lib/types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

const providers: Record<string, AIProvider> = {};

export function getProvider(name: 'openai' | 'anthropic'): AIProvider {
  if (!providers[name]) {
    switch (name) {
      case 'openai':
        providers[name] = new OpenAIProvider();
        break;
      case 'anthropic':
        providers[name] = new AnthropicProvider();
        break;
    }
  }
  return providers[name];
}

export function getEmbeddingProvider(): AIEmbeddingProvider {
  const provider = getProvider('openai');
  return provider as unknown as AIEmbeddingProvider;
}

export function getAvailableProviders(): AIProvider[] {
  const all: AIProvider[] = [
    getProvider('openai'),
    getProvider('anthropic'),
  ];
  return all.filter((p) => p.isAvailable());
}
