/**
 * Admission chains for the expensive search paths (#792 #793 #794), shared
 * by /api/search (uncached builds) and /api/search/stream (Sonnet streams).
 * Cheapest check first; every rejection releases what it claimed and writes
 * the response, so callers only need `if (!admitted) return`.
 *
 * Build: per-question coalescing (#729) → global slots (#729) → per-source
 * slot (#793) → daily spend (#794). Coalesced retries wait-poll on 202 and
 * never count as spend — only a build that actually starts does.
 */

import type { NextApiResponse } from 'next';
import {
  claimBuildSlot,
  claimGlobalBuildSlot,
  releaseBuildSlot,
  releaseGlobalBuildSlot,
  respondBuilding,
} from '@/lib/services/search-docs-response';
import type { SearchSource } from '@/lib/services/search-pass';
import {
  claimSourceSlot,
  releaseSourceSlot,
  respondSourceBusy,
} from '@/lib/services/search-source-slots';
import { admitSpend, respondSpend } from '@/lib/services/search-spend-budget';

export interface BuildAdmission {
  globalSlot: number | null;
  coalesce: boolean;
  docsHash: string;
  sourceId: string;
}

function releaseQueueSlots(a: Pick<BuildAdmission, 'globalSlot' | 'coalesce' | 'docsHash'>): void {
  if (!a.coalesce) return;
  releaseBuildSlot(a.docsHash);
  if (a.globalSlot !== null) releaseGlobalBuildSlot(a.globalSlot);
}

/** Our own harness credential gets the machine ceiling (#803); everyone else the public one. */
function spendKind(source: SearchSource): 'source' | 'machine' {
  return source.kind === 'machine' ? 'machine' : 'source';
}

export async function admitBuild(
  res: NextApiResponse,
  source: SearchSource,
  docsHash: string,
  coalesce: boolean,
): Promise<BuildAdmission | null> {
  let globalSlot: number | null = null;
  if (coalesce) {
    if (!(await claimBuildSlot(docsHash))) {
      respondBuilding(res);
      return null;
    }
    // The hash slot is released first so the retry can claim both when
    // capacity frees.
    globalSlot = await claimGlobalBuildSlot();
    if (globalSlot === null) {
      releaseBuildSlot(docsHash);
      respondBuilding(res);
      return null;
    }
  }
  const queue = { globalSlot, coalesce, docsHash };
  if (!(await claimSourceSlot('build', source.id))) {
    releaseQueueSlots(queue);
    respondSourceBusy(res, 'build');
    return null;
  }
  const spend = await admitSpend('build', source.id, new Date(), spendKind(source));
  if (!spend.ok) {
    void releaseSourceSlot('build', source.id);
    releaseQueueSlots(queue);
    respondSpend(res, spend);
    return null;
  }
  return { ...queue, sourceId: source.id };
}

export function releaseBuild(a: BuildAdmission): void {
  void releaseSourceSlot('build', a.sourceId);
  releaseQueueSlots(a);
}

/** Stream: one per source at a time (#793), within the daily budget (#794). */
export async function admitStream(res: NextApiResponse, source: SearchSource): Promise<boolean> {
  if (!(await claimSourceSlot('stream', source.id))) {
    respondSourceBusy(res, 'stream');
    return false;
  }
  const spend = await admitSpend('stream', source.id, new Date(), spendKind(source));
  if (!spend.ok) {
    void releaseSourceSlot('stream', source.id);
    respondSpend(res, spend);
    return false;
  }
  return true;
}

export function releaseStream(source: SearchSource): void {
  void releaseSourceSlot('stream', source.id);
}
