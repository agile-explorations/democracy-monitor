/**
 * Gate helpers for the pipeline:repair orchestrator (#570): status snapshot
 * capture/diff, expected-flip matching, and NC margin comparison. Pure logic
 * lives here so the safety harness is testable apart from the CLI.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { NegativeControlResult } from '@/lib/services/event-validation-checks';

export interface StatusFlip {
  category: string;
  weekOf: string;
  from: string;
  to: string;
}

export type StatusSnapshot = Map<string, string>;

function key(category: string, weekOf: string): string {
  return `${category}|${weekOf}`;
}

/** Convergence status per category-week in [from, to], for enriched rows. */
export async function captureStatuses(from: string, to: string): Promise<StatusSnapshot> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT category, week_of::text AS week_of, convergence_detail->>'status' AS status
    FROM weekly_aggregates
    WHERE week_of >= ${from} AND week_of <= ${to}
      AND convergence_detail->>'status' IS NOT NULL`);
  const snap: StatusSnapshot = new Map();
  for (const r of res.rows as Array<{ category: string; week_of: string; status: string }>) {
    snap.set(key(r.category, r.week_of), r.status);
  }
  return snap;
}

/** Every category-week whose status changed between the two snapshots. */
export function diffStatuses(pre: StatusSnapshot, post: StatusSnapshot): StatusFlip[] {
  const flips: StatusFlip[] = [];
  const keys = new Set([...pre.keys(), ...post.keys()]);
  for (const k of keys) {
    const before = pre.get(k) ?? '(none)';
    const after = post.get(k) ?? '(none)';
    if (before === after) continue;
    const [category, weekOf] = k.split('|');
    flips.push({ category, weekOf, from: before, to: after });
  }
  return flips.sort((a, b) => key(a.category, a.weekOf).localeCompare(key(b.category, b.weekOf)));
}

export interface FlipGateResult {
  unexpected: StatusFlip[];
  missing: StatusFlip[];
  matched: StatusFlip[];
}

/**
 * Zero-flip gate with an explicit allowance list: every actual flip must
 * appear in `expected` (same category/week/from/to) or the gate fails.
 * Expected flips that did not happen are reported as warnings, not failures.
 */
export function evaluateFlipGate(actual: StatusFlip[], expected: StatusFlip[]): FlipGateResult {
  const flipKey = (f: StatusFlip): string => `${f.category}|${f.weekOf}|${f.from}|${f.to}`;
  const expectedSet = new Set(expected.map(flipKey));
  const actualSet = new Set(actual.map(flipKey));
  return {
    unexpected: actual.filter((f) => !expectedSet.has(flipKey(f))),
    missing: expected.filter((f) => !actualSet.has(flipKey(f))),
    matched: actual.filter((f) => expectedSet.has(flipKey(f))),
  };
}

/** Controls that regressed pass→fail between the two captures. */
export function regressedControls(
  pre: NegativeControlResult[],
  post: NegativeControlResult[],
): NegativeControlResult[] {
  const passedBefore = new Set(pre.filter((c) => c.pass).map((c) => c.id));
  return post.filter((c) => !c.pass && passedBefore.has(c.id));
}
