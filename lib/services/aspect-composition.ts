/**
 * Pool composition for stratified retrieval (#753/#756): round-robin
 * interleave of per-pool ranked slices, deduped by URL and instrument
 * identity, backfilled from each pool's ranked overflow to restore the doc
 * budget. Used by the read-and-follow-up loop to compose its recency
 * strata (full-history + current-term windows overlap, unlike era windows),
 * where the same EO or opinion routinely surfaces in both pools; a naive
 * concat-then-dedupe would both shrink the final count below budget and
 * skew representation toward whichever pool listed the duplicates first.
 * Pure; exported for tests.
 */

import { dedupeByInstrument, dedupeByUrl } from '@/lib/services/hybrid-fusion';
import type { ResearchDocument } from '@/lib/types/search';

export interface AspectPoolInput {
  /** Ranked docs this aspect wants in the final set (its slot share). */
  kept: ResearchDocument[];
  /** Remaining candidates in ranked/fusion order, for backfill. */
  overflow: ResearchDocument[];
}

/** Round-robin interleave: one doc per pool per round, skipping ids already
 *  taken, attributing each first occurrence to its pool. */
function interleave(
  lists: ResearchDocument[][],
  takenIds: Set<number>,
  poolOfDoc: Map<number, number>,
): ResearchDocument[] {
  const out: ResearchDocument[] = [];
  const cursors = lists.map(() => 0);
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (let i = 0; i < lists.length; i++) {
      while (cursors[i] < lists[i].length && takenIds.has(lists[i][cursors[i]].id)) cursors[i]++;
      if (cursors[i] >= lists[i].length) continue;
      const doc = lists[i][cursors[i]++];
      takenIds.add(doc.id);
      if (!poolOfDoc.has(doc.id)) poolOfDoc.set(doc.id, i);
      out.push(doc);
      advanced = true;
    }
  }
  return out;
}

export function composeAspectPools(
  pools: AspectPoolInput[],
  budget: number,
): { docs: ResearchDocument[]; docCounts: number[] } {
  const taken = new Set<number>();
  const poolOfDoc = new Map<number, number>();
  const primary = interleave(
    pools.map((p) => p.kept),
    taken,
    poolOfDoc,
  );
  let docs = dedupeByInstrument(dedupeByUrl(primary));
  if (docs.length < budget) {
    const backfill = interleave(
      pools.map((p) => p.overflow),
      taken,
      poolOfDoc,
    );
    docs = dedupeByInstrument(dedupeByUrl([...docs, ...backfill]));
  }
  docs = docs.slice(0, budget);
  const docCounts = pools.map((_, i) => docs.filter((d) => poolOfDoc.get(d.id) === i).length);
  return { docs, docCounts };
}
