import type { SQL } from 'drizzle-orm';
import { and, eq, asc, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { searchable } from '@/lib/db/document-filters';
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
 * Budget to ~200K to leave generous margin for tokenization variance —
 * legal/regulatory text can tokenize denser than 3 chars/token.
 * At ~3 chars/token, that's ~600K chars per batch.
 */
const BATCH_TOKEN_BUDGET_CHARS = 600_000;

/** Final-resort character limit when truncation retries fail. */
const FINAL_TRUNCATION_CHARS = 4_000;

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
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await embedText(text.slice(0, limit));
      if (result) return result;
      // embedText returned null (non-token error already logged) — give up retry loop
      return null;
    } catch (err) {
      lastErr = err;
      if (isTokenLimitError(err)) {
        limit = Math.floor(limit * 0.6);
        continue;
      }
      // Non-token error — stop retrying, surface
      console.error(
        `[embedding] embedWithTruncation failed at limit=${limit}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  // Final attempt at the most conservative limit
  try {
    return await embedText(text.slice(0, FINAL_TRUNCATION_CHARS));
  } catch (err) {
    console.error(
      `[embedding] Final ${FINAL_TRUNCATION_CHARS}-char truncation also failed:`,
      err instanceof Error ? err.message : err,
      '(prior:',
      lastErr instanceof Error ? lastErr.message : lastErr,
      ')',
    );
    return null;
  }
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
          } catch (fallbackErr) {
            console.error(
              `[embedding] Fallback failed for doc index ${batch.indices[j]}:`,
              fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
            );
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
/**
 * Embedding eligibility (R-SEARCH-ORTHOGONAL): every unembedded searchable
 * document with a body — the searchable population, not the counting or
 * analysis-evidence ones. Off-topic rows, unrouted corpus rows, fragments and
 * curated-docket documents all embed because retrieval-grade search is the
 * point of storing them. Exported so the Data Readiness backlog counter
 * reports exactly what `embeddings:backfill` would process.
 */
export function embeddable(): SQL {
  return sql`${documents.embeddedAt} IS NULL AND ${searchable()}
    AND ${documents.content} IS NOT NULL AND ${documents.content} <> ''`;
}

function embeddableConditions(category?: string, dateFilter?: SQL): SQL[] {
  const conditions = [embeddable()];
  if (category) conditions.push(eq(documents.category, category));
  if (dateFilter) conditions.push(dateFilter);
  return conditions;
}

/** Chars-per-token divisor for the dry-run estimate (a rough planning
 *  figure, not the ~3 chars/token the batcher budgets conservatively). */
const ESTIMATE_CHARS_PER_TOKEN = 4;

export interface EmbeddableEstimate {
  count: number;
  /** Approximate — sum of min(length(content), MAX_EMBED_CHARS) / 4. */
  approxTokens: number;
}

/**
 * Count the rows `embedUnprocessedDocuments` would process, with a token
 * estimate. `length(content)` detoasts every row it touches (a whole-table
 * pass cost gigabytes on 2026-07-25), so the sum is scoped by the same
 * predicate as the embedder — only the unembedded rows are read.
 */
export async function countEmbeddable(
  opts: { category?: string; dateFilter?: SQL } = {},
): Promise<EmbeddableEstimate> {
  if (!isDbAvailable()) return { count: 0, approxTokens: 0 };
  const [row] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      approxTokens: sql<number>`(coalesce(sum(least(length(${documents.content}), ${MAX_EMBED_CHARS}::int)), 0) / ${ESTIMATE_CHARS_PER_TOKEN}::int)::bigint`,
    })
    .from(documents)
    .where(and(...embeddableConditions(opts.category, opts.dateFilter)));
  return { count: Number(row?.count ?? 0), approxTokens: Number(row?.approxTokens ?? 0) };
}

interface BatchOutcome {
  /** Rows fetched and sent to the API (successes and marked failures alike). */
  attempted: number;
  embedded: number;
}

async function embedOneBatch(
  category: string | undefined,
  dateFilter: SQL | undefined,
  fetchLimit: number,
): Promise<BatchOutcome> {
  const db = getDb();
  const conditions = embeddableConditions(category, dateFilter);

  const unembedded = await db
    .select({ id: documents.id, title: documents.title, content: documents.content })
    .from(documents)
    .where(and(...conditions))
    .orderBy(asc(documents.id))
    .limit(fetchLimit);

  if (unembedded.length === 0) return { attempted: 0, embedded: 0 };

  const allTexts = unembedded.map(docToText);
  const { batches, oversized } = buildBatches(allTexts);
  const embeddings = await processBatches(batches, oversized, allTexts.length);

  let embedded = 0;
  let markedFailed = 0;
  const now = new Date();
  for (let i = 0; i < unembedded.length; i++) {
    const emb = embeddings[i];
    try {
      if (emb) {
        await db
          .update(documents)
          .set({ embedding: emb, embeddedAt: now })
          .where(eq(documents.id, unembedded[i].id));
        embedded++;
      } else {
        // Mark as attempted so the loop doesn't retry this doc forever.
        // embedding stays NULL; embeddedAt is set as a "tried" marker.
        await db
          .update(documents)
          .set({ embeddedAt: now })
          .where(eq(documents.id, unembedded[i].id));
        markedFailed++;
        console.warn(
          `[embedding] Attempted-but-failed doc id=${unembedded[i].id} title="${unembedded[i].title.slice(0, 60)}" contentLen=${unembedded[i].content?.length ?? 0}`,
        );
      }
    } catch (err) {
      console.error(`Failed to update document ${unembedded[i].id}:`, err);
    }
  }
  if (markedFailed > 0) {
    console.warn(`[embedding] Marked ${markedFailed} doc(s) as attempted-but-failed`);
  }
  return { attempted: unembedded.length, embedded };
}

/**
 * Embed unprocessed documents until the population is exhausted, a whole
 * batch fails (a provider outage must not march through the backlog marking
 * every row as tried), or `maxDocs` rows have been attempted — the spend cap
 * `embeddings:backfill --max-docs` passes through. Attempts count, not
 * successes: every attempt is an API call.
 */
export async function embedWithCap(
  category?: string,
  dateFilter?: SQL,
  maxDocs?: number,
): Promise<BatchOutcome> {
  const run: BatchOutcome = { attempted: 0, embedded: 0 };
  if (!isDbAvailable()) return run;

  for (;;) {
    const remaining = maxDocs === undefined ? DB_FETCH_LIMIT : maxDocs - run.attempted;
    if (remaining <= 0) break;
    const batch = await embedOneBatch(category, dateFilter, Math.min(DB_FETCH_LIMIT, remaining));
    run.attempted += batch.attempted;
    run.embedded += batch.embedded;
    if (batch.embedded === 0) break;
  }
  return run;
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
  return (await embedWithCap(category, dateFilter)).embedded;
}
