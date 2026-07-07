/**
 * Data-access helpers for the living term summary: latest weekly overview,
 * staleness detection, and weekly-overview excerpts for the significant-weeks
 * digest. Split from narrative-queries to keep each module focused.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { getStoredNarrative } from './narrative-store';

type Row = Record<string, unknown>;

/** Get the most recent stored weekly overview narrative and its week. */
export async function getLatestWeeklyNarrative(): Promise<{
  weekOf: string;
  expert: string;
  public: string;
} | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT week_of FROM narratives
    WHERE category = ${OVERVIEW_CATEGORY} AND version = 'expert'
    ORDER BY week_of DESC LIMIT 1
  `);
  const row = (rows.rows as Row[])[0];
  if (!row) return null;
  const weekOf = String(row.week_of).slice(0, 10);
  const [expert, pub] = await Promise.all([
    getStoredNarrative(OVERVIEW_CATEGORY, weekOf, 'expert'),
    getStoredNarrative(OVERVIEW_CATEGORY, weekOf, 'public'),
  ]);
  if (!expert && !pub) return null;
  return { weekOf, expert: expert?.content ?? '', public: pub?.content ?? '' };
}

/**
 * Freshness of the living term summary: stale when any weekly aggregate in the
 * term (week_of >= since) was computed after the summary was generated. Every
 * correction path bumps computed_at, so staleness needs no explicit flag.
 */
export async function getTermSummaryFreshness(since: string): Promise<{
  stale: boolean;
  latestAggregateAt: Date | null;
  generatedAt: Date | null;
}> {
  if (!isDbAvailable()) return { stale: false, latestAggregateAt: null, generatedAt: null };
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
      (SELECT max(computed_at) FROM weekly_aggregates WHERE week_of >= ${since}) AS latest_aggregate,
      (SELECT max(generated_at) FROM narratives
        WHERE category = ${TERM_SUMMARY_CATEGORY} AND version = 'expert') AS generated_at
  `);
  const row = (rows.rows as Row[])[0];
  const latestAggregateAt = row?.latest_aggregate ? new Date(row.latest_aggregate as string) : null;
  const generatedAt = row?.generated_at ? new Date(row.generated_at as string) : null;
  const stale =
    latestAggregateAt !== null && (generatedAt === null || latestAggregateAt > generatedAt);
  return { stale, latestAggregateAt, generatedAt };
}

/** Short weekly-overview excerpts (public version preferred) for the given weeks. */
export async function getOverviewExcerpts(
  weekOfs: string[],
  maxChars = 280,
): Promise<Map<string, string>> {
  const excerpts = new Map<string, string>();
  if (!isDbAvailable() || weekOfs.length === 0) return excerpts;
  const db = getDb();
  const weekList = sql.join(
    weekOfs.map((w) => sql`${w}`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    SELECT week_of, version, content FROM narratives
    WHERE category = ${OVERVIEW_CATEGORY}
      AND version IN ('public', 'expert')
      AND week_of IN (${weekList})
  `);
  const byWeek = new Map<string, { public?: string; expert?: string }>();
  for (const r of rows.rows as Row[]) {
    const week = String(r.week_of).slice(0, 10);
    if (!byWeek.has(week)) byWeek.set(week, {});
    byWeek.get(week)![r.version as 'public' | 'expert'] = r.content as string;
  }
  for (const [week, versions] of byWeek) {
    const content = versions.public ?? versions.expert ?? '';
    if (content) excerpts.set(week, content.slice(0, maxChars));
  }
  return excerpts;
}
