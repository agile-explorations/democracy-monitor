/**
 * Per-source concurrency slots (#793): a single pass or machine token may
 * hold at most SEARCH_SOURCE_BUILD_SLOTS uncached builds (one in flight plus
 * one "oops, wrong question" — abandoned builds keep running to fill the
 * cache) and SEARCH_SOURCE_STREAM_SLOTS streams at once. The global build
 * slots (3) still cap the server; this stops one source from taking them
 * all. Counters self-heal via TTL if a process dies mid-build.
 */

import type { NextApiResponse } from 'next';
import { counterAdjust } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { envInt } from '@/lib/utils/env';

export type SlotKind = 'build' | 'stream';

export const SOURCE_SLOT_LIMITS: Record<SlotKind, number> = {
  build: envInt('SEARCH_SOURCE_BUILD_SLOTS', 2, 1, 10),
  stream: envInt('SEARCH_SOURCE_STREAM_SLOTS', 1, 1, 10),
};
/** Matches the in-flight marker TTL: a crashed build frees its slot then. */
const SLOT_TTL_SECONDS = 900;
const SOURCE_BUSY_RETRY_MS = 8_000;

/** Claim a slot for the source; false when it already holds its limit. */
export async function claimSourceSlot(kind: SlotKind, sourceId: string): Promise<boolean> {
  const key = CacheKeys.searchSourceSlot(kind, sourceId);
  const held = await counterAdjust(key, 1, SLOT_TTL_SECONDS);
  if (held <= SOURCE_SLOT_LIMITS[kind]) return true;
  await counterAdjust(key, -1, SLOT_TTL_SECONDS);
  return false;
}

export async function releaseSourceSlot(kind: SlotKind, sourceId: string): Promise<void> {
  await counterAdjust(CacheKeys.searchSourceSlot(kind, sourceId), -1, SLOT_TTL_SECONDS);
}

/** 429 with a machine-readable code; the client tells the user their
 *  previous search is still running. */
export function respondSourceBusy(res: NextApiResponse, kind: SlotKind): void {
  res.setHeader('Retry-After', Math.ceil(SOURCE_BUSY_RETRY_MS / 1000));
  res.status(429).json({
    error:
      kind === 'build'
        ? 'Your previous searches are still building — please wait for them to finish.'
        : 'An answer is already streaming for this session — please wait for it to finish.',
    code: 'source_busy',
    retryAfterMs: SOURCE_BUSY_RETRY_MS,
  });
}
