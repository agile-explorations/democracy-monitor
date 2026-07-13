/**
 * Pure logic for the erosion-actor attribution light pass (#537).
 *
 * Historical P2 rows cannot receive erosionActor via P2 re-runs (the
 * (url, category, pass, model) unique constraint + onConflictDoNothing makes
 * same-model re-runs silent no-ops), so attribution runs as a separate cheap
 * classification over STORED assessment data (title + reasoning + cited
 * passages + a content head), writing back via UPDATE-by-id. The prompt
 * reuses buildActorFramework() so the taxonomy text is byte-identical to the
 * live P2 prompt. Attribution never changes assessments — this module only
 * ever produces an actor label.
 */

import { sql } from 'drizzle-orm';
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  buildAttributionPrompt,
  parseAttributionResponse,
} from '@/lib/ai/prompts/actor-attribution-prompt';
import type { AttributionCandidate } from '@/lib/ai/prompts/actor-attribution-prompt';
import { getProvider } from '@/lib/ai/provider';
import { getDb, isDbAvailable } from '@/lib/db';
import { mapConcurrent } from '@/lib/utils/async';

const ATTRIBUTION_MODEL = 'gpt-4o-mini';
const ATTRIBUTION_CONCURRENCY = 4;
const CONTENT_HEAD_CHARS = 1500;

/**
 * Deterministic stratified sample: proportional per category with a floor,
 * evenly spaced within each category (rows must be pre-sorted by id for
 * reproducibility across runs).
 */
export function stratifiedSample<T extends { category: string }>(
  rows: T[],
  target: number,
  floorPerCategory = 5,
): T[] {
  const byCategory = new Map<string, T[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  const total = rows.length;
  const sampled: T[] = [];
  for (const list of byCategory.values()) {
    const proportional = Math.round((list.length / total) * target);
    const take = Math.min(list.length, Math.max(floorPerCategory, proportional));
    const step = Math.max(1, Math.floor(list.length / take));
    sampled.push(...list.filter((_, i) => i % step === 0).slice(0, take));
  }
  return sampled;
}

/** Aggregate written/predicted actors for the distribution sanity report. */
export function summarizeDistribution(
  results: Array<{ category: string; erosionActor: string }>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of results) {
    out[r.category] = out[r.category] ?? {};
    out[r.category][r.erosionActor] = (out[r.category][r.erosionActor] ?? 0) + 1;
  }
  return out;
}

export interface AttributionRunOptions {
  from: string;
  to: string;
  category?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  limit?: number;
}

export interface AttributionRunResult {
  candidates: number;
  results: Array<{ candidate: AttributionCandidate; erosionActor: string; rationale: string }>;
  written: number;
}

/** Load confirmed P2 rows needing attribution (NULL erosion_actor unless overwrite). */
export async function loadAttributionCandidates(
  opts: AttributionRunOptions,
): Promise<AttributionCandidate[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT a.id, a.url, a.category, d.title, a.reasoning,
      a.cited_passages AS "citedPassages", a.erosion_type AS "erosionType",
      a.assessment, left(d.content, ${CONTENT_HEAD_CHARS}) AS "contentHead",
      a.week_of::text AS "weekOf"
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2
      AND a.assessment IN ('potentially_concerning', 'clearly_concerning')
      AND a.week_of >= ${opts.from} AND a.week_of <= ${opts.to}
      ${opts.overwrite ? sql`` : sql`AND a.erosion_actor IS NULL`}
      ${opts.category ? sql`AND a.category = ${opts.category}` : sql``}
    ORDER BY a.id
    ${opts.limit ? sql`LIMIT ${opts.limit}` : sql``}
  `);
  return rows.rows as unknown as AttributionCandidate[];
}

async function attributeOne(
  candidate: AttributionCandidate,
): Promise<{ candidate: AttributionCandidate; erosionActor: string; rationale: string } | null> {
  const provider = getProvider('openai');
  try {
    const result = await provider.complete(buildAttributionPrompt(candidate), {
      systemPrompt: ATTRIBUTION_SYSTEM_PROMPT,
      temperature: 0,
      model: ATTRIBUTION_MODEL,
    });
    const parsed = parseAttributionResponse(result.content);
    if (!parsed) {
      console.warn(`[actor-attribution] unparseable for assessment ${candidate.id}, skipping`);
      return null;
    }
    return { candidate, erosionActor: parsed.erosionActor, rationale: parsed.rationale };
  } catch (err) {
    console.warn(
      `[actor-attribution] failed for assessment ${candidate.id}:`,
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Attribute erosionActor on confirmed P2 rows in [from, to] via the light
 * pass, writing UPDATE-by-id. Used by the weekly snapshot (per category-week,
 * between L2 and aggregation so ai_detail.actorConfirmations is fresh) and by
 * the actor:backfill CLI (historical ranges). Never touches assessment fields.
 */
export async function runActorAttribution(
  opts: AttributionRunOptions,
  candidates?: AttributionCandidate[],
): Promise<AttributionRunResult> {
  if (!isDbAvailable()) return { candidates: 0, results: [], written: 0 };
  const rows = candidates ?? (await loadAttributionCandidates(opts));
  if (rows.length === 0) return { candidates: 0, results: [], written: 0 };

  const results = (await mapConcurrent(rows, ATTRIBUTION_CONCURRENCY, attributeOne)).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  let written = 0;
  if (!opts.dryRun) {
    const db = getDb();
    for (const r of results) {
      await db.execute(
        sql`UPDATE ai_document_assessments SET erosion_actor = ${r.erosionActor} WHERE id = ${r.candidate.id}`,
      );
      written++;
    }
  }
  return { candidates: rows.length, results, written };
}
