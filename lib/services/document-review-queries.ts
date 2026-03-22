import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments, documents } from '@/lib/db/schema';

export interface Pass2Gap {
  url: string;
  signals: string[];
  erosionType: string;
  title: string | null;
  content: string | null;
  sourceType: string | null;
}

/**
 * Find Pass 1 flagged docs missing a non-audit Pass 2 assessment.
 */
export async function findPass2Gaps(category: string, weekOf: string): Promise<Pass2Gap[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT a1.url, a1.signals, a1.erosion_type, d.title, d.content, d.source_type
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
    sourceType: (r.source_type as string) ?? null,
  }));
}

/**
 * Find all category-weeks that have P1-flagged docs missing a non-audit Pass 2.
 * Optional filters narrow to a specific category and/or date range.
 */
export async function findPass2GapWeeks(
  category?: string,
  from?: string,
  to?: string,
): Promise<Array<{ category: string; weekOf: string; gapCount: number }>> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const conditions = [
    sql`a1.pass = 1`,
    sql`a1.relevant = true`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${aiDocumentAssessments} a2
      WHERE a2.url = a1.url AND a2.category = a1.category
        AND a2.pass = 2 AND a2.is_audit_sample = false
    )`,
  ];
  if (category) conditions.push(sql`a1.category = ${category}`);
  if (from) conditions.push(sql`a1.week_of >= ${from}`);
  if (to) conditions.push(sql`a1.week_of < ${to}`);

  const rows = await db.execute(sql`
    SELECT a1.category, a1.week_of, count(*)::int as gap_count
    FROM ${aiDocumentAssessments} a1
    JOIN ${documents} d ON d.url = a1.url AND d.category = a1.category
    WHERE ${sql.join(conditions, sql` AND `)}
      AND d.content IS NOT NULL AND length(d.content) >= 100
    GROUP BY a1.category, a1.week_of
    ORDER BY a1.category, a1.week_of
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    category: r.category as string,
    weekOf: String(r.week_of).slice(0, 10),
    gapCount: r.gap_count as number,
  }));
}
