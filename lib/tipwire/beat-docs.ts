/**
 * R-TIPWIRE beat queue (#869; per category since R-TIPWIRE-4 #875): which
 * documents each beat check should see. Input is the pipeline's own Pass 2
 * review — documents in a category rated potentially/clearly concerning —
 * new since that category's last beat check, minus anything already cited by
 * ANY candidate (one candidate per document, owner decision 2026-09-08).
 *
 * One check per category per new Pass 2 week, listing every active reporter
 * on the beat, feed or not: each document has exactly one category, so
 * reporters who share a beat never produce duplicate candidates. Pass 2 lands
 * with the weekly snapshot, so this is weekly by construction. Read-only on
 * documents.
 */

import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { ONE_DAY_MS, addDays, getMonday } from '@/lib/utils/date-utils';
import type { DiscoveredArticle } from './acquire';
import { categoryLabel, reportersForCategory } from './roster';
import type { CategoryKey, ReporterEntry } from './roster';

export const BEAT_MAX_DOCS = 10;
/** A category never beat-checked starts from this far back. */
export const BEAT_LOOKBACK_DAYS = 14;

export interface FlaggedDoc {
  id: number;
  weekOf: string;
}

export interface BeatLoaders {
  /** Newest `since_at` among the category's beat candidates, as YYYY-MM-DD (UTC).
   *  Rows written before the category column (per-reporter checks) do not count:
   *  their categories re-check once from the lookback, minus the cited docs. */
  lastBeatWeek: (category: CategoryKey) => Promise<string | null>;
  /** Every document already cited by any candidate — any kind, any reporter. */
  citedDocIds: () => Promise<number[]>;
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
  category: CategoryKey;
  /** Every reporter on the beat, roster order; the anchor is attributed to the first. */
  reporters: ReporterEntry[];
  /** The beat week the check is attributed to (newest week_of among the docs). */
  weekOf: string;
  docIds: number[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Categories any of the reporters covers, in CATEGORIES order. */
export function beatCategories(reporters: readonly ReporterEntry[]): CategoryKey[] {
  const covered = new Set(reporters.flatMap((r) => r.categories));
  return CATEGORIES.map((c) => c.key).filter((k) => covered.has(k));
}

/** In-memory article stand-in so runPipeline, packet, and score work unchanged. Never stored. */
export function beatAnchor(
  category: CategoryKey,
  reporters: readonly ReporterEntry[],
  weekOf: string,
): DiscoveredArticle {
  const lead = reporters[0];
  if (!lead) throw new Error(`beat anchor for ${category} needs at least one reporter`);
  return {
    reporterId: lead.id,
    outlet: lead.outlet,
    articleKey: `beat:${category}:${weekOf}`,
    url: null,
    title: `Beat check — ${categoryLabel(category)} · week of ${weekOf}`,
    lede: null,
    ledeSource: 'none',
    publishedAt: `${weekOf}T00:00:00.000Z`,
    feedStrategy: 'rss',
    attribution: 'beat',
    coauthorCount: 0,
    rawMeta: {},
  };
}

async function queueItem(
  category: CategoryKey,
  reporters: ReporterEntry[],
  weekFrom: string,
  weekTo: string | null,
  cited: readonly number[],
  loaders: BeatLoaders,
): Promise<BeatQueueItem | null> {
  const docs = await loaders.flaggedDocs([category], weekFrom, weekTo, cited, BEAT_MAX_DOCS);
  if (docs.length === 0) return null;
  const weekOf = docs
    .map((d) => d.weekOf)
    .sort()
    .at(-1) as string;
  return { category, reporters, weekOf, docIds: docs.map((d) => d.id) };
}

/** Poll queue: one item per category with new flagged documents since its last beat week. */
export async function listBeatQueue(
  reporters: readonly ReporterEntry[],
  now: Date,
  loaders: BeatLoaders = dbLoaders(),
): Promise<BeatQueueItem[]> {
  const cited = await loaders.citedDocIds();
  const out: BeatQueueItem[] = [];
  for (const category of beatCategories(reporters)) {
    const onBeat = reportersForCategory(reporters, category);
    const last = await loaders.lastBeatWeek(category);
    const weekFrom = last
      ? addDays(last, 1)
      : day(new Date(now.getTime() - BEAT_LOOKBACK_DAYS * ONE_DAY_MS));
    const item = await queueItem(category, onBeat, weekFrom, null, cited, loaders);
    if (item) out.push(item);
  }
  return out;
}

/** Dry-run queue: one item per category × each of the last `weeks` Mondays, ignoring the last check. */
export async function listBeatWeeks(
  reporters: readonly ReporterEntry[],
  weeks: number,
  now: Date,
  loaders: BeatLoaders = dbLoaders(),
): Promise<BeatQueueItem[]> {
  const monday = getMonday(now);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(monday, -7 * i));
  const cited = await loaders.citedDocIds();
  const out: BeatQueueItem[] = [];
  for (const category of beatCategories(reporters)) {
    const onBeat = reportersForCategory(reporters, category);
    for (const weekOf of mondays) {
      const weekTo = addDays(weekOf, 7);
      const item = await queueItem(category, onBeat, weekOf, weekTo, cited, loaders);
      if (item) out.push(item);
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
    async lastBeatWeek(category) {
      const r = await getDb().execute(sql`
        SELECT to_char(max(since_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS week FROM tip_candidates
        WHERE watch_kind = 'beat' AND beat_category = ${category}`);
      return (r.rows[0] as { week: string | null } | undefined)?.week ?? null;
    },
    async citedDocIds() {
      const r = await getDb().execute(sql`
        SELECT DISTINCT tip_document_id AS id FROM tip_candidates WHERE tip_document_id IS NOT NULL`);
      return (r.rows as Array<{ id: number }>).map((x) => Number(x.id));
    },
    flaggedDocs: loadFlaggedDocs,
  };
}
