/**
 * Validation-count bench + golden check (#782 WP5).
 *
 * Runs countAliasCandidates (the production path, current concurrency
 * constants) against a raw sequential per-phrase reference on known phrase
 * sets, diffing consumer-level verdicts and reporting wall-clock for each.
 * Used to verify and time WO-3 concurrency changes; the WO-1 batched-SQL
 * experiment was refuted with this harness (2026-08-26: a single serial
 * union statement costs ~1.0-1.4x the SEQUENTIAL per-phrase total — the
 * per-row × per-phrase recheck eats the shared-I/O win — so it can never
 * beat the concurrent per-phrase path).
 *
 * Usage: DATABASE_URL=<dev> npx tsx scripts/validation-count-bench.ts
 * (REDIS_URL must be unset — counts must not warm shared caches.)
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ExpansionWindow } from '@/lib/services/alias-count-cache';
import {
  countAliasCandidates,
  windowFilters,
  MAX_MATCH_CAP,
  MAX_WINDOW_SHARE,
  MIN_MATCH_CAP,
} from '@/lib/services/alias-count-cache';

const GOLDENS: Array<{ name: string; window: ExpansionWindow; phrases: string[] }> = [
  {
    name: 'law-enforcement trump_t1',
    window: { dateFrom: '2017-01-20', dateTo: '2021-01-19' },
    phrases: [
      'Department of Justice',
      'Executive Order 13768',
      'Executive Order 13929',
      'Biden Administration',
      'Trump Administration',
      'Obama Administration',
      'Ferguson v. City of Ferguson',
      'Operation Legend',
      'Operation Warp Speed',
      'Community Oriented Policing Services',
      'Violent Crime Control and Law Enforcement Act',
      'Law Enforcement Assistance Administration',
      'Civil Rights Division',
      'Community Oriented Policing',
      'Office of Justice Programs',
    ],
  },
  {
    name: 'law-enforcement trump_t2',
    window: { dateFrom: '2025-01-20' },
    phrases: [
      'Department of Justice',
      'Executive Order 13768',
      'Executive Order 13929',
      'Ferguson v. City of Ferguson',
      'Operation Legend',
      'Operation Warp Speed',
      'Community Oriented Policing Services',
      'Violent Crime Control and Law Enforcement Act',
      'Law Enforcement Assistance Administration',
      'Office of Justice Programs',
      'Civil Rights Division',
      'Executive Order on Law Enforcement',
      'Federal Bureau of Investigation',
      'Obama Administration',
    ],
  },
  {
    name: 'schedule-f full-range',
    window: {},
    phrases: [
      'Schedule F',
      'Executive Order 13957',
      'Schedule Policy/Career',
      'Office of Personnel Management',
      'Merit Systems Protection Board',
      'unicorn nonsense phrase xyzzy',
    ],
  },
];

const verdict = (m: number, cap: number) =>
  m === -1 ? 'dropped' : m < 1 ? 'zero' : m > cap ? 'over-cap' : `validated(${m})`;

async function oldTruth(
  db: ReturnType<typeof getDb>,
  phrase: string,
  filters: ReturnType<typeof sql>,
  cap: number,
): Promise<number> {
  const quoted = `"${phrase.replace(/"/g, '')}"`;
  const r = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = 120000`);
    return tx.execute(sql`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM documents d WHERE ${filters}
          AND d.search_vector @@ websearch_to_tsquery('english', ${quoted})
        LIMIT ${cap + 1}
      ) capped`);
  });
  return Number((r.rows[0] as { n: string }).n);
}

async function main(): Promise<void> {
  if (process.env.REDIS_URL) {
    console.error('REDIS_URL must be unset (would warm shared count caches)');
    process.exit(1);
  }
  const db = getDb();
  let mismatches = 0;
  for (const g of GOLDENS) {
    const filters = windowFilters(g.window);
    const totalR = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 120000`);
      return tx.execute(
        sql`SELECT count(*) AS n FROM (SELECT 1 FROM documents d WHERE ${filters} LIMIT 100000) c`,
      );
    });
    const windowTotal = Number((totalR.rows[0] as { n: string }).n);
    const cap = Math.max(
      MIN_MATCH_CAP,
      Math.min(MAX_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE)),
    );
    console.log(`\n== ${g.name} (windowTotal=${windowTotal}, cap=${cap})`);

    const t0 = Date.now();
    const production = await countAliasCandidates(db, g.phrases, g.window, filters, cap);
    const batchMs = Date.now() - t0;

    const t1 = Date.now();
    const truth: Array<{ phrase: string; matches: number }> = [];
    for (const phrase of g.phrases) {
      truth.push({ phrase, matches: await oldTruth(db, phrase, filters, cap) });
    }
    const oldMs = Date.now() - t1;

    for (let i = 0; i < g.phrases.length; i++) {
      const b = verdict(production[i].matches, cap);
      const o = verdict(truth[i].matches, cap);
      const ok = b === o || (b.startsWith('over-cap') && o.startsWith('over-cap'));
      if (!ok) mismatches++;
      console.log(`${ok ? '  ok ' : '  MISMATCH '} ${g.phrases[i]}: new=${b} old=${o}`);
    }
    console.log(`  timing: production=${batchMs}ms sequential-reference=${oldMs}ms`);
  }
  console.log(mismatches === 0 ? '\nGOLDEN CHECK PASSED' : `\nGOLDEN CHECK FAILED: ${mismatches}`);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('golden check failed to run:', e);
  process.exit(1);
});
