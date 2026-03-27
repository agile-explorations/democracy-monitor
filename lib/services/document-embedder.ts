import type { SQL } from 'drizzle-orm';
import { and, eq, isNull, asc, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedBatch, embedText, isTokenLimitError } from './embedding-service';

/**
 * text-embedding-3-small max is 8192 tokens per document.
 * Tokenization density varies widely (2.5–4 chars/token).
 * Use 20K chars as the truncation limit for individual docs that exceed
 * the per-doc token limit, with retry at shorter lengths.
 */
const MAX_EMBED_CHARS = 20_000;

/**
 * OpenAI embedding API batch limit is 300K tokens.
 * Budget to ~250K to leave margin for tokenization variance.
 * At ~3 chars/token (conservative), that's ~750K chars per batch.
 */
const BATCH_TOKEN_BUDGET_CHARS = 750_000;

/** Max docs to fetch from DB per round (upper bound for greedy batching). */
const DB_FETCH_LIMIT = 100;

function docToText(doc: { title: string; content: string | null }): string {
  return `${doc.title}${doc.content ? '\n' + doc.content : ''}`;
}

/** Estimate tokens for a text string (conservative: ~3 chars/token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Embed a single oversized document by truncating its text. Retries with halved length on failure. */
async function embedWithTruncation(text: string): Promise<number[] | null> {
  let limit = MAX_EMBED_CHARS;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await embedText(text.slice(0, limit));
    } catch (err) {
      if (isTokenLimitError(err)) {
        limit = Math.floor(limit * 0.6);
        continue;
      }
      throw err;
    }
  }
  // Final attempt at very conservative limit
  return embedText(text.slice(0, 8000));
}

interface TokenBatch {
  indices: number[];
  texts: string[];
}

/** Split texts into token-budget-aware batches. Oversized docs (>8192 tokens) go separate. */
function buildBatches(allTexts: string[]): {
  batches: TokenBatch[];
  oversized: { index: number; text: string }[];
} {
  const batches: TokenBatch[] = [];
  const oversized: { index: number; text: string }[] = [];
  let current: TokenBatch = { indices: [], texts: [] };
  let currentTokens = 0;
  const batchTokenLimit = BATCH_TOKEN_BUDGET_CHARS / 3;

  for (let i = 0; i < allTexts.length; i++) {
    const text = allTexts[i];
    const tokens = estimateTokens(text);

    if (tokens > 8192) {
      oversized.push({ index: i, text });
      continue;
    }
    if (currentTokens + tokens > batchTokenLimit && current.indices.length > 0) {
      batches.push(current);
      current = { indices: [], texts: [] };
      currentTokens = 0;
    }
    current.indices.push(i);
    current.texts.push(text);
    currentTokens += tokens;
  }
  if (current.indices.length > 0) batches.push(current);
  return { batches, oversized };
}

/** Send batches + oversized docs to the embedding API, returning per-index results. */
async function processBatches(
  batches: TokenBatch[],
  oversized: { index: number; text: string }[],
  totalCount: number,
): Promise<(number[] | null)[]> {
  const embeddings: (number[] | null)[] = new Array(totalCount).fill(null);

  for (const batch of batches) {
    try {
      const results = await embedBatch(batch.texts);
      for (let j = 0; j < batch.indices.length; j++) {
        embeddings[batch.indices[j]] = results[j];
      }
    } catch (err) {
      if (isTokenLimitError(err)) {
        console.log(`[embedding] Batch of ${batch.texts.length} exceeded budget, falling back`);
        for (let j = 0; j < batch.indices.length; j++) {
          try {
            embeddings[batch.indices[j]] = await embedWithTruncation(batch.texts[j]);
          } catch {
            console.error(`[embedding] Fallback failed for doc index ${batch.indices[j]}`);
          }
        }
      } else {
        throw err;
      }
    }
  }

  for (const { index, text } of oversized) {
    try {
      embeddings[index] = await embedWithTruncation(text);
    } catch (err) {
      console.error(`[embedding] Oversized doc failed:`, err instanceof Error ? err.message : err);
    }
  }

  return embeddings;
}

/**
 * Embed one round of unprocessed documents using greedy token-budget batching.
 * Full-length docs are packed into batches up to the API token limit.
 * Oversized docs (>8192 tokens) are truncated and embedded individually.
 */
async function embedOneBatch(category?: string, dateFilter?: SQL): Promise<number> {
  const db = getDb();
  const conditions = [
    isNull(documents.embeddedAt),
    sql`${documents.contentType} != 'metadata_only'`,
  ];
  if (category) conditions.push(eq(documents.category, category));
  if (dateFilter) conditions.push(dateFilter);

  const unembedded = await db
    .select({ id: documents.id, title: documents.title, content: documents.content })
    .from(documents)
    .where(and(...conditions))
    .orderBy(asc(documents.id))
    .limit(DB_FETCH_LIMIT);

  if (unembedded.length === 0) return 0;

  const allTexts = unembedded.map(docToText);
  const { batches, oversized } = buildBatches(allTexts);
  const embeddings = await processBatches(batches, oversized, allTexts.length);

  let embedded = 0;
  const now = new Date();
  for (let i = 0; i < unembedded.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;
    try {
      await db
        .update(documents)
        .set({ embedding: emb, embeddedAt: now })
        .where(eq(documents.id, unembedded[i].id));
      embedded++;
    } catch (err) {
      console.error(`Failed to embed document ${unembedded[i].id}:`, err);
    }
  }
  return embedded;
}

/**
 * Embed all unprocessed documents, looping until done.
 * Optionally filter by category. No-op when DB or embedding provider is unavailable.
 */
export async function embedUnprocessedDocuments(
  _batchSize?: number,
  category?: string,
  dateFilter?: SQL,
): Promise<number> {
  if (!isDbAvailable()) return 0;

  let total = 0;
  let batchCount: number;

  do {
    batchCount = await embedOneBatch(category, dateFilter);
    total += batchCount;
  } while (batchCount > 0);

  return total;
}
