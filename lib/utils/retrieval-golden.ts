/**
 * Retrieval-shape golden comparison (#782 WO-5) — the pure half of
 * scripts/retrieval-golden-diff.ts. A scheduling-only retrieval change must
 * leave every retrieval decision identical; this classifies a per-question
 * difference as drift (a decision changed) or known noise.
 */

export interface RetrievalShape {
  id: string;
  q: string;
  /** Final document ids in served order. */
  documents: number[];
  /** Pre-rerank candidates with arm provenance. */
  candidates: Array<{ id: number; matchedAlias: string | null; era: string | null }>;
  /** The debug trace's validated expansion terms per window. */
  validated: Array<{ window: string; phrases: string[] }>;
  /** The production "also searched" chips (validated terms actually used). */
  alsoSearched: string[];
}

export interface ShapeDiff {
  /** Retrieval-decision fields — any difference is shape drift. */
  drift: string[];
  /** Known-nondeterministic fields, reported but not gating: the final
   *  order comes from an uncached LLM reranker; the trace's validated list
   *  re-runs the uncached narrowing proposal. */
  noise: string[];
}

/** Stable sort by era: the era path appends each window's candidates as
 *  that window finishes, so cross-era order is completion order, not a
 *  retrieval decision; intra-era order (the pool ranking) is preserved. */
function byEra(c: RetrievalShape['candidates']): RetrievalShape['candidates'] {
  return [...c].sort((a, b) => (a.era ?? '').localeCompare(b.era ?? ''));
}

/** Field-by-field differences for one question. Pure. */
export function diffShapes(a: RetrievalShape, b: RetrievalShape): ShapeDiff {
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const drift: string[] = [];
  const noise: string[] = [];
  if (!same(byEra(a.candidates), byEra(b.candidates))) {
    drift.push('candidatesPreRerank (ids/provenance)');
  }
  if (!same(a.alsoSearched, b.alsoSearched)) drift.push('alsoSearched (validated terms)');
  if (!same(a.documents, b.documents)) noise.push('documents (reranker order)');
  if (!same(a.validated, b.validated)) noise.push('trace validated (narrowing draw)');
  return { drift, noise };
}
