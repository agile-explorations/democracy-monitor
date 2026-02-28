import { and, count, eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments } from '@/lib/db/schema';
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
