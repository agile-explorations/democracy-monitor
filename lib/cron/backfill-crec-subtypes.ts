/**
 * CREC subtype backfill (#841, R-GRADED-EVIDENCE).
 *
 * Sets `documents.evidence_tier = 'action'` on speakerless CREC floor_speech
 * granules whose titles positively identify them as instruments read into
 * the record (resolution text, appropriations/explanatory statements,
 * presidential messages, committee-report text). Speeches — including those
 * whose speaker extraction failed — are never promoted: unmatched titles
 * keep NULL and stay discussion-tier.
 *
 * Idempotent: only rows with evidence_tier IS NULL are considered; re-runs
 * and post-deploy sweeps are safe. No baseline-sensitive derived data is
 * touched (the tier is a read-time classification; aggregates and scores are
 * unaffected until #842 consumes it).
 *
 * Usage:
 *   pnpm crec:subtypes --dry-run    # classify + per-class counts, no writes
 *   pnpm crec:subtypes              # apply
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { crecActionSubtype } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { checkHelp } from '@/lib/utils/cli-help';
import { chunk } from '@/lib/utils/collections';

const BATCH = 500;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm crec:subtypes [--dry-run]

Marks speakerless CREC legislative/presidential text as action-tier (#841).
--dry-run   classify and report per-class counts, no writes`,
  );
  const dryRun = argv.includes('--dry-run');
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const rows = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(
      and(
        eq(documents.sourceOrigin, 'crec'),
        eq(documents.sourceType, 'floor_speech'),
        isNull(documents.speaker),
        isNull(documents.evidenceTier),
      ),
    );

  const byClass: Record<string, number> = {};
  const promote: number[] = [];
  for (const r of rows) {
    const subtype = crecActionSubtype(r.title);
    byClass[subtype ?? 'unmatched (stays discussion)'] =
      (byClass[subtype ?? 'unmatched (stays discussion)'] ?? 0) + 1;
    if (subtype) promote.push(r.id);
  }

  console.log(
    `[crec:subtypes] ${rows.length} speakerless CREC candidates${dryRun ? ' (DRY RUN)' : ''}`,
  );
  for (const [k, n] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`);
  }

  if (!dryRun && promote.length > 0) {
    for (const ids of chunk(promote, BATCH)) {
      await db.update(documents).set({ evidenceTier: 'action' }).where(inArray(documents.id, ids));
    }
  }
  console.log(
    `[crec:subtypes] ${promote.length} promoted to action-tier${dryRun ? ' (would be)' : ''}, ${rows.length - promote.length} kept discussion`,
  );
}

if (require.main === module) {
  const savedDbUrl = process.env.DATABASE_URL;
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[crec:subtypes] Fatal:', err);
      process.exit(1);
    });
}
