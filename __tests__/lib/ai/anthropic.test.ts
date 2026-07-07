import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '@/lib/ai/anthropic';
import type { AICompletionResult } from '@/lib/types';

describe('AnthropicProvider.complete', () => {
  it('drives the streaming API and returns its final result', async () => {
    const provider = new AnthropicProvider();
    const final: AICompletionResult = {
      content: 'expert then public',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 42,
    };

    // Stub the streaming path. complete() must drain it and return its final
    // result — rather than issue its own non-streaming request, which idle-times-
    // out on long output. Asserting result === the stream's return proves that.
    vi.spyOn(provider, 'completeStream').mockImplementation(async function* () {
      yield 'expert ';
      yield 'then ';
      yield 'public';
      return final;
    });

    const result = await provider.complete('prompt', {
      model: 'claude-opus-4-6',
      maxTokens: 4096,
      systemPrompt: 'sys',
    });

    expect(result).toEqual(final);
  });
});
