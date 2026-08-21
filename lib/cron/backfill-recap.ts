/**
 * Criminal-docket RECAP document backfill (#740).
 *
 * Enumerates the curated dockets (lib/data/curated-dockets.ts), classifies
 * every RECAP document (recap-filter.ts), and ingests court-authored text
 * as judicial_opinion documents via storeDocuments (url+category upsert —
 * idempotent re-runs, content-regression guard in place).
 *
 * Usage:
 *   pnpm recap:backfill [--dry-run] [--case cl:N] [--limit N]
 *
 * Dry-run prints the runbook numbers per case (entries, ingest candidates,
 * skips by reason) and writes nothing. Coverage-excluded I/O; the filter is
 * unit-tested in recap-filter.test.ts.
 */

import { CURATED_DOCKETS } from '@/lib/data/curated-dockets';
import type { CuratedDocket } from '@/lib/data/curated-dockets';
import { isDbAvailable } from '@/lib/db';
import { storeDocuments } from '@/lib/services/document-store';
import {
  buildRecapContentItem,
  fetchRecapText,
  listDocketCandidates,
} from '@/lib/services/recap-fetcher';
import type { RecapCandidate } from '@/lib/services/recap-fetcher';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const TEXT_FETCH_DELAY_MS = 1000;

interface BackfillOptions {
  dryRun: boolean;
  onlyCase?: string;
  limit?: number;
}

interface CaseReport {
  label: string;
  docs: number;
  ingestable: number;
  stored: number;
  emptyText: number;
  skips: Record<string, number>;
}

async function processCase(c: CuratedDocket, opts: BackfillOptions): Promise<CaseReport> {
  const report: CaseReport = {
    label: c.label,
    docs: 0,
    ingestable: 0,
    stored: 0,
    emptyText: 0,
    skips: {},
  };
  const candidates: RecapCandidate[] = [];
  for (const docketId of c.docketIds) {
    const list = await listDocketCandidates(docketId);
    candidates.push(...list);
  }
  report.docs = candidates.length;
  for (const cand of candidates) {
    if (cand.verdict !== 'ingest') {
      report.skips[cand.verdict] = (report.skips[cand.verdict] ?? 0) + 1;
      continue;
    }
    report.ingestable++;
  }
  console.log(
    `[recap] ${c.label}: ${report.docs} docs, ${report.ingestable} ingestable, skips=${JSON.stringify(report.skips)}`,
  );
  if (opts.dryRun) return report;

  let stored = 0;
  for (const cand of candidates) {
    if (cand.verdict !== 'ingest') continue;
    if (opts.limit && stored >= opts.limit) break;
    const text = await fetchRecapText(cand.recapId);
    await sleep(TEXT_FETCH_DELAY_MS);
    if (!text) {
      report.emptyText++;
      continue;
    }
    const item = buildRecapContentItem({
      caseLabel: c.label,
      docketId: cand.docketId,
      candidate: cand,
      text: text.text,
      url: text.url,
    });
    for (const category of c.categories) {
      await storeDocuments([item], category);
    }
    stored++;
    if (stored % 25 === 0) console.log(`[recap] ${c.label}: stored ${stored}`);
  }
  report.stored = stored;
  console.log(`[recap] ${c.label}: stored=${stored} emptyText=${report.emptyText}`);
  return report;
}

export async function backfillRecap(opts: BackfillOptions): Promise<CaseReport[]> {
  if (!opts.dryRun && !isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const cases = CURATED_DOCKETS.filter(
    (c) => !opts.onlyCase || c.docketIds.some((id) => `cl:${id}` === opts.onlyCase),
  );
  const reports: CaseReport[] = [];
  for (const c of cases) {
    reports.push(await processCase(c, opts));
  }
  const total = reports.reduce(
    (acc, r) => ({
      docs: acc.docs + r.docs,
      ingestable: acc.ingestable + r.ingestable,
      stored: acc.stored + r.stored,
      emptyText: acc.emptyText + r.emptyText,
    }),
    { docs: 0, ingestable: 0, stored: 0, emptyText: 0 },
  );
  console.log(`[recap] TOTAL: ${JSON.stringify(total)}`);
  return reports;
}

// CLI entry
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv,
    'Backfill court-authored RECAP documents from curated dockets (#740)\nUsage: pnpm recap:backfill [--dry-run] [--case cl:N] [--limit N]',
  );
  const dryRun = process.argv.includes('--dry-run');
  const onlyCase = process.argv.find((a) => a.startsWith('--case='))?.split('=')[1];
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  backfillRecap({ dryRun, onlyCase, limit: limitArg ? parseInt(limitArg, 10) : undefined })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[recap] failed:', err);
      process.exit(1);
    });
}
