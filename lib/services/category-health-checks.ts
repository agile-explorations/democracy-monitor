/**
 * Per-category detection-health checks (#840, R-DETECT-HEALTH).
 *
 * The per-source funnel (#547) watches retrieval and P1-stage collapses; the
 * 2026-09 audit (#836) showed it is blind to two credibility-critical axes:
 *
 *  - AUDIT FALSE-NEGATIVE RATE: P2 verdicts on the random audit sample of
 *    P1-UNFLAGGED docs are the system's direct measure of missed concerns.
 *    Sustained high rates mean P1 under-finds (rulemaking measured 25.2%,
 *    mediaFreedom 21.4% in the 2026 window).
 *  - DISCUSSION-TIER SHARE: the fraction of a category's confirmations that
 *    come from floor speeches (CREC). Majority-discussion evidence is the
 *    fragility surface the symmetry program flagged (hatch 75%,
 *    mediaFreedom 61% at audit time).
 *
 * Pure and boundary-unit-testable, mirroring funnel-collapse-checks.ts.
 * Warn-tier ONLY by design: these are calibration-health signals and must
 * never block a snapshot. Both checks demand a minimum sample size — rates
 * on tiny samples (hatch's 2-of-11 audit) are noise, not signal.
 */

export interface CategoryHealthInputs {
  category: string;
  /** Audit-sample P2 rows in the window (P1-unflagged docs). */
  auditTotal: number;
  /** Of those, verdicts of potentially/clearly concerning (P1 misses). */
  auditFn: number;
  /** Non-audit P2 confirmations in the window. */
  confirmedTotal: number;
  /** Of those, docs whose source is CREC (floor speeches). */
  confirmedCrec: number;
}

export interface CategoryHealthResult {
  id: string; // `${category}:audit-fn` | `${category}:discussion-share`
  category: string;
  check: 'audit-fn' | 'discussion-share';
  /** The measured rate (0..1). */
  value: number;
  /** Sample size the rate was measured on. */
  n: number;
  severity: 'warn';
  reason: string;
}

export interface CategoryHealthThresholds {
  /** Audit FN rate at or above this warns. */
  auditFnWarnRate: number;
  /** Minimum audit samples in-window before the FN rate is evaluated. */
  auditMinSamples: number;
  /** CREC share of confirmations above this warns. */
  discussionShareWarn: number;
  /** Minimum confirmations in-window before the share is evaluated. */
  discussionMinConfirmed: number;
}

/** Calibrated against the 2026-09 audit: healthy categories measured 5–9%
 *  audit-FN; the five under-finders 14–25%. Healthy discussion shares run
 *  25–45%; the flagged six exceeded 50% (warn set above the pack at 60%). */
export const DEFAULT_HEALTH_THRESHOLDS: CategoryHealthThresholds = {
  auditFnWarnRate: 0.15,
  auditMinSamples: 25,
  discussionShareWarn: 0.6,
  discussionMinConfirmed: 15,
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function evaluateCategoryHealth(
  inputs: CategoryHealthInputs[],
  thresholds: CategoryHealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): CategoryHealthResult[] {
  const results: CategoryHealthResult[] = [];

  for (const c of inputs) {
    if (c.auditTotal >= thresholds.auditMinSamples) {
      const rate = c.auditFn / c.auditTotal;
      if (rate >= thresholds.auditFnWarnRate) {
        results.push({
          id: `${c.category}:audit-fn`,
          category: c.category,
          check: 'audit-fn',
          value: rate,
          n: c.auditTotal,
          severity: 'warn',
          reason:
            `audit false-negative rate ${pct(rate)} (${c.auditFn}/${c.auditTotal} ` +
            `unflagged audit docs confirmed concerning) — P1 is under-finding; ` +
            `recalibrate per the #838 playbook`,
        });
      }
    }

    if (c.confirmedTotal >= thresholds.discussionMinConfirmed) {
      const share = c.confirmedCrec / c.confirmedTotal;
      if (share > thresholds.discussionShareWarn) {
        results.push({
          id: `${c.category}:discussion-share`,
          category: c.category,
          check: 'discussion-share',
          value: share,
          n: c.confirmedTotal,
          severity: 'warn',
          reason:
            `floor speeches supply ${pct(share)} of confirmations ` +
            `(${c.confirmedCrec}/${c.confirmedTotal}) — status rests on ` +
            `discussion-tier evidence; see #837`,
        });
      }
    }
  }

  return results;
}
