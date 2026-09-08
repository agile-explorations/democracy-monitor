/**
 * R-TIPWIRE-3 beat queue (#869): which documents each active reporter's beat
 * check should see. Input is the pipeline's own Pass 2 review — documents in
 * the reporter's categories rated potentially/clearly concerning — new since
 * the reporter's last beat check, minus anything already cited for them.
 * Pass 2 lands with the weekly snapshot, so this is weekly by construction:
 * ≤ 1 judge call per reporter per new week. Read-only on documents.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import type { DiscoveredArticle } from './acquire';
import type { ReporterEntry } from './roster';

export const BEAT_MAX_DOCS = 10;
/** A reporter never beat-checked starts from this far back. */
export const BEAT_LOOKBACK_DAYS = 14;
const WEEK_MS = 7 * ONE_DAY_MS;

export interface FlaggedDoc {
  id: number;
  weekOf: string;
}

export interface BeatLoaders {
  /** Newest `since_at` among the reporter's beat candidates, as YYYY-MM-DD. */
  lastBeatWeek: (reporterId: string) => Promise<string | null>;
  /** Every document already cited for this reporter, any watch kind. */
  citedDocIds: (reporterId: string) => Promise<number[]>;
  /** Concerning Pass 2 docs in the categories with week_of in [from, to), best first. */
  flaggedDocs: (
    categories: readonly string[],
    weekFrom: string,
    weekTo: string | null,
    exclude: readonly number[],
    limit: number,
  ) => Promise<FlaggedDoc[]>;
}

export interface BeatQueueItem {
  reporter: ReporterEntry;
  /** The beat week the check is attributed to (newest week_of among the docs). */
  weekOf: string;
  docIds: number[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** In-memory article stand-in so runPipeline, cadence, packet, and score work unchanged. Never stored. */
export function beatAnchor(reporter: ReporterEntry, weekOf: string): DiscoveredArticle {
  return {
    reporterId: reporter.id,
    outlet: reporter.outlet,
    articleKey: `beat:${reporter.id}:${weekOf}`,
    url: null,
    title: `Beat check — week of ${weekOf}`,
    lede: null,
    ledeSource: 'none',
    publishedAt: `${weekOf}T00:00:00.000Z`,
    feedStrategy: 'rss',
    attribution: 'beat',
    coauthorCount: 0,
    rawMeta: {},
  };
}

/** Poll queue: one item per reporter with new flagged documents since the last beat week. */
export async function listBeatQueue(
  reporters: ReporterEntry[],
  now: Date,
  loaders: BeatLoaders = dbLoaders(),
): Promise<BeatQueueItem[]> {
  const out: BeatQueueItem[] = [];
  for (const reporter of reporters) {
    const last = await loaders.lastBeatWeek(reporter.id);
    const weekFrom = last
      ? day(new Date(new Date(last).getTime() + ONE_DAY_MS))
      : day(new Date(now.getTime() - BEAT_LOOKBACK_DAYS * ONE_DAY_MS));
    const cited = await loaders.citedDocIds(reporter.id);
    const docs = await loaders.flaggedDocs(
      reporter.categories,
      weekFrom,
      null,
      cited,
      BEAT_MAX_DOCS,
    );
    if (docs.length === 0) continue;
    const weekOf = docs
      .map((d) => d.weekOf)
      .sort()
      .at(-1) as string;
    out.push({ reporter, weekOf, docIds: docs.map((d) => d.id) });
  }
  return out;
}

/** Dry-run queue: one item per reporter × each of the last `weeks` Mondays, ignoring the last check. */
export async function listBeatWeeks(
  reporters: ReporterEntry[],
  weeks: number,
  now: Date,
  loaders: BeatLoaders = dbLoaders(),
): Promise<BeatQueueItem[]> {
  const mondays: string[] = [];
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let i = 0; i < weeks; i++) mondays.push(day(new Date(monday.getTime() - i * WEEK_MS)));
  const out: BeatQueueItem[] = [];
  for (const reporter of reporters) {
    const cited = await loaders.citedDocIds(reporter.id);
    for (const weekOf of mondays) {
      const weekTo = day(new Date(new Date(weekOf).getTime() + WEEK_MS));
      const docs = await loaders.flaggedDocs(
        reporter.categories,
        weekOf,
        weekTo,
        cited,
        BEAT_MAX_DOCS,
      );
      if (docs.length > 0) out.push({ reporter, weekOf, docIds: docs.map((d) => d.id) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB loaders (read-only on documents)
// ---------------------------------------------------------------------------

/** Concerning Pass 2 docs in the categories with week_of in [from, to), best first. */
async function loadFlaggedDocs(
  categories: readonly string[],
  weekFrom: string,
  weekTo: string | null,
  exclude: readonly number[],
  limit: number,
): Promise<FlaggedDoc[]> {
  if (categories.length === 0) return [];
  const cats = sql.join(
    categories.map((c) => sql`${c}`),
    sql`, `,
  );
  const excl =
    exclude.length > 0
      ? sql`AND d.id NOT IN (${sql.join(
          exclude.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const upper = weekTo ? sql`AND a.week_of < ${weekTo}` : sql``;
  const r = await getDb().execute(sql`
    SELECT id, week_of FROM (
      SELECT DISTINCT ON (d.id) d.id, a.week_of::text AS week_of, a.assessment, a.confidence
      FROM ai_document_assessments a
      JOIN documents d ON d.url = a.url AND d.category = a.category
      WHERE a.pass = 2 AND a.is_audit_sample IS NOT TRUE
        AND a.assessment IN ('potentially_concerning', 'clearly_concerning')
        AND a.category IN (${cats})
        AND a.week_of >= ${weekFrom} ${upper}
        AND d.parent_id IS NULL AND d.retrieval_relevant IS NOT FALSE
        ${excl}
      ORDER BY d.id, a.assessed_at DESC
    ) x
    ORDER BY (assessment = 'clearly_concerning') DESC, confidence DESC NULLS LAST, week_of DESC
    LIMIT ${limit}`);
  return (r.rows as Array<{ id: number; week_of: string }>).map((x) => ({
    id: Number(x.id),
    weekOf: x.week_of,
  }));
}

export function dbLoaders(): BeatLoaders {
  return {
    async lastBeatWeek(reporterId) {
      const r = await getDb().execute(sql`
        SELECT max(since_at)::date::text AS week FROM tip_candidates
        WHERE reporter_id = ${reporterId} AND watch_kind = 'beat'`);
      return (r.rows[0] as { week: string | null } | undefined)?.week ?? null;
    },
    async citedDocIds(reporterId) {
      const r = await getDb().execute(sql`
        SELECT c.tip_document_id AS id FROM tip_candidates c
        LEFT JOIN tip_articles a ON a.id = c.article_id
        WHERE COALESCE(c.reporter_id, a.reporter_id) = ${reporterId} AND c.tip_document_id IS NOT NULL`);
      return (r.rows as Array<{ id: number }>).map((x) => Number(x.id));
    },
    flaggedDocs: loadFlaggedDocs,
  };
}
