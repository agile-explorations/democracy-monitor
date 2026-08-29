/**
 * Salience stage visibility (2026-08-24): a null judge (mechanical
 * fallback) and a judged selection looked identical in the final response,
 * making the gate-run admission failures undiagnosable from outside for two
 * full runs. One summary line per build; SALIENCE_TRACE=1 adds the full
 * shortlist, question-channel rows, and judge picks.
 */

import type { EntityEra } from '@/lib/services/hot-entity-ranking';

export function logSalienceOutcome(o: {
  eras: EntityEra[];
  poolRows: Array<{ phrase: string }>;
  questionRows: Array<{ phrase: string }>;
  shortlist: Array<{ phrase: string; channel?: string }>;
  picks: string[] | null;
  arms: Array<{ phrase: string }>;
}): void {
  // Global-channel nominees are barred from the mechanical top-up (#799);
  // the count shows how much of the shortlist that rule touched.
  const globalExcluded = o.shortlist.filter((r) => r.channel === 'global').length;
  console.log(
    `[salience] eras=${o.eras.join('+')} pool=${o.poolRows.length} q=${o.questionRows.length} ` +
      `shortlist=${o.shortlist.length} judge=${o.picks ? o.picks.length + ' picks' : 'NULL(fallback)'} ` +
      `global-excluded=${globalExcluded} ` +
      `arms=${o.arms.length}: ${o.arms.map((a) => a.phrase).join(' | ')}`,
  );
  if (process.env.SALIENCE_TRACE === '1') {
    console.log(
      `[salience-trace] questionRows: ${o.questionRows.map((r) => r.phrase).join(' | ')}`,
    );
    console.log(`[salience-trace] judgePicks: ${(o.picks ?? []).join(' | ')}`);
    console.log(
      `[salience-trace] shortlist: ${o.shortlist.map((r, i) => `${i}:${r.phrase}`).join(' | ')}`,
    );
  }
}

/** The evidence gate fired (#806): no pool doc mentions a tracked entity and
 *  the question's words matched none — the window runs seed-only. */
export function logSalienceSkipped(eras: EntityEra[], poolRows: number): void {
  console.log(
    `[salience] eras=${eras.join('+')} pool=${poolRows} q=0 — no question evidence, salience skipped (#806)`,
  );
}
