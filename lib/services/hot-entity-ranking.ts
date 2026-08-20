/**
 * Pure half of the hot-entity salience index (#757): per-doc merge,
 * ranking, and composite embedding text. The I/O sweep lives in
 * lib/cron/refresh-hot-entities.ts.
 */

import type { EntityClass, ExtractedPhrase } from '@/lib/services/entity-extraction';

/** Entities kept per weekly refresh (pre-validation ranking cut). */
export const MAX_HOT_ENTITIES = 1500;
/** Mention docs retained per entity — the query-time pool join's right side.
 *  Bounded so ubiquitous entities cannot bloat the junction table. */
export const MAX_MENTION_DOCS = 500;
/** A mention inside the trailing-N-weeks counts double in ranking: the
 *  eligibility window is the whole term (a spring-2025 case must stay
 *  findable), but this week's subjects should outrank faded ones. */
export const RECENT_WEIGHT = 2;
export const RECENT_WINDOW_WEEKS = 8;

export interface HotEntityEntry {
  phrase: string;
  entityClass: EntityClass;
  docFreqTerm: number;
  docFreqRecent: number;
  /** Mentions in BASELINE-period docs — the novelty denominator. Legal
   *  boilerplate (Ashcroft v. Iqbal, EO 12866) recurs in every era;
   *  marquee entities are NEW to this term. Measured in the first local
   *  dry-run, where pure term frequency ranked standard-of-review cites
   *  and regulatory-review EOs above everything newsworthy. */
  docFreqBaseline: number;
  mentionDocIds: number[];
  categoryCounts: Record<string, number>;
}

/** Top categories kept per entity in the index. */
export const MAX_ENTITY_CATEGORIES = 3;

export function topCategories(e: HotEntityEntry): string[] {
  return Object.entries(e.categoryCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ENTITY_CATEGORIES)
    .map(([c]) => c);
}

/** Merge one document's extracted phrases into the sweep accumulator. */
export function mergeDocExtraction(
  acc: Map<string, HotEntityEntry>,
  doc: { id: number; title: string; publishedAt: string | null; category?: string | null },
  phrases: ExtractedPhrase[],
  recentCutoffIso: string,
): void {
  const isRecent = Boolean(doc.publishedAt && doc.publishedAt >= recentCutoffIso);
  for (const p of phrases) {
    const key = p.phrase.toLowerCase();
    let entry = acc.get(key);
    if (entry) {
      entry.docFreqTerm++;
      if (isRecent) entry.docFreqRecent++;
      if (entry.mentionDocIds.length < MAX_MENTION_DOCS) entry.mentionDocIds.push(doc.id);
    } else {
      entry = {
        phrase: p.phrase,
        entityClass: p.entityClass,
        docFreqTerm: 1,
        docFreqRecent: isRecent ? 1 : 0,
        docFreqBaseline: 0,
        mentionDocIds: [doc.id],
        categoryCounts: {},
      };
      acc.set(key, entry);
    }
    if (doc.category) {
      entry.categoryCounts[doc.category] = (entry.categoryCounts[doc.category] ?? 0) + 1;
    }
  }
}

/** Fold a baseline-period sweep's frequencies into the term accumulator's
 *  novelty denominators (phrases absent from the term map are irrelevant). */
export function applyBaselineFrequencies(
  acc: Map<string, HotEntityEntry>,
  baselineFreq: Map<string, number>,
): void {
  for (const [key, freq] of baselineFreq) {
    const entry = acc.get(key);
    if (entry) entry.docFreqBaseline = freq;
  }
}

/** Novelty-weighted salience: term recurrence divided by baseline presence
 *  (era-invariant boilerplate collapses toward zero), log-damped, with a
 *  mild recency boost. Ties broken by phrase for deterministic output. */
export function hotEntityScore(e: HotEntityEntry): number {
  const novelty = e.docFreqTerm / (1 + e.docFreqBaseline);
  const recencyBoost = 1 + RECENT_WEIGHT * (e.docFreqRecent / e.docFreqTerm);
  return novelty * Math.log(e.docFreqTerm + 1) * recencyBoost;
}

export function rankHotEntities(
  acc: Map<string, HotEntityEntry>,
  minDocFreq: number,
  max: number = MAX_HOT_ENTITIES,
): HotEntityEntry[] {
  return [...acc.values()]
    .filter((e) => e.docFreqTerm >= minDocFreq)
    .sort((a, b) => hotEntityScore(b) - hotEntityScore(a) || a.phrase.localeCompare(b.phrase))
    .slice(0, max);
}
