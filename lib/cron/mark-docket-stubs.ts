/**
 * CLI: pnpm docs:mark-stubs [--dry-run]
 *
 * Marks CourtListener docket entries (source_type='court_opinion') as
 * content_type='metadata_only'. Docket entries are metadata stubs by design —
 * their opinions arrive as separate judicial_opinion documents — but
 * content_type was never set at ingest, so ~114k stubs sat unmarked: counted
 * as "full-text" by corpus stats, returned by search, and flagged by
 * validate:data since the check was added. storeDocuments now marks them at
 * ingest (2026-07-25); this repairs history. Idempotent.
 *
 * Deliberately does NOT touch aggregates or scores: stubs have no score rows
 * (purged in #566) and were never L2-eligible, so marking is status-inert —
 * verified by the runbook's zero-flip check.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { checkHelp } from '@/lib/utils/cli-help';

export async function runMarkDocketStubs(dryRun: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const [before] = await db
    .select({ unmarked: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(eq(documents.sourceType, 'court_opinion'), ne(documents.contentType, 'metadata_only')),
    );
  console.log(`[mark-stubs] unmarked docket entries: ${before.unmarked}`);
  if (dryRun) {
    console.log('[mark-stubs] DRY RUN — no writes');
    return;
  }
  if (Number(before.unmarked) === 0) {
    console.log('[mark-stubs] nothing to mark');
    return;
  }

  const res = await db
    .update(documents)
    .set({ contentType: 'metadata_only' })
    .where(
      and(eq(documents.sourceType, 'court_opinion'), ne(documents.contentType, 'metadata_only')),
    );
  console.log(`[mark-stubs] marked ${res.rowCount} docket entries metadata_only`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm docs:mark-stubs [--dry-run]

Marks CourtListener docket entries (source_type='court_opinion') as
content_type='metadata_only'. Idempotent; status-inert (no score rows,
never L2-eligible).`,
  );
  runMarkDocketStubs(argv.includes('--dry-run')).catch((err) => {
    console.error('[mark-stubs] Fatal:', err);
    process.exit(1);
  });
}
