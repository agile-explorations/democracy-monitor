/**
 * Category-week grouping for late-arriving documents (#825, R-LATE-ARRIVAL).
 *
 * Sources publish late — GAO reports captured by the Internet Archive months
 * after release, FR/OIG/GovInfo items that surface the Monday after their
 * week closed, CHRG transcripts dated by the hearing HELD date. The snapshot
 * stores and scores every item at its true `published_at` week, so L2 and
 * the weekly aggregate must be derived per (category, week) the batch
 * actually touched — not once under the run's anchor week, which stamped
 * every late verdict into the wrong week and left the old week's aggregate
 * stale (G2b digest holds three Mondays running).
 *
 * One shared definition replaces the CPD and CHRG copies. Pure — unit-tested.
 */

import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import type { StatusFlip } from '@/lib/services/pipeline-repair-gates';
import type { CategoryWeek } from '@/lib/services/reconciliation-plan';
import type { ContentItem } from '@/lib/types';
import { getMonday } from '@/lib/utils/date-utils';

export interface GroupableItem {
  item: ContentItem;
  categories: string[];
}

export interface GroupingOptions {
  /** The run's last completed week — the newest week any group may carry. */
  anchorWeekOf: string;
  /** Categories that always get an anchor group, even when empty: a 0-document
   *  week is valid data and must still produce an aggregate row (#567). */
  ensureAnchorFor?: string[];
}

export type CategoryWeekGroups = Map<string, ContentItem[]>;

export interface GroupingResult {
  groups: CategoryWeekGroups;
  /** Items dated after the anchor week (the in-progress week): left for the
   *  sweep that runs once their week completes — never derived early
   *  (the 2026-08-28 partial-week lesson). */
  deferredFutureItems: number;
}

export function categoryWeekKey(category: string, weekOf: string): string {
  return `${category}|${weekOf}`;
}

export function parseCategoryWeekKey(key: string): CategoryWeek {
  const [category, weekOf] = key.split('|');
  return { category, weekOf };
}

/** Monday of the item's publish date; undated items belong to the anchor week. */
function itemWeekOf(item: ContentItem, anchorWeekOf: string): string {
  if (!item.pubDate) return anchorWeekOf;
  const parsed = new Date(item.pubDate);
  return Number.isNaN(parsed.getTime()) ? anchorWeekOf : getMonday(parsed);
}

export function groupItemsByCategoryWeek(
  entries: GroupableItem[],
  opts: GroupingOptions,
): GroupingResult {
  const groups: CategoryWeekGroups = new Map();
  for (const category of opts.ensureAnchorFor ?? []) {
    groups.set(categoryWeekKey(category, opts.anchorWeekOf), []);
  }
  let deferredFutureItems = 0;
  for (const { item, categories } of entries) {
    const weekOf = itemWeekOf(item, opts.anchorWeekOf);
    if (weekOf > opts.anchorWeekOf) {
      deferredFutureItems++;
      continue;
    }
    for (const category of categories) {
      const key = categoryWeekKey(category, weekOf);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
  }
  return { groups, deferredFutureItems };
}

/** Split groups at the current-term boundary: the cron derives current-term
 *  weeks itself; baseline weeks are reported for owner-approved repair. */
export function partitionGroupsByTerm(
  groups: CategoryWeekGroups,
  from: string = T2_INAUGURATION,
): { current: CategoryWeekGroups; baseline: CategoryWeekGroups } {
  const current: CategoryWeekGroups = new Map();
  const baseline: CategoryWeekGroups = new Map();
  for (const [key, items] of groups) {
    (parseCategoryWeekKey(key).weekOf < from ? baseline : current).set(key, items);
  }
  return { current, baseline };
}

/** Per-category view of a multi-category grouping, for callers that derive
 *  one category at a time (CPD, CHRG). */
export function splitGroupsByCategory(groups: CategoryWeekGroups): Map<string, CategoryWeekGroups> {
  const byCategory = new Map<string, CategoryWeekGroups>();
  for (const [key, items] of groups) {
    const { category } = parseCategoryWeekKey(key);
    const bucket = byCategory.get(category) ?? new Map<string, ContentItem[]>();
    bucket.set(key, items);
    byCategory.set(category, bucket);
  }
  return byCategory;
}

/** Anchor week last: old weeks re-derive first so the failure list keeps its
 *  usual shape when only the anchor week is present. */
export function orderKeysAnchorLast(keys: Iterable<string>, anchorWeekOf: string): string[] {
  const sorted = [...keys].sort();
  const isAnchor = (k: string) => parseCategoryWeekKey(k).weekOf === anchorWeekOf;
  return [...sorted.filter((k) => !isAnchor(k)), ...sorted.filter(isAnchor)];
}

/** Flips attributable to this category's re-derived OLD weeks: other
 *  categories' movement and a first derivation ("(none) → X") are noise. */
export function lateArrivalFlips(
  flips: StatusFlip[],
  category: string,
  oldWeeks: string[],
): StatusFlip[] {
  const weeks = new Set(oldWeeks);
  return flips.filter((f) => f.category === category && weeks.has(f.weekOf) && f.from !== '(none)');
}
