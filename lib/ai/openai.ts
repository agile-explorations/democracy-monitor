import OpenAI from 'openai';
import type { AIProvider, AICompletionOptions, AICompletionResult, AIEmbeddingProvider, AIEmbeddingResult } from '@/lib/types';

export class OpenAIProvider implements AIProvider, AIEmbeddingProvider {
  name = 'openai';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now();
    const client = this.getClient();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await client.chat.completions.create({
      model: options?.model || 'gpt-4o-mini',
      messages,
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.3,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      model: response.model,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
      },
      latencyMs: Date.now() - start,
    };
  }

  async embed(text: string): Promise<AIEmbeddingResult> {
    const client = this.getClient();
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      model: 'text-embedding-3-small',
      tokensUsed: response.usage.total_tokens,
    };
  }

  async embedBatch(texts: string[]): Promise<AIEmbeddingResult[]> {
    const client = this.getClient();
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    return response.data.map((d) => ({
      embedding: d.embedding,
      model: 'text-embedding-3-small',
      tokensUsed: Math.floor(response.usage.total_tokens / texts.length),
    }));
  }
}
