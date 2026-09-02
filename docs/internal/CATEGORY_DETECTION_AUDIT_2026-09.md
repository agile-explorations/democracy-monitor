# Category Detection Audit — under/over-finding across all 14 categories

_2026-09-02, owner-requested pre-outreach credibility audit. Data source: the
`democracy_monitor_rehearsal` DB (= prod 08-31 dump + #833 reroute + the full
R-INFOAVAIL chain), i.e. the post-sprint world. Instruments: `validate:funnel`,
per-category SQL battery (P1 flag rates, P2 confirmation rates, audit-sample
false negatives, source concentration, cross-category duplicate confirmations,
weekly volumes, baseline-vs-T2 discrimination). Windows: T2 = week_of ≥
2025-01-20; "current-era" = week_of ≥ 2026-01-01 (avoids mixing superseded
prompts). All numbers reproducible from the queries in the session log._

## Headline findings, ranked by credibility impact

### 1. UNDER-finding is systematic and measurable: audit false-negative rates of 5–25%

The audit sample (P2 run on a ~5–12% random slice of P1-UNFLAGGED docs) is the
system's direct measure of missed concerns. Current-era (2026) rates:

| category               | P1 rate | audit FN rate      | est. missed concerning docs, 2026 alone |
| ---------------------- | ------- | ------------------ | --------------------------------------- |
| rulemaking             | 19.4%   | **25.2%** (26/103) | ~177                                    |
| mediaFreedom           | 27.4%   | **21.4%**          | ~36                                     |
| hatch                  | 65.8%   | 18.2% (2/11)       | ~2                                      |
| elections              | 47.6%   | **17.2%**          | ~35                                     |
| judicialIndependence   | 24.0%   | **14.3%**          | ~39                                     |
| immigrationEnforcement | 25.3%   | 10.2%              | ~164                                    |
| civilLiberties         | 15.8%   | 9.0%               | ~306                                    |
| executiveOversight     | 11.1%   | 8.5%               | ~143                                    |
| (best) lawEnforcement  | 10.3%   | 4.8%               | ~130                                    |

Summed naive estimate: **~1,300–1,400 concerning docs missed in 2026** across
categories — same order of magnitude as the confirmations found. Caveats that
temper but don't dissolve this: audit-sample P2 runs with the same borderline-
tier fragility #772 documented, so some audit "confirmations" are borderline;
the estimate extrapolates small audit samples (hatch: 2/11). Even halved, the
under-finding is material, and P1 screening — not P2 — is the bottleneck.
civilLiberties at 9.0% despite its 2025-10 calibration (0.7% measured then on
1/147) suggests drift or original sample luck; recheck it.

### 2. OVER-finding risk: confirmations skew heavily to floor speeches (discussion tier)

CREC floor speeches are the **top confirmation source in 12 of 14 categories**,
supplying **more than half of all T2 confirmations in six**: hatch 75%,
mediaFreedom 61%, lawEnforcement 54%, executiveOversight 53%,
judicialIndependence 52%, elections 51.5%. (Contrast: rulemaking 25%,
executiveActions 33% — the action-instrument-rich categories.)

The semantics are defensible — P2 assesses speeches as evidence of the events
they respond to — but the credibility exposure is exactly the surface the
symmetry program (#767/#769/#772) worried about: **status-driving evidence that
is substantially opposition-party rhetoric characterizing events**, rather than
primary instruments. An outreach-era reviewer who pulls one CC week and finds
its confirmations are three floor speeches will discount the whole feature.
This is a product-semantics decision, not a bug: options include requiring ≥1
action-tier confirmed doc for ConfirmedConcern weeks, tier-weighted concern
synthesis, or at minimum disclosing the evidence-tier mix on category pages.

### 3. Cross-category totals double-count by 1.76×

T2 has 4,540 (category × confirmed-doc) pairs over only **2,582 distinct
documents**. Much multi-category membership is legitimate (an immigration EO is
both executiveActions and immigrationEnforcement); the R-INFOAVAIL sprint
removed the _wrong-category_ variant, and this remainder is the _shared-
category_ variant. The exposure is presentational: any top-line "N concerns
found" that sums categories overstates by ~76%. Count distinct documents at
every cross-category rollup; per-category counts are fine as-is.

### 4. Category-specific outliers

- **elections — highest-priority calibration candidate.** Worst
  baseline-discrimination in the system (P1 flags 30.1% of BIDEN-era docs vs
  39.7% of T2 — a 1.3× ratio where healthy categories run 3–4×; R-GAO's
  post-calibration shape was 2.0%→6.6%). 2026 P1 rate 47.6%; NC-1 margin
  already the system's tightest (elections 19.3% vs 20% ceiling); thin corpus
  (~12 docs/wk). The P1-calibration-lever playbook (threat-vector framing in
  the category description, as done for civilLiberties) applies directly.
- **hatch — status rides on almost nothing.** 1.8 docs/week (min 0), 65.8% P1
  flag rate, 75% of confirmations from floor speeches. Sparse-mode covers the
  silence math, but weekly status can swing on one or two speeches. Smallest
  blast radius; flag on the methodology page rather than re-engineer.
- **rulemaking — the biggest under-finder** (25% FN). Notable: its funnel and
  volumes are healthy; the category description/P1 framing is likely too
  narrow for its wide diet (it also just absorbed six rerouted instruments).
- **executiveOversight — known, parked item stands.** #548 measured its FR
  pipe as per-doc contaminated but strategically minor; the recommended
  light-touch fix (term retargeting, not a filter) has never been scheduled.
- **infoAvailability — the before/after exemplar.** Post-R-INFOAVAIL it shows
  the healthy shape: P2 confirmation 35.6%, NC-1 margin improved to 0.78%,
  9.4% current-era FN (mid-pack), volume 12/wk with silence now meaningful.

### 5. The weekly instruments don't watch these axes

`validate:funnel` (green across all categories except the expected new-filter
warning) checks retrieval relevance and stage collapses — it has no view of
audit-FN rates or evidence-tier mix. Both are cheap standing additions to the
weekly snapshot alerting; this audit should become an instrument, not a
one-off.

## Recommended actions (owner prioritizes; none scheduled)

1. **R-CALIBRATE sprint** — P1 threat-vector recalibration for rulemaking,
   mediaFreedom, elections, judicialIndependence (+hatch opportunistically),
   using the civilLiberties playbook; success metric = audit-FN rate before/
   after; elections first (discrimination + NC margin + outreach salience).
   Est. cost: prompt/description work + sample re-runs, low tens of dollars.
2. **Evidence-tier semantics decision** (product call): pick among
   action-tier-corroboration-for-CC / tier-weighted synthesis / disclosure of
   evidence mix. Interacts with #767/#769 symmetry program.
3. **Top-line counting discipline**: distinct-doc counts at cross-category
   rollups (UI/product copy audit, small).
4. **Instrument it**: add audit-FN-rate and CREC-confirmation-share columns +
   thresholds to the weekly funnel validation.
5. **Standing parked items that belong to this picture**: executiveOversight
   term retargeting (#548), source-gap cluster (#551 PRA discontinuances,
   #683 DHS newsroom purge, #656/#657 publication discontinuities), #816
   two-outside-reader verdict audit (bears on how much weight audit-FN
   "confirmations" deserve).
