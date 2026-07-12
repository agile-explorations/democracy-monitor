import { PATTERN_VERSION } from '@/lib/data/retrieval-relevance-patterns';
import { getDb, isDbAvailable } from '@/lib/db';
import { frDropLedger } from '@/lib/db/schema';
import type { DroppedItem } from '@/lib/services/retrieval-relevance-filter';

/**
 * Persist retrieval-relevance drops (#524). Ledger failures must never fail
 * the fetch pipeline — drops are logged and the fetch proceeds.
 */
export async function recordFrDrops(
  category: string,
  signalUrl: string,
  dropped: DroppedItem[],
): Promise<void> {
  if (dropped.length === 0 || !isDbAvailable()) return;
  try {
    const db = getDb();
    await db
      .insert(frDropLedger)
      .values(
        dropped.map(({ item, reason }) => ({
          category,
          signalUrl,
          url: item.link ?? '(no-url)',
          title: item.title ?? '(untitled)',
          agency: item.agency ?? null,
          publishedAt: item.pubDate ?? null,
          reason,
          patternVersion: PATTERN_VERSION,
        })),
      )
      .onConflictDoNothing();
  } catch (err) {
    console.warn(`[fr-drop-ledger] Failed to record ${dropped.length} drops:`, err);
  }
}
