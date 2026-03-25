import type { SQL } from 'drizzle-orm';
import { and, eq, isNull, asc, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedBatch, embedText, isTokenLimitError } from './embedding-service';

/**
 * text-embedding-3-small max is 8192 tokens. Tokenization density varies
 * widely (2.5–4 chars/token). Use 20K chars (~2.4 chars/token worst case)
 * as the primary limit, with a binary-search retry if it still exceeds.
 */
const MAX_EMBED_CHARS = 20_000;

function docToText(doc: { title: string; content: string | null }): string {
  return `${doc.title}${doc.content ? '\n' + doc.content : ''}`;
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

/** Fallback: embed each document individually, truncating oversized ones. */
async function embedIndividually(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    try {
      results.push(await embedText(text));
    } catch (err) {
      if (isTokenLimitError(err)) {
        results.push(await embedWithTruncation(text));
      } else {
        console.error('Single embedding failed:', err);
        results.push(null);
      }
    }
  }
  return results;
}

/** Embed a single batch, returning the count embedded. */
async function embedOneBatch(
  batchSize: number,
  category?: string,
  dateFilter?: SQL,
): Promise<number> {
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
    .limit(batchSize);

  if (unembedded.length === 0) return 0;

  const texts = unembedded.map(docToText);

  let embeddings: (number[] | null)[];
  try {
    embeddings = await embedBatch(texts);
  } catch (err) {
    if (isTokenLimitError(err)) {
      console.log(
        `[embedding] Batch exceeded token limit, falling back to individual (${texts.length} docs)`,
      );
      embeddings = await embedIndividually(texts);
    } else {
      throw err;
    }
  }

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
 * Embed all unprocessed documents, looping in batches until done.
 * Optionally filter by category. No-op when DB or embedding provider is unavailable.
 */
export async function embedUnprocessedDocuments(
  batchSize = 10,
  category?: string,
  dateFilter?: SQL,
): Promise<number> {
  if (!isDbAvailable()) return 0;

  let total = 0;
  let batchCount: number;

  do {
    batchCount = await embedOneBatch(batchSize, category, dateFilter);
    total += batchCount;
  } while (batchCount === batchSize);

  return total;
}
