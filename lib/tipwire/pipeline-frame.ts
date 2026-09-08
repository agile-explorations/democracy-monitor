/**
 * R-TIPWIRE pipeline frames (split from ./pipeline for the size limit): what
 * one check is about — the anchor article, the reporters it concerns, the
 * retrieval scope, and the same-story titles the judge sees.
 *
 * A beat check (R-TIPWIRE-4 #876) concerns every reporter on the category;
 * the anchor's reporter is the first of them. Titles are loaded per reporter
 * so the prompt can show, per name, what was written — or that no feed exists.
 */

import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import { isReactive } from './acquire';
import type { DiscoveredArticle } from './acquire';
import type { RetrievalScope } from './match';
import { RECENT_TITLES_DAYS } from './prompt';
import type { CategoryKey, ReporterEntry } from './roster';

export interface Frame {
  article: DiscoveredArticle;
  /** The anchor's reporter; on a beat check the first of `reporters`. */
  reporter: ReporterEntry;
  /** Every reporter the check concerns (beat: all on the category; otherwise [reporter]). */
  reporters: ReporterEntry[];
  reactive: boolean;
  scope: RetrievalScope;
  /** Union of the reporters' same-story titles. */
  recentTitles: string[];
  titlesByReporter: Map<string, string[]>;
}

/** Stored same-story titles for one reporter (the poll reads tip_articles). */
export type RecentTitlesLoader = (
  article: DiscoveredArticle,
  reporterId: string,
) => Promise<string[]>;

/** The reporter's other titles within RECENT_TITLES_DAYS of this article. */
export function recentTitlesFor(article: DiscoveredArticle, all: DiscoveredArticle[]): string[] {
  const t0 = article.publishedAt ? new Date(article.publishedAt).getTime() : null;
  return (
    all
      // Beat anchors are placeholders, never titles the reporter wrote.
      .filter((a) => a.reporterId === article.reporterId && a.articleKey !== article.articleKey)
      .filter((a) => a.attribution !== 'beat')
      .filter((a) => {
        if (t0 === null || !a.publishedAt) return true;
        return Math.abs(new Date(a.publishedAt).getTime() - t0) <= RECENT_TITLES_DAYS * ONE_DAY_MS;
      })
      .map((a) => a.title)
  );
}

/** Forward: window start (last check or article date). Beat: the beat week. Contradiction: none. */
export function sinceFor(f: Frame): string | null {
  if (f.scope.kind === 'forward') return f.scope.since ?? f.article.publishedAt;
  if (f.scope.kind === 'beat') return f.scope.weekOf ?? null;
  return null;
}

/** The categories a beat check ran on: its own category, else the anchor reporter's beat. */
export function beatCategoriesOf(f: Frame): CategoryKey[] {
  return f.scope.category ? [f.scope.category] : f.reporter.categories;
}

function reportersOf(
  reporter: ReporterEntry,
  scope: RetrievalScope,
  roster: Map<string, ReporterEntry>,
): ReporterEntry[] {
  const listed = (scope.reporterIds ?? [])
    .map((id) => roster.get(id))
    .filter((r): r is ReporterEntry => r !== undefined);
  return listed.length > 0 ? listed : [reporter];
}

export async function buildFrame(
  article: DiscoveredArticle,
  reporter: ReporterEntry,
  all: DiscoveredArticle[],
  roster: Map<string, ReporterEntry>,
  scope: RetrievalScope,
  load: RecentTitlesLoader | undefined,
  now: Date,
): Promise<Frame> {
  const reporters = reportersOf(reporter, scope, roster);
  const titlesByReporter = new Map<string, string[]>();
  for (const r of reporters) {
    const batch = r.id === article.reporterId ? recentTitlesFor(article, all) : [];
    // No feed → nothing stored; skip the lookup rather than confirm the absence.
    const stored = load && r.feed !== null ? await load(article, r.id) : [];
    titlesByReporter.set(r.id, [
      ...new Set([...batch, ...stored.filter((t) => t !== article.title)]),
    ]);
  }
  return {
    article,
    reporter,
    reporters,
    // A beat anchor is dated to its Monday; it is never a send-today article.
    reactive: scope.kind === 'beat' ? false : isReactive(article.publishedAt, now),
    scope,
    recentTitles: [...new Set([...titlesByReporter.values()].flat())],
    titlesByReporter,
  };
}
