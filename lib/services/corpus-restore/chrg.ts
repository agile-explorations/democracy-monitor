/**
 * CHRG restore (#894): hearings the router sent to zero categories
 * (chrg_seen_ledger reason 'zero_categories') with no documents row for the
 * package URL in any category. Transcript text via the CHRG fetcher's
 * GovInfo helper (one call per package, 200 ms apart; GovInfo allows
 * 36,000/hr). Stored under 'corpus'.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { chrgSeenLedger } from '@/lib/db/schema';
import { chrgPackageUrl, toContentItem } from '@/lib/services/chrg-fetcher';
import type { ChrgPackage } from '@/lib/services/chrg-fetcher';
import { fetchGovInfoText } from '@/lib/services/govinfo-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { requireGovInfoKey } from './govinfo-key';
import { applyCap } from './plan';
import { findStoredUrls } from './stored-urls';
import type { RestoreBatch, RestoreOptions } from './types';

const ZERO_CATEGORIES = 'zero_categories';
const GOVINFO_DELAY_MS = 200;

interface LedgerHearing {
  packageId: string;
  title: string;
  committees: string | null;
  dateIssued: string | null;
}

/** Ledger row → the fetcher's package shape (committees are stored comma-joined). */
export function ledgerRowToPackage(row: LedgerHearing): ChrgPackage | null {
  if (!row.dateIssued) return null;
  return {
    packageId: row.packageId,
    title: row.title,
    dateIssued: row.dateIssued,
    committees: (row.committees ?? '').split(',').filter((c) => c.length > 0),
  };
}

async function loadZeroCategoryHearings(): Promise<LedgerHearing[]> {
  return getDb()
    .select({
      packageId: chrgSeenLedger.packageId,
      title: chrgSeenLedger.title,
      committees: chrgSeenLedger.committees,
      dateIssued: chrgSeenLedger.dateIssued,
    })
    .from(chrgSeenLedger)
    .where(eq(chrgSeenLedger.reason, ZERO_CATEGORIES))
    .orderBy(chrgSeenLedger.id);
}

export async function restoreChrg(opts: RestoreOptions): Promise<RestoreBatch[]> {
  requireGovInfoKey();
  const rows = await loadZeroCategoryHearings();
  const stored = await findStoredUrls(rows.map((r) => chrgPackageUrl(r.packageId)));
  const packages = rows
    .filter((r) => !stored.has(chrgPackageUrl(r.packageId)))
    .map(ledgerRowToPackage)
    .filter((p): p is ChrgPackage => p !== null);
  const plan = applyCap(packages, opts.maxDocs);
  console.log(
    `[restore:chrg] ${rows.length} zero-category hearings, ${packages.length} without a documents row; fetching ${plan.kept.length}`,
  );

  const candidates: ContentItem[] = [];
  for (const pkg of plan.kept) {
    const text = await fetchGovInfoText(pkg.packageId);
    if (!text) console.warn(`[restore:chrg] no transcript text for ${pkg.packageId}`);
    candidates.push(toContentItem(pkg, text));
    await sleep(GOVINFO_DELAY_MS);
  }

  return [
    {
      matched: rows.length,
      netNew: packages.length,
      candidates,
      category: CORPUS_CATEGORY,
      capTripped: plan.capTripped,
    },
  ];
}
