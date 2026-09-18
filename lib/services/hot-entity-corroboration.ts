/**
 * Blind-channel gate for salience nominees (R-ALIAS-TAIL, #911).
 *
 * Two nomination channels are question-blind by construction: `category`
 * (entities sharing the pool's dominant categories) and `global` (the era's
 * breadth leaders). Measured on prod (2026-09-16, 43 windows of the hygiene
 * battery): the judge returned exactly 12 picks in every window and 71% of
 * all arm picks were the same era-wide entities — an omnibus law, the
 * marquee executive orders, a task force — reaching the judge through those
 * two channels (the pool channel nominated them in ≤6 of 31 questions, the
 * question channel in 3% of its rows). Era-wide document frequency
 * separates that tail from the canon: picks at doc_freq_term ≥ 100 were
 * 224 tail / 13 other, 30–99 were 296 / 81, 10–29 were 37 / 121.
 *
 * The rule is mechanical and content-neutral: a question-blind nominee is
 * ADMITTED only if it is CORROBORATED (the seed pool or the question's own
 * words also nominated it) or SPECIFIC (era-wide document frequency below
 * the cap — a per-era percentile, see salience-knobs.ts). It is applied to
 * each channel's rows BEFORE ranking and slot slicing, so the channel's
 * shortlist slots go to admissible nominees instead of being spent on the
 * giants and then emptied. The judge-bypassing mechanical top-up likewise
 * draws only question-conditioned rows. No lists, no names. Pure; every
 * function is unit-tested.
 */

import type {
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';
import { BLIND_CHANNEL_DFT_CAP } from '@/lib/services/salience-knobs';

export {
  BLIND_CHANNEL_DFT_CAP,
  BLIND_CHANNEL_DFT_PCT,
  blindChannelGateEnabled,
} from '@/lib/services/salience-knobs';

/** Per-era caps for a window. The absolute override, when set, applies to
 *  every era; otherwise each era gets its own percentile value, and a row
 *  without an era (older callers) gets the strictest one — dev Run 3
 *  (2026-09-18) showed a window-wide "most lenient era" cap of 55 on
 *  comparative questions re-admitting the whole current-term tail. */
export type EraCaps = Record<string, number>;

export function resolveBlindDftCaps(
  eraPercentiles: Record<string, number>,
  absolute: number = BLIND_CHANNEL_DFT_CAP,
): EraCaps {
  if (absolute > 0)
    return Object.fromEntries(Object.keys(eraPercentiles).map((e) => [e, absolute]));
  return { ...eraPercentiles };
}

export function capForRow(r: EntityRow, caps: EraCaps): number {
  const values = Object.values(caps);
  if (values.length === 0) return 0;
  return (r.era && caps[r.era]) ?? Math.min(...values);
}

export type BlindChannel = 'category' | 'global';

export function isBlindChannel(channel: NominationChannel | undefined): channel is BlindChannel {
  return channel === 'category' || channel === 'global';
}

/** A row nominated by a question-conditioned channel. Untagged rows (older
 *  callers, tests) count as corroborated so nothing silently disappears. */
export function isCorroboratedRow(r: EntityRow): boolean {
  return !isBlindChannel(r.channel);
}

/** Every phrase the question-conditioned evidence nominated, whether or not
 *  it won a shortlist slot under its own channel: pool docs that mention it
 *  at least `minMentions` times, or a question-text match. Callers pass the
 *  question rows the shortlist itself admits (the sliced, current-era-first
 *  list), so a baseline-era match cannot corroborate a current-era giant.
 *  Lowercased. */
export function corroboratedPhrases(
  poolRows: PoolEntityRow[],
  questionRows: EntityRow[],
  minMentions: number,
): Set<string> {
  const out = new Set<string>();
  for (const r of poolRows) if (r.poolMentions >= minMentions) out.add(r.phrase.toLowerCase());
  for (const r of questionRows) out.add(r.phrase.toLowerCase());
  return out;
}

/** The nomination predicate: corroborated, or specific (under its era's cap). */
export function admitsBlindNominee(
  r: EntityRow,
  corroborated: Set<string>,
  caps: EraCaps | number,
): boolean {
  const cap = typeof caps === 'number' ? caps : capForRow(r, caps);
  return corroborated.has(r.phrase.toLowerCase()) || r.docFreqTerm < cap;
}

export type BlindDrops = Record<BlindChannel, number>;
export const NO_DROPS: BlindDrops = { category: 0, global: 0 };

/** Apply the predicate to one question-blind channel's raw rows, before
 *  that channel ranks and slices them. */
export function gateChannelRows(
  rows: EntityRow[],
  corroborated: Set<string>,
  caps: EraCaps | number,
): { kept: EntityRow[]; dropped: number } {
  const kept = rows.filter((r) => admitsBlindNominee(r, corroborated, caps));
  return { kept, dropped: rows.length - kept.length };
}

/** Arms whose nominee is question-blind and uncorroborated — the ones that
 *  earned their seat only by being specific. The roster gives them no
 *  priority seat and a smaller slot cap (#913). Lowercased phrases. */
export function uncorroboratedArms(
  arms: Array<{ phrase: string }>,
  shortlist: EntityRow[],
  corroborated: Set<string>,
): string[] {
  const byPhrase = new Map(shortlist.map((r) => [r.phrase.toLowerCase(), r]));
  return arms
    .map((a) => a.phrase)
    .filter((ph) => {
      const key = ph.toLowerCase();
      const row = byPhrase.get(key);
      return !!row && !isCorroboratedRow(row) && !corroborated.has(key);
    });
}
