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
 * ~100 matches compete at near-full weight; only genuinely broad ones are
 * damped. Calibration matters: against a 150-deep primary arm under RRF
 * k=60, an arm needs weight > ~0.67 for its rank-1 doc to surface at all —
 * steeper curves silently zero out every alias arm.
 */
export function armWeight(matches: number): number {
  return 1 / (1 + Math.log10(1 + matches / 100));
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
