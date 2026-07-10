import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Pass1Response } from '@/lib/ai/schemas/document-review-response';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments, documents } from '@/lib/db/schema';
import type { Pass1Result, Pass2Result } from './document-review-assessment-service';

/**
 * Store a Pass 1 assessment result.
 */
export async function storePass1Assessment(
  result: Pass1Result,
  category: string,
  weekOf: string,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();

  await db
    .insert(aiDocumentAssessments)
    .values({
      url: result.url,
      category,
      pass: 1,
      relevant: result.response.relevant,
      confidence: result.response.confidence,
      erosionType: result.response.erosionType,
      signals: result.response.signals,
      model: result.meta.model,
      provider: result.meta.provider,
      tokensInput: result.meta.tokensInput,
      tokensOutput: result.meta.tokensOutput,
      latencyMs: result.meta.latencyMs,
      weekOf,
      isAuditSample: false,
    })
    .onConflictDoNothing();
}

/**
 * Store a Pass 2 assessment result.
 */
export async function storePass2Assessment(
  result: Pass2Result,
  category: string,
  weekOf: string,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();

  await db
    .insert(aiDocumentAssessments)
    .values({
      url: result.url,
      category,
      pass: 2,
      relevant: undefined,
      confidence: result.response.confidence,
      erosionType: result.response.erosionType,
      erosionActor: result.response.erosionActor,
      assessment: result.response.assessment,
      reasoning: result.response.reasoning,
      comparativeContext: result.response.comparativeContext,
      citedPassages: result.response.citedPassages,
      counterArguments: result.response.counterArguments,
      isAuditSample: result.isAuditSample,
      model: result.meta.model,
      provider: result.meta.provider,
      tokensInput: result.meta.tokensInput,
      tokensOutput: result.meta.tokensOutput,
      latencyMs: result.meta.latencyMs,
      weekOf,
    })
    .onConflictDoNothing();
}

/**
 * Get URLs that already have Pass 1 assessments for a specific category.
 * Used to skip redundant API calls during backfill.
 * Model filter removed: the DB stores the resolved model name (e.g.
 * 'gpt-4o-mini-2024-07-18') which differs from the alias ('gpt-4o-mini'),
 * and there is only one P1 model in practice.
 */
export async function getExistingPass1Urls(
  urls: string[],
  _model: string,
  category: string,
): Promise<Set<string>> {
  if (!isDbAvailable() || urls.length === 0) return new Set();
  const db = getDb();

  const BATCH = 500;
  const found = new Set<string>();
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const rows = await db
      .select({ url: aiDocumentAssessments.url })
      .from(aiDocumentAssessments)
      .where(
        and(
          inArray(aiDocumentAssessments.url, batch),
          eq(aiDocumentAssessments.pass, 1),
          eq(aiDocumentAssessments.category, category),
        ),
      );
    for (const r of rows) found.add(r.url);
  }
  return found;
}

/**
 * Load stored Pass 1 results for a set of URLs in a specific category.
 * Returns synthetic Pass1Result objects with zero token/latency metadata.
 */
export async function loadStoredPass1Results(
  urls: Set<string>,
  category: string,
): Promise<Pass1Result[]> {
  if (!isDbAvailable() || urls.size === 0) return [];
  const db = getDb();
  const BATCH = 500;
  const urlList = [...urls];
  const results: Pass1Result[] = [];

  for (let i = 0; i < urlList.length; i += BATCH) {
    const batch = urlList.slice(i, i + BATCH);
    const rows = await db
      .select({
        url: aiDocumentAssessments.url,
        relevant: aiDocumentAssessments.relevant,
        confidence: aiDocumentAssessments.confidence,
        erosionType: aiDocumentAssessments.erosionType,
        signals: aiDocumentAssessments.signals,
        model: aiDocumentAssessments.model,
        provider: aiDocumentAssessments.provider,
      })
      .from(aiDocumentAssessments)
      .where(
        and(
          inArray(aiDocumentAssessments.url, batch),
          eq(aiDocumentAssessments.pass, 1),
          eq(aiDocumentAssessments.category, category),
        ),
      );

    for (const r of rows) {
      results.push({
        url: r.url,
        response: {
          relevant: r.relevant ?? false,
          confidence: r.confidence ?? 0,
          erosionType: (r.erosionType ?? 'unclear') as Pass1Response['erosionType'],
          signals: (r.signals as string[]) ?? [],
        },
        meta: {
          model: r.model,
          provider: r.provider,
          tokensInput: 0,
          tokensOutput: 0,
          latencyMs: 0,
        },
      });
    }
  }
  return results;
}

