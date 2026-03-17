/**
 * DB query functions for event validation.
 * Separated from event-validation-service.ts to respect file length limits.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getMonday } from '@/lib/utils/date-utils';
import { ALL_KNOWN_EVENTS } from '@/lib/validation/known-events';

export interface WeekRow {
  category: string;
  week_of: string;
  document_count: number;
  structural_score: number | null;
  ai_score: number | null;
  thematic_score: number | null;
  status: string | null;
  convergence_ai_elevated: boolean | null;
}

export interface EvidenceDoc {
  title: string;
  sourceType: string;
  assessment: string;
  erosionType: string | null;
  reasoning: string | null;
}

export async function fetchWeeklyData(
  from: string,
  to: string,
  categoryFilter?: string,
): Promise<WeekRow[]> {
  const db = getDb();
  const catClause = categoryFilter ? sql` AND category = ${categoryFilter}` : sql``;
  const result = await db.execute(sql`
    SELECT category, week_of, document_count,
      structural_score, ai_score, thematic_score,
      convergence_detail->>'status' as status,
      (convergence_detail->>'aiElevated')::boolean as convergence_ai_elevated
    FROM weekly_aggregates
    WHERE week_of >= ${from} AND week_of <= ${to}
    ${catClause}
    ORDER BY category, week_of
  `);
  return result.rows as unknown as WeekRow[];
}

export async function fetchP1FlagRates(
  from: string,
  to: string,
  categoryFilter?: string,
): Promise<Array<{ category: string; flagRate: number }>> {
  const db = getDb();
  const catClause = categoryFilter ? sql` AND d.category = ${categoryFilter}` : sql``;
  const result = await db.execute(sql`
    SELECT d.category,
      COUNT(DISTINCT d.id) as total_docs,
      COUNT(DISTINCT CASE WHEN p1.relevant = true THEN d.url END) as flagged
    FROM documents d
    LEFT JOIN ai_document_assessments p1
      ON d.url = p1.url AND d.category = p1.category AND p1.pass = 1
    WHERE d.published_at >= ${new Date(from)} AND d.published_at < ${new Date(to)}
      AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
      AND d.category != 'intent'
      ${catClause}
    GROUP BY d.category
  `);
  return (result.rows as Record<string, unknown>[]).map((r) => {
    const total = Number(r.total_docs);
    const flagged = Number(r.flagged);
    return { category: r.category as string, flagRate: total > 0 ? flagged / total : 0 };
  });
}

export async function fetchP2ConfirmationRate(from: string, to: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE a.assessment IN ('potentially_concerning', 'clearly_concerning')) as confirmed,
      COUNT(*) as total
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2 AND a.is_audit_sample = false
      AND d.published_at >= ${new Date(from)} AND d.published_at < ${new Date(to)}
      AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
  `);
  const row = result.rows[0] as Record<string, unknown>;
  const total = Number(row?.total ?? 0);
  return total > 0 ? Number(row?.confirmed ?? 0) / total : 0;
}

export async function fetchT2ConcerningRateOutsideEvents(): Promise<number> {
  const eventWeeks = new Set(
    ALL_KNOWN_EVENTS.filter((e) => e.period === 'trump_t2').map((e) => getMonday(new Date(e.date))),
  );
  const db = getDb();
  const result = await db.execute(sql`
    SELECT a.week_of,
      COUNT(*) FILTER (WHERE a.assessment = 'clearly_concerning') as concerning,
      COUNT(*) as total
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2 AND a.is_audit_sample = false
      AND d.published_at >= ${new Date('2025-01-20')}
      AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
    GROUP BY a.week_of
  `);
  let totalDocs = 0;
  let concerningDocs = 0;
  for (const row of result.rows as Record<string, unknown>[]) {
    if (eventWeeks.has(String(row.week_of).slice(0, 10))) continue;
    totalDocs += Number(row.total);
    concerningDocs += Number(row.concerning);
  }
  return totalDocs > 0 ? concerningDocs / totalDocs : 0;
}

export async function fetchT2RoutineRate(): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT d.id) as total_docs,
      COUNT(DISTINCT CASE WHEN p1.relevant = true THEN d.url END) as flagged
    FROM documents d
    LEFT JOIN ai_document_assessments p1
      ON d.url = p1.url AND d.category = p1.category AND p1.pass = 1
    WHERE d.published_at >= ${new Date('2025-01-20')}
      AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
      AND d.category != 'intent'
  `);
  const row = result.rows[0] as Record<string, unknown>;
  const total = Number(row?.total_docs ?? 0);
  const flagged = Number(row?.flagged ?? 0);
  return total > 0 ? (total - flagged) / total : 1;
}

export async function fetchWeekP1FlagRate(weekStart: string, weekEnd: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT d.id) as total_docs,
      COUNT(DISTINCT CASE WHEN p1.relevant = true THEN d.url END) as flagged
    FROM documents d
    LEFT JOIN ai_document_assessments p1
      ON d.url = p1.url AND d.category = p1.category AND p1.pass = 1
    WHERE d.published_at >= ${new Date(weekStart)} AND d.published_at < ${new Date(weekEnd)}
      AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
      AND d.category != 'intent'
  `);
  const row = result.rows[0] as Record<string, unknown>;
  const total = Number(row?.total_docs ?? 0);
  return total > 0 ? Number(row?.flagged ?? 0) / total : 0;
}

export async function fetchEventEvidence(
  category: string,
  weekOf: string,
  limit = 3,
): Promise<EvidenceDoc[]> {
  const db = getDb();
  const weekEnd = new Date(weekOf);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const result = await db.execute(sql`
    SELECT d.title, d.source_type, a.assessment, a.erosion_type,
      LEFT(a.reasoning, 300) as reasoning
    FROM documents d
    JOIN ai_document_assessments a ON d.url = a.url AND d.category = a.category
    WHERE d.category = ${category} AND a.pass = 2
      AND a.assessment IN ('potentially_concerning', 'clearly_concerning')
      AND d.published_at >= ${new Date(weekOf)} AND d.published_at < ${weekEnd}
    ORDER BY CASE a.assessment WHEN 'clearly_concerning' THEN 0 ELSE 1 END, d.published_at
    LIMIT ${limit}
  `);
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    title: r.title as string,
    sourceType: r.source_type as string,
    assessment: r.assessment as string,
    erosionType: (r.erosion_type as string) || null,
    reasoning: (r.reasoning as string) || null,
  }));
}
