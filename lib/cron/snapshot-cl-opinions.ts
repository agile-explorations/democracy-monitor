/**
 * Weekly CourtListener opinion passes (#741), extracted from snapshot.ts
 * (max-lines): the completed week's opinion-first pass plus a trailing
 * reconciliation window. CourtListener indexes a cluster before extracting
 * its text, so the week's own pass can meet a cluster with no text yet; the
 * ledger remembers it (no_text) and the trailing pass retries it — cheaply,
 * because stored and off-topic clusters are skipped, and boundedly, because
 * the fetch cap applies. Documents stored into old weeks are scored by the
 * reconciliation step before the graph check (#667).
 */

import { getLastCompletedWeek } from '@/lib/services/weekly-aggregator';
import { addDays, toDateString } from '@/lib/utils/date-utils';

export async function snapshotClOpinions(): Promise<void> {
  const { opinionFirstPass, CL_TRAILING_WINDOW_DAYS, CL_TRAILING_MAX_FETCHES } =
    await import('@/lib/services/cl-opinion-first-fetcher');
  // Opinion-first CL pass: opinions issued this week for ANY matching docket.
  // CL API in production (bulk staging tables are absent there); staging when
  // loaded (bulk backfill context).
  const week = getLastCompletedWeek();
  await opinionFirstPass(week, addDays(week, 6), false, { useLedger: true });

  try {
    const today = toDateString(new Date());
    await opinionFirstPass(addDays(today, -CL_TRAILING_WINDOW_DAYS), today, false, {
      useLedger: true,
      maxFetches: CL_TRAILING_MAX_FETCHES,
    });
  } catch (err) {
    console.error('[snapshot] CL trailing opinion pass failed:', err);
  }
}