/**
 * Get baseline AI flag rate for a category (from stored baseline assessments).
 * Returns the fraction of Pass 1 docs flagged as relevant during baseline period.
 */
export async function getBaselineAIFlagRate(
  category: string,
  baselineId: string,
): Promise<{ rate: number; stdDev: number } | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();

  // Compute from weekly flag rates during the specified baseline period
  const config = BASELINE_CONFIGS.find((c) => c.id === baselineId);
  if (!config) return null;

  const rows = await db.execute(sql`
    SELECT
      ${aiDocumentAssessments.weekOf} AS week_of,
      COUNT(*) FILTER (WHERE ${aiDocumentAssessments.relevant} = true)::float
        / NULLIF(COUNT(*)::float, 0) AS flag_rate
    FROM ${aiDocumentAssessments}
    WHERE ${aiDocumentAssessments.category} = ${category}
      AND ${aiDocumentAssessments.pass} = 1
      AND ${aiDocumentAssessments.weekOf} >= ${config.from}
      AND ${aiDocumentAssessments.weekOf} <= ${config.to}
    GROUP BY ${aiDocumentAssessments.weekOf}
  `);

  const rates = (rows.rows as Array<{ flag_rate: number }>)
    .map((r) => Number(r.flag_rate))
    .filter((r) => !isNaN(r));

  if (rates.length === 0) return null;

  const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
  const variance =
    rates.length > 1 ? rates.reduce((s, v) => s + (v - mean) ** 2, 0) / (rates.length - 1) : 0;

  return { rate: mean, stdDev: Math.sqrt(variance) };
}

export interface WeekP1Context {
  totalDocs: number;
  flaggedDocs: number;
  flaggedPeers: Array<{ url: string; title: string; erosionType: string }>;
}

/**
 * Get P1 assessment stats and top flagged peer titles for a category-week.
 * Used to build Pass2WeekContext for the B-E contextual prompt.
 */
export async function getWeekP1Context(category: string, weekOf: string): Promise<WeekP1Context> {
  const empty = { totalDocs: 0, flaggedDocs: 0, flaggedPeers: [] };
  if (!isDbAvailable()) return empty;
  const db = getDb();

  const weekEnd = new Date(weekOf);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const statsRows = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${aiDocumentAssessments.relevant} = true)::int AS flagged
    FROM ${aiDocumentAssessments}
    WHERE ${aiDocumentAssessments.category} = ${category}
      AND ${aiDocumentAssessments.pass} = 1
      AND ${aiDocumentAssessments.weekOf} >= ${weekOf}
      AND ${aiDocumentAssessments.weekOf} < ${weekEndStr}
  `);

  const stats = statsRows.rows[0] as Record<string, number> | undefined;
  const totalDocs = stats?.total ?? 0;
  const flaggedDocs = stats?.flagged ?? 0;

  const peerRows = await db.execute(sql`
    SELECT
      a.url,
      COALESCE(d.title, a.url) AS title,
      COALESCE(a.erosion_type, 'unclear') AS erosion_type
    FROM ${aiDocumentAssessments} a
    LEFT JOIN ${documents} d ON d.url = a.url AND d.category = a.category
    WHERE a.category = ${category}
      AND a.pass = 1
      AND a.relevant = true
      AND a.week_of >= ${weekOf}
      AND a.week_of < ${weekEndStr}
    ORDER BY a.confidence DESC NULLS LAST
    LIMIT 10
  `);

  const flaggedPeers = (peerRows.rows as Array<Record<string, unknown>>).map((r) => ({
    url: r.url as string,
    title: r.title as string,
    erosionType: (r.erosion_type as string) ?? 'unclear',
  }));

  return { totalDocs, flaggedDocs, flaggedPeers };
}
