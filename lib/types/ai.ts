export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AICompletionResult {
  content: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  latencyMs: number;
}

export interface AIEmbeddingResult {
  embedding: number[];
  model: string;
  tokensUsed: number;
}

export interface AIProvider {
  name: string;
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;
  isAvailable(): boolean;
}

export interface AIEmbeddingProvider {
  name: string;
  embed(text: string): Promise<AIEmbeddingResult>;
  embedBatch(texts: string[]): Promise<AIEmbeddingResult[]>;
  isAvailable(): boolean;
}
