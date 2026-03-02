import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments, documents } from '@/lib/db/schema';
import type { Pass1Result, Pass2Result } from './layer2-assessment-service';

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
 * Count Pass 1 assessments already stored for a category-week.
 */
export async function getPass1Count(category: string, weekOf: string): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = getDb();

  const [row] = await db
    .select({ n: count() })
    .from(aiDocumentAssessments)
    .where(
      and(
        eq(aiDocumentAssessments.category, category),
        eq(aiDocumentAssessments.weekOf, weekOf),
        eq(aiDocumentAssessments.pass, 1),
      ),
    );

  return row?.n ?? 0;
}

/**
 * Get URLs that already have Pass 1 assessments for a specific category and model.
 * Used to skip redundant API calls during backfill.
 */
export async function getExistingPass1Urls(
  urls: string[],
  model: string,
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
          eq(aiDocumentAssessments.model, model),
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
          erosionType: r.erosionType ?? undefined,
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

  // Compute from weekly rates during the baseline period
  const rows = await db.execute(sql`
    SELECT
      ${aiDocumentAssessments.weekOf} AS week_of,
      COUNT(*) FILTER (WHERE ${aiDocumentAssessments.relevant} = true)::float
        / NULLIF(COUNT(*)::float, 0) AS flag_rate
    FROM ${aiDocumentAssessments}
    WHERE ${aiDocumentAssessments.category} = ${category}
      AND ${aiDocumentAssessments.pass} = 1
      AND ${aiDocumentAssessments.weekOf} IN (
        SELECT DISTINCT week_of FROM ${aiDocumentAssessments}
        WHERE category = ${category}
        LIMIT 52
      )
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

export interface Pass2Gap {
  url: string;
  signals: string[];
  erosionType: string;
  title: string | null;
  content: string | null;
}

/**
 * Find Pass 1 flagged docs missing a non-audit Pass 2 assessment.
 */
export async function findPass2Gaps(category: string, weekOf: string): Promise<Pass2Gap[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT a1.url, a1.signals, a1.erosion_type, d.title, d.content
    FROM ${aiDocumentAssessments} a1
    JOIN ${documents} d ON d.url = a1.url AND d.category = a1.category
    WHERE a1.pass = 1
      AND a1.relevant = true
      AND a1.category = ${category}
      AND a1.week_of = ${weekOf}
      AND NOT EXISTS (
        SELECT 1 FROM ${aiDocumentAssessments} a2
        WHERE a2.url = a1.url AND a2.category = a1.category
          AND a2.pass = 2 AND a2.is_audit_sample = false
      )
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    url: r.url as string,
    signals: (r.signals as string[]) ?? [],
    erosionType: (r.erosion_type as string) ?? 'unknown',
    title: r.title as string | null,
    content: r.content as string | null,
  }));
}
