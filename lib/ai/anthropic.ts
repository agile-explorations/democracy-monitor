import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AICompletionOptions, AICompletionResult } from '@/lib/types';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 });
    }
    return this.client;
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    // Drive the request over the streaming API even though callers want the whole
    // result. A non-streaming messages.create() holds an idle HTTP connection until
    // the entire response is ready; long generations (e.g. term summaries near the
    // token cap) exceed the socket idle timeout and fail with APIConnectionError.
    // Streaming keeps data flowing via SSE, so the connection never idles out.
    const stream = this.completeStream(prompt, options);
    let next = await stream.next();
    while (!next.done) {
      next = await stream.next();
    }
    return next.value;
  }

  async *completeStream(
    prompt: string,
    options?: AICompletionOptions,
  ): AsyncGenerator<string, AICompletionResult> {
    const start = Date.now();
    const client = this.getClient();

    const stream = client.messages.stream({
      model: options?.model || 'claude-sonnet-4-5-20250929',
      max_tokens: options?.maxTokens || 1024,
      system: options?.systemPrompt || '',
      messages: [{ role: 'user', content: prompt }],
    });

    // If the consumer stops iterating early (client disconnect, generator
    // .return()), abort the underlying API request so the model stops
    // generating — otherwise an abandoned stream bills to completion.
    let completed = false;
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
      completed = true;
    } finally {
      if (!completed) stream.abort();
    }

    const finalMessage = await stream.finalMessage();
    return {
      content: finalMessage.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      model: finalMessage.model,
      tokensUsed: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }
}
