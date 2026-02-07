import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AICompletionOptions, AICompletionResult } from '@/lib/types';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now();
    const client = this.getClient();

    const response = await client.messages.create({
      model: options?.model || 'claude-sonnet-4-5-20250929',
      max_tokens: options?.maxTokens || 1024,
      system: options?.systemPrompt || '',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      model: response.model,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }
}
