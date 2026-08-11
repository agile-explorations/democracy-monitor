/**
 * Guarded application of verified annotation corrections (#712 stage 3).
 *
 * Reads the corrections ledger from verify-annotation-flags.ts and applies
 * ONLY TRUE_POSITIVE records, each as an UPDATE guarded on exact-match of
 * the ledger's snapshotted original reasoning — a row whose text changed
 * since screening (concurrent edit, prior correction) never matches and
 * lands on the manual-review list instead of being force-applied.
 *
 * TEXT-ONLY by design: assessment verdicts, confidence, and erosion types
 * are untouched, so no re-aggregation or status surface is affected.
 * Baseline-period rows are included per explicit owner approval
 * (2026-08-11, #712).
 *
 * Usage:
 *   pnpm apply:annotation-corrections --ledger FILE.corrections.jsonl            # Dry run
 *   pnpm apply:annotation-corrections --ledger FILE.corrections.jsonl --confirm
 */

import { readFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

interface CorrectionRecord {
  rowId: number;
  era: string;
  category: string;
  verdict: 'TRUE_POSITIVE' | 'FALSE_POSITIVE';
  originalReasoning: string;
  correctedReasoning?: string;
}

function loadCorrections(path: string): CorrectionRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CorrectionRecord)
    .filter((r) => r.verdict === 'TRUE_POSITIVE' && !!r.correctedReasoning);
}

async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const ledgerPath = args[args.indexOf('--ledger') + 1];
  if (!args.includes('--ledger') || !ledgerPath) throw new Error('--ledger FILE required');

  const corrections = loadCorrections(ledgerPath);
  console.log(`[apply-corrections] ${corrections.length} TRUE_POSITIVE corrections in ledger`);
  if (!confirm) {
    console.log('[apply-corrections] Dry run complete. Run with --confirm to apply.');
    return;
  }

  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  let applied = 0;
  const manualReview: number[] = [];
  for (const c of corrections) {
    const result = await db.execute(sql`
      UPDATE ai_document_assessments
      SET reasoning = ${c.correctedReasoning}
      WHERE id = ${c.rowId} AND reasoning = ${c.originalReasoning}`);
    if (Number(result.rowCount ?? 0) === 1) {
      applied++;
    } else {
      manualReview.push(c.rowId);
    }
  }
  console.log(
    `[apply-corrections] applied ${applied}/${corrections.length}; manual review needed: ${manualReview.length}`,
  );
  if (manualReview.length > 0) {
    console.log(`[apply-corrections] guard-miss row ids: ${manualReview.join(', ')}`);
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm apply:annotation-corrections --ledger FILE.corrections.jsonl [--confirm]',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[apply-corrections] Fatal:', err);
      process.exit(1);
    });
}
