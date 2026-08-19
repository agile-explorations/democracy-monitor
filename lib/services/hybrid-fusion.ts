/**
 * Weighted Reciprocal Rank Fusion for hybrid retrieval (#702).
 *
 * Merges the primary (vector/combined-score) ranked list with per-alias
 * full-text arms. Pure functions — calibration validated by the combo canary
 * (scripts/eval-retrieval-combo.ts): baseline 88 → combo 143 hits with zero
 * per-case regressions on the corrected ground-truth set.
 */

export interface FusionCandidate {
  id: number;
  /** Matched-passage excerpt (ts_headline) — present on FTS-arm rows only. */
  matchSnippet?: string;
  /** The alias whose arm surfaced this row (transparency/debug). */
  matchedAlias?: string;
}

export interface FusionArm<T extends FusionCandidate> {
  items: T[];
  weight: number;
}

export const RRF_K = 60;

/**
 * IDF-style arm weight from an alias's corpus match count. Aliases under
 * ~250 matches compete at near-full weight; only genuinely broad ones are
 * damped. Calibration matters: against a 150-deep primary arm under RRF
 * k=60, an arm needs weight > ~0.67 for its rank-1 doc to surface at all —
 * steeper curves silently zero out every alias arm. Recalibrated n/100 →
 * n/250 in #750: mid-frequency entity aliases (a marquee case caption sits
 * at 100-400 corpus matches, e.g. "Cook" at 396 → old weight 0.60) were
 * admitted by the match cap but mathematically unable to surface — a dead
 * zone between admission and surfacing. New curve: n=200 → 0.80, n=400 →
 * 0.71, n=1000 → 0.59 (broad aliases stay damped).
 */
export function armWeight(matches: number): number {
  return 1 / (1 + Math.log10(1 + matches / 250));
}

/**
 * Weighted RRF (k=60): primary arm at weight 1, alias arms at armWeight().
 * Returns the fused top-K. Rows surfaced by multiple arms accumulate score;
 * snippet/alias metadata from FTS arms is merged onto the primary row so the
 * caller keeps full row data. With zero alias arms this returns the primary
 * list unchanged (pure-vector degradation).
 */
export function fuseWeightedRrf<T extends FusionCandidate>(
  primary: T[],
  aliasArms: FusionArm<T>[],
  topK: number,
): T[] {
  const byId = new Map<number, T>();
  const scores = new Map<number, number>();
  const arms: FusionArm<T>[] = [{ items: primary, weight: 1 }, ...aliasArms];
  for (const arm of arms) {
    arm.items.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + arm.weight / (RRF_K + rank + 1));
      const prev = byId.get(item.id);
      if (!prev) {
        byId.set(item.id, { ...item });
      } else {
        if (item.matchSnippet && !prev.matchSnippet) prev.matchSnippet = item.matchSnippet;
        if (item.matchedAlias && !prev.matchedAlias) prev.matchedAlias = item.matchedAlias;
      }
    });
  }
  return [...byId.values()]
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, topK);
}

/**
 * Post-fusion URL dedupe: the primary research arm is DISTINCT ON (url), but
 * alias arms can reintroduce the same document stored under multiple
 * categories (same url, different row id). Keeps the highest-fused-rank row
 * per URL; rows without a URL are kept individually.
 */
export function dedupeByUrl<T extends { id: number; url?: string | null }>(docs: T[]): T[] {
  const seen = new Set<string>();
  return docs.filter((d) => {
    const key = d.url ?? `id:${d.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fields the same-instrument dedupe (#734) reads. */
export interface InstrumentIdentity {
  id: number;
  title: string;
  publishedAt: string | null;
  sourceOrigin: string | null;
}

/**
 * Instrument-title normalization (#734): the Federal Register titles a
 * presidential document by its subject ("Improving Oversight of Federal
 * Grantmaking") while the CPD copy prefixes the instrument ("Executive Order
 * 14332—Improving Oversight of Federal Grantmaking", "Memorandum on …").
 * Stripping the prefix makes the two spellings collide. Exported for tests.
 */
export function normalizeInstrumentTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /^(executive order|proclamation|presidential determination|notice)\s*\d*\s*[—–-]+\s*/,
      '',
    )
    .replace(/^memorandum on\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The publication lag between a presidential document's signing date (CPD)
 *  and its Federal Register publication — observed 5-6 days; 7 bounds it
 *  without reaching the recurring-boilerplate titles that repeat across
 *  different appropriations acts a week or more apart. */
const INSTRUMENT_MIRROR_WINDOW_DAYS = 7;

const isMirrorPair = (a: string | null, b: string | null): boolean =>
  (a === 'federal_register' && b === 'govinfo_cpd') ||
  (a === 'govinfo_cpd' && b === 'federal_register');

const dayOf = (publishedAt: string | null): number | null => {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
};

/**
 * Same-instrument dedupe (#734): one physical instrument stored by two
 * sources must not burn two of the final slots (and must not surface two
 * independent — sometimes contradictory — P2 verdicts). Rules, deliberately
 * conservative:
 *  - same normalized title + same day → duplicates regardless of origin
 *    (covers CourtListener revision-cluster pairs);
 *  - same normalized title within INSTRUMENT_MIRROR_WINDOW_DAYS, only for
 *    the federal_register ↔ govinfo_cpd mirror pair (signing vs publication
 *    lag).
 * Keeps the higher-fused-rank row, except the Federal Register copy always
 * beats the CPD copy (full text vs the CPD rendition). Docs without a
 * parseable date only participate in the same-title-same-day rule when both
 * dates are null.
 */
export function dedupeByInstrument<T extends InstrumentIdentity>(docs: T[]): T[] {
  const byTitle = new Map<string, Array<{ doc: T; day: number | null; slot: number }>>();
  const kept: T[] = [];
  for (const doc of docs) {
    const norm = normalizeInstrumentTitle(doc.title);
    const day = dayOf(doc.publishedAt);
    const entries = byTitle.get(norm) ?? [];
    const match = entries.find((e) => {
      if (e.day === null || day === null) return e.day === day;
      if (e.day === day) return true;
      return (
        Math.abs(e.day - day) <= INSTRUMENT_MIRROR_WINDOW_DAYS &&
        isMirrorPair(e.doc.sourceOrigin, doc.sourceOrigin)
      );
    });
    if (!match) {
      entries.push({ doc, day, slot: kept.length });
      byTitle.set(norm, entries);
      kept.push(doc);
      continue;
    }
    // Duplicate: the FR copy wins in place; otherwise the earlier (higher
    // fused rank) row stays.
    if (doc.sourceOrigin === 'federal_register' && match.doc.sourceOrigin === 'govinfo_cpd') {
      kept[match.slot] = doc;
      match.doc = doc;
      match.day = day;
    }
  }
  return kept;
}
