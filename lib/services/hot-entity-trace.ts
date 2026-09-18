/**
 * Salience stage visibility (2026-08-24): a null judge (mechanical
 * fallback) and a judged selection looked identical in the final response,
 * making the gate-run admission failures undiagnosable from outside for two
 * full runs. One summary line per build; SALIENCE_TRACE=1 adds the full
 * shortlist, question-channel rows, and judge picks.
 */

import type { EntityEra } from '@/lib/services/hot-entity-ranking';

/** Which nomination channel each arm came from (#910): the instrument that
 *  attributes a hygiene delta to a lever. `pool:a,q:b,cat:c,global:d`. */
export function pickChannelTally(
  shortlist: Array<{ phrase: string; channel?: string }>,
  arms: Array<{ phrase: string }>,
): string {
  const byPhrase = new Map(shortlist.map((r) => [r.phrase.toLowerCase(), r.channel ?? 'untagged']));
  const tally: Record<string, number> = { pool: 0, question: 0, category: 0, global: 0 };
  for (const a of arms) {
    const ch = byPhrase.get(a.phrase.toLowerCase()) ?? 'untagged';
    tally[ch] = (tally[ch] ?? 0) + 1;
  }
  const extra = tally.untagged ? `,untagged:${tally.untagged}` : '';
  return `pool:${tally.pool},q:${tally.question},cat:${tally.category},global:${tally.global}${extra}`;
}

export function logSalienceOutcome(o: {
  eras: EntityEra[];
  poolRows: Array<{ phrase: string }>;
  questionRows: Array<{ phrase: string }>;
  shortlist: Array<{ phrase: string; channel?: string }>;
  picks: string[] | null;
  arms: Array<{ phrase: string }>;
  /** Blind-channel gate drops (#911), by channel, and the cap used. */
  dropped?: { category: number; global: number };
  dftCaps?: Record<string, number>;
}): void {
  // Global-channel nominees are barred from the mechanical top-up (#799);
  // the count shows how much of the shortlist that rule touched.
  const globalExcluded = o.shortlist.filter((r) => r.channel === 'global').length;
  const dropped = o.dropped ?? { category: 0, global: 0 };
  console.log(
    `[salience] eras=${o.eras.join('+')} pool=${o.poolRows.length} q=${o.questionRows.length} ` +
      `shortlist=${o.shortlist.length} judge=${o.picks ? o.picks.length + ' picks' : 'NULL(fallback)'} ` +
      `global-excluded=${globalExcluded} dropped=cat:${dropped.category},global:${dropped.global} cap=${renderCaps(o.dftCaps)} ` +
      `picks=${pickChannelTally(o.shortlist, o.arms)} ` +
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

/** The blind-channel gate (#911) left nothing to judge: every nominee was an
 *  uncorroborated giant (or already searched). Logged so a mis-set cap is
 *  distinguishable from "nothing nominated". */
export function logSalienceGated(
  eras: EntityEra[],
  dropped: { category: number; global: number },
  dftCaps: Record<string, number>,
): void {
  console.log(
    `[salience] eras=${eras.join('+')} shortlist=0 dropped=cat:${dropped.category},global:${dropped.global} cap=${renderCaps(dftCaps)} — nothing admissible after the blind-channel gate (#911), salience skipped`,
  );
}

/** `trump_t2:20,biden:37` — one cap per era (#911). */
export function renderCaps(caps: Record<string, number> | undefined): string {
  if (!caps || Object.keys(caps).length === 0) return '-';
  return Object.entries(caps)
    .map(([era, cap]) => `${era}:${Math.round(cap)}`)
    .join(',');
}

/** The evidence gate fired (#806): no pool doc mentions a tracked entity and
 *  the question's words matched none — the window runs seed-only. */
export function logSalienceSkipped(eras: EntityEra[], poolRows: number): void {
  console.log(
    `[salience] eras=${eras.join('+')} pool=${poolRows} q=0 — no question evidence, salience skipped (#806)`,
  );
}
