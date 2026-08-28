/**
 * cl_cluster_ledger I/O (#741): one row per CourtListener opinion cluster the
 * opinion-first pass has attempted, with its latest outcome and attempt
 * count. Read before a pass to skip known clusters; written after every
 * attempt. The CHRG seen-ledger pattern (#608), with a retry queue.
 */

import { inArray, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { clClusterLedger } from '@/lib/db/schema';
import type { ClusterOutcome, LedgerEntry } from '@/lib/services/cl-cluster-plan';

export interface ClusterLedgerRow {
  clusterId: number;
  docketId?: number | null;
  court?: string | null;
  caseName?: string | null;
  dateFiled?: string | null;
}

/** Ledger state for the given clusters (absent = never attempted). */
export async function getClusterLedger(clusterIds: number[]): Promise<Map<number, LedgerEntry>> {
  const out = new Map<number, LedgerEntry>();
  if (!isDbAvailable() || clusterIds.length === 0) return out;
  const rows = await getDb()
    .select({
      clusterId: clClusterLedger.clusterId,
      reason: clClusterLedger.reason,
      attempts: clClusterLedger.attempts,
    })
    .from(clClusterLedger)
    .where(inArray(clClusterLedger.clusterId, clusterIds));
  for (const r of rows) {
    out.set(r.clusterId, { reason: r.reason as ClusterOutcome, attempts: r.attempts });
  }
  return out;
}

/** Record an attempt's outcome: insert, or bump attempts + refresh the reason. */
export async function recordClusterOutcome(
  row: ClusterLedgerRow,
  reason: ClusterOutcome,
): Promise<void> {
  if (!isDbAvailable()) return;
  await getDb()
    .insert(clClusterLedger)
    .values({
      clusterId: row.clusterId,
      docketId: row.docketId ?? null,
      court: row.court ?? null,
      caseName: row.caseName ?? null,
      dateFiled: row.dateFiled ?? null,
      reason,
    })
    .onConflictDoUpdate({
      target: clClusterLedger.clusterId,
      set: {
        reason,
        attempts: sql`${clClusterLedger.attempts} + 1`,
        lastTriedAt: sql`now()`,
      },
    });
}
