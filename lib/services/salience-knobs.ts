/**
 * The R-ALIAS-TAIL salience knobs (#911–#913) in one place, read once at
 * module load like every other retrieval knob. Their values are folded into
 * the enumeration pool key and the judge key through `salienceRulesStamp()`
 * so that flipping one on Render rebuilds the pools it changes instead of
 * serving week-old pools built under the other rule (7-day docsOnly TTL).
 *
 * - SALIENCE_BLIND_GATE=off       restores v1.32.1 nomination and roster
 *                                 behaviour (the tightening below is
 *                                 defined only for gated nominees).
 * - SALIENCE_BLIND_DFT_PCT=N      per-era doc-frequency percentile under which
 *                                 an uncorroborated question-blind nominee
 *                                 still reaches the judge (default 85).
 * - SALIENCE_BLIND_DFT_CAP=N      absolute cap overriding the percentile
 *                                 (0 = off).
 * - SALIENCE_TOPUP_CORROBORATED=off  lets the judge-bypassing mechanical top-up
 *                                 draw category-channel rows again (pre-sprint).
 * - SALIENCE_ROSTER_TIGHTEN=off   gated-only nominees keep priority seats
 *                                 and the flat per-arm cap.
 * - SALIENCE_JUDGE_MAX_PICKS=N    judge quota (default 8; 12 = the old quota).
 */

import { envInt } from '@/lib/utils/env';

/** Per-era percentile of `doc_freq_term` under which an uncorroborated
 *  question-blind nominee still reaches the judge. A percentile, not a
 *  number, because index scale differs by era and environment: on prod
 *  doc frequency 30 is the 93rd percentile of the current term but the
 *  70th of Trump's first term, and dev's stale index clusters just under
 *  it. p85 ≈ 17 / 34 / 45 on prod's three eras (2026-09-17 sizing: admits
 *  39 of 557 tail picks and 138 of 231 genuine ones, like the absolute 30). */
export const BLIND_CHANNEL_DFT_PCT = envInt('SALIENCE_BLIND_DFT_PCT', 85, 50, 99);
/** Absolute override for the cap (0 = derive from the percentile). */
export const BLIND_CHANNEL_DFT_CAP = envInt('SALIENCE_BLIND_DFT_CAP', 0, 0, 10_000);

/** Judge quota (#912). Was 12 and the judge filled it in 43 of 43 measured
 *  windows; prod implies ~3.5 question-specific picks per window, so 8
 *  keeps every genuine pick and equals the mechanical top-up. */
export const MAX_JUDGE_PICKS = envInt('SALIENCE_JUDGE_MAX_PICKS', 8, 1, 12);

const onUnlessOff = (name: string): boolean => process.env[name] !== 'off';

export function blindChannelGateEnabled(): boolean {
  return onUnlessOff('SALIENCE_BLIND_GATE');
}

export function rosterTighteningEnabled(): boolean {
  return onUnlessOff('SALIENCE_ROSTER_TIGHTEN');
}

/** The mechanical top-up (#762) draws only question-conditioned rows (#911):
 *  measured on dev, the breadth-ranked category top-up handed the same eight
 *  entities to every question sharing dominant categories. */
export function topUpCorroboratedOnly(): boolean {
  return onUnlessOff('SALIENCE_TOPUP_CORROBORATED');
}

/** Cache-key material describing the active rules. Any change rebuilds. */
export function salienceRulesStamp(): string {
  return [
    `gate=${blindChannelGateEnabled() ? 1 : 0}`,
    `pct=${BLIND_CHANNEL_DFT_PCT}`,
    `cap=${BLIND_CHANNEL_DFT_CAP}`,
    `topup=${topUpCorroboratedOnly() ? 1 : 0}`,
    `tighten=${rosterTighteningEnabled() ? 1 : 0}`,
    `picks=${MAX_JUDGE_PICKS}`,
  ].join(',');
}
