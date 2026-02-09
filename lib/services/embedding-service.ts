import { getEmbeddingProvider } from '@/lib/ai/provider';
import type { AIEmbeddingResult } from '@/lib/types';

export async function embedText(text: string): Promise<number[] | null> {
  const provider = getEmbeddingProvider();
  if (!provider.isAvailable()) return null;

  try {
    const result = await provider.embed(text);
    return result.embedding;
  } catch (err) {
    console.error('Embedding failed:', err);
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const provider = getEmbeddingProvider();
  if (!provider.isAvailable()) return texts.map(() => null);

  try {
    const results = await provider.embedBatch(texts);
    return results.map((r) => r.embedding);
  } catch (err) {
    console.error('Batch embedding failed:', err);
    return texts.map(() => null);
  }
}

/** Compute the element-wise mean of a set of embedding vectors. */
export function computeCentroid(embeddings: number[][]): number[] | null {
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
