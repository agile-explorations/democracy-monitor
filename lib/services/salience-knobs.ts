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
 * - SALIENCE_BLIND_DFT_CAP=N      era-wide doc-frequency cap under which an
 *                                 uncorroborated question-blind nominee still
 *                                 reaches the judge (default 30).
 * - SALIENCE_ROSTER_TIGHTEN=off   gated-only nominees keep priority seats
 *                                 and the flat per-arm cap.
 * - SALIENCE_JUDGE_MAX_PICKS=N    judge quota (default 8; 12 = the old quota).
 */

import { envInt } from '@/lib/utils/env';

/** Era-wide doc-frequency cap below which an uncorroborated question-blind
 *  nominee still reaches the judge (the canon: captions and persons sit at
 *  10–29 on prod; the tail starts around 30). */
export const BLIND_CHANNEL_DFT_CAP = envInt('SALIENCE_BLIND_DFT_CAP', 30, 1, 10_000);

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

/** Cache-key material describing the active rules. Any change rebuilds. */
export function salienceRulesStamp(): string {
  return [
    `gate=${blindChannelGateEnabled() ? 1 : 0}`,
    `cap=${BLIND_CHANNEL_DFT_CAP}`,
    `tighten=${rosterTighteningEnabled() ? 1 : 0}`,
    `picks=${MAX_JUDGE_PICKS}`,
  ].join(',');
}
