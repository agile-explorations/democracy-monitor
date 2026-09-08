/**
 * R-TIPWIRE-3 beat scope retrieval (#869): no query, no embedding, no
 * reranker. The queue (./beat-docs) has already chosen the documents —
 * Pass 2 verdicts on the beat category — so this only loads them in queue
 * order, marks the beat categories, and fetches the weekly structural line
 * for the beat week. Read-only on documents.
 */

import { withRequestDbGate } from '@/lib/services/db-work-gate';
import { fetchResearchDocsByIds } from '@/lib/services/search-service';
import type { ResearchDocument } from '@/lib/types/search';
import { fetchStructuralLines, retrievalWindow } from './match';
import type { MatchDeps, MatchResult, RankedDoc, RetrievalScope } from './match';
import { categoryLabels } from './roster';
import type { CategoryKey } from './roster';

export interface BeatDeps {
  byIds: (ids: number[]) => Promise<ResearchDocument[]>;
  structural: MatchDeps['structural'];
  now: Date;
}

const defaultDeps = (): BeatDeps => ({
  byIds: (ids) => withRequestDbGate(1, () => fetchResearchDocsByIds(ids)),
  structural: fetchStructuralLines,
  now: new Date(),
});

/** Queue order is the rank; beat-category docs are marked, never re-sorted. */
export function rankBeatDocs(
  docs: ResearchDocument[],
  order: readonly number[],
  categories: readonly string[],
): RankedDoc[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const ordered = order.map((id) => byId.get(id)).filter((d): d is ResearchDocument => !!d);
  const n = ordered.length;
  return ordered.map((d, i) => ({
    ...d,
    priorBoosted: categories.includes(d.category),
    matchScore: (n - i) / n,
  }));
}

/** `categories`: the beat check's own category (R-TIPWIRE-4), or a reporter's beat. */
export async function retrieveBeatDocs(
  categories: readonly CategoryKey[],
  scope: RetrievalScope,
  deps: Partial<BeatDeps> = {},
): Promise<MatchResult> {
  const d = { ...defaultDeps(), ...deps };
  const started = Date.now();
  const ids = [...(scope.docIds ?? [])];
  const docs = ids.length > 0 ? await d.byIds(ids) : [];
  const ranked = rankBeatDocs(docs, ids, categories);
  const weekOf = scope.weekOf ?? d.now.toISOString().slice(0, 10);
  const structural = await d.structural([...categories], weekOf);
  return {
    query: categoryLabels([...categories]).join(', '),
    queryMode: 'title+categories',
    kind: 'beat',
    window: retrievalWindow(null, d.now, scope),
    docs: ranked,
    structural,
    meta: {
      retrieved: ranked.length,
      reranked: 0,
      boosted: ranked.filter((x) => x.priorBoosted).length,
      excluded: 0,
      minedAliases: 0,
      retrievalMs: Date.now() - started,
    },
  };
}
