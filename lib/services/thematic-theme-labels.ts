/**
 * AI theme labels for thematic shift standouts (#583, owner-approved
 * 2026-07-25). Exemplar selection is deterministic — titles nearest the
 * prior-window centroid vs the spike-week centroid, straight from stored
 * embeddings — and one gpt-4o-mini call compresses the two lists into
 * "shifted from X toward Y". Labels cache for 7 days (max ~8 standouts/week
 * ⇒ well under $0.01/week); every failure path degrades to no label.
 */

import { and, eq, sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import { computeCentroid, cosineSimilarity } from '@/lib/services/embedding-service';
import { addDays } from '@/lib/utils/date-utils';

const EXEMPLAR_COUNT = 8;
const LABEL_MODEL = 'gpt-4o-mini';
const LABEL_MAX_TOKENS = 60;
const LABEL_TTL_SECONDS = 60 * 60 * 24 * 7;
const PRIOR_WINDOW_WEEKS = 8;

const LABEL_SYSTEM_PROMPT =
  'You summarize topic shifts in collections of U.S. government document titles. ' +
  'Respond with ONE clause of at most 18 words in the exact form ' +
  '"from <earlier theme> toward <new theme>" — lowercase, no period, no editorializing.';

interface TitledEmbedding {
  title: string;
  embedding: number[];
}

async function loadTitledEmbeddings(
  category: string,
  from: string,
  to: string,
): Promise<TitledEmbedding[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db
    .select({ title: documents.title, embedding: documents.embedding })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        sql`${documents.publishedAt} >= ${from}::date`,
        sql`${documents.publishedAt} < ${to}::date`,
        sql`${documents.embedding} IS NOT NULL`,
        retrievalRelevantOnly(),
      ),
    );
  return rows.map((r) => ({ title: r.title, embedding: r.embedding! }));
}

/** Titles nearest a centroid, most-similar first. Pure. */
export function nearestTitles(
  docs: TitledEmbedding[],
  centroid: number[],
  count: number,
): string[] {
  return [...docs]
    .sort(
      (a, b) => cosineSimilarity(b.embedding, centroid) - cosineSimilarity(a.embedding, centroid),
    )
    .slice(0, count)
    .map((d) => d.title);
}

async function generateLabel(before: string[], now: string[]): Promise<string | null> {
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return null;
  try {
    const result = await provider.complete(
      `Earlier weeks' representative titles:\n${before.map((t) => `- ${t}`).join('\n')}\n\n` +
        `Shift week's representative titles:\n${now.map((t) => `- ${t}`).join('\n')}`,
      {
        systemPrompt: LABEL_SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: LABEL_MAX_TOKENS,
        model: LABEL_MODEL,
      },
    );
    const label = result.content.trim().replace(/^["']|["'.]$/g, '');
    return label.startsWith('from ') ? label : null;
  } catch (err) {
    console.warn('[theme-labels] generation failed:', (err as Error).message);
    return null;
  }
}

/**
 * Theme label for one shift standout ("from X toward Y"), cached 7 days.
 * Null when embeddings/AI are unavailable or the shift week is empty.
 */
export async function getThemeLabel(category: string, spikeWeek: string): Promise<string | null> {
  const key = CacheKeys.themeLabel(category, spikeWeek);
  const cached = await cacheGet<{ label: string | null }>(key);
  if (cached !== null) return cached.label;

  const priorFrom = addDays(spikeWeek, -7 * PRIOR_WINDOW_WEEKS);
  const [priorDocs, weekDocs] = await Promise.all([
    loadTitledEmbeddings(category, priorFrom, spikeWeek),
    loadTitledEmbeddings(category, spikeWeek, addDays(spikeWeek, 7)),
  ]);
  if (priorDocs.length === 0 || weekDocs.length === 0) return null;

  const priorCentroid = computeCentroid(priorDocs.map((d) => d.embedding));
  const weekCentroid = computeCentroid(weekDocs.map((d) => d.embedding));
  if (!priorCentroid || !weekCentroid) return null;

  const label = await generateLabel(
    nearestTitles(priorDocs, priorCentroid, EXEMPLAR_COUNT),
    nearestTitles(weekDocs, weekCentroid, EXEMPLAR_COUNT),
  );
  // Cache nulls too: a failed generation should not retry on every page view.
  await cacheSet(key, { label }, LABEL_TTL_SECONDS);
  return label;
}
