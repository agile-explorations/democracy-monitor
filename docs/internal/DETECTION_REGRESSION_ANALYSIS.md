# Detection Regression Analysis — Post R1-F14

**Date**: 2026-03-16
**Context**: After Sprint R1-F14 (cycle-year baseline matching + L2 baseline contamination fix), detection dropped to 24/39 (62%) with 2 NC-3 failures. This document analyzes root causes and potential fixes for review.

## Current State

| Metric                       | Value                                                   |
| ---------------------------- | ------------------------------------------------------- |
| Known event detection        | 24/39 (62%)                                             |
| Trump T1 detection           | 7/14 (50%)                                              |
| Trump T2 detection           | 17/25 (68%)                                             |
| NC-3                         | 5/6 passing (executiveOversight 9.6%, fiscal 5.8% fail) |
| NC-1, NC-2, NC-4, NC-5, NC-6 | All passing                                             |

---

## Issue 1: Validation Display Bug — `l2Fired()` vs `isAIElevated()`

**Impact**: The L2 column in `validate:detection` output is misleading, overstating L2 signal.

The validation check `l2Fired()` (event-validation-checks.ts:61-63) tests a single condition:

```
aiScore > 1.5  (AI_FLAG_RATE_THRESHOLD)
```

The convergence synthesis `isAIElevated()` (convergence-synthesis.ts:69-77) requires **three** conditions:

1. `totalDocuments >= 10` (AI_FLAG_RATE_MIN_DOCS)
2. `flagRateZScore > 1.5` (AI_FLAG_RATE_THRESHOLD)
3. Either `concernRate > 0` (P2 corroboration) **or** `flagRateZScore > 3.0` (very strong signal)

**Example**: T2-3 executiveActions shows `L2 ✓` in the detection table, but convergence is Stable. The flag rate z-score exceeds 1.5, but likely fails condition 1 (< 10 docs) or condition 3 (no P2 corroboration and z < 3.0).

**Fix**: Align `l2Fired()` with `isAIElevated()` logic, or add a separate column for "L2 raw" vs "L2 convergence".

---

## Issue 2: NC-3 Failures — L2-Driven Baseline Elevation

**executiveOversight (9.6%, threshold 5%)**: ~5 of 52 Biden 2022 weeks at Elevated+. Per-category L1 threshold was already raised to 2.8 (R1-A2A3), bringing L1-only elevation to ~3.8%. The remaining ~5.8% is driven by L2 elevation. With the corrected L2 baseline (no longer contaminated by T2 data), the lower baseline flag rate produces higher z-scores for Biden 2022 weeks that have modestly above-average P1 flag rates. Some of these weeks also have `concernRate > 0` (at least one P2 doc was potentially/clearly concerning), satisfying the P2 corroboration gate.

**fiscal (5.8%, threshold 5%)**: Same mechanism. ~3 of 52 Biden 2022 weeks cross the L2 threshold with the corrected baseline. Just barely over the 5% limit.

**Root cause**: The L2 baseline bug fix is correct (previously the baseline was contaminated), but the correct baseline reveals that some Biden 2022 weeks genuinely have slightly elevated P1 flag rates. This is a P1 calibration issue — the P1 prompt may be slightly over-flagging in these categories during Biden 2022.

**Potential fixes**:

- A. Raise the L2 z-score threshold from 1.5 to ~2.0 (global effect — reduces sensitivity everywhere)
- B. Calibrate P1 category descriptions for executiveOversight and fiscal (targeted — reduces P1 flag rate in baseline)
- C. Increase `AI_FLAG_RATE_MIN_DOCS` from 10 to 15-20 (suppresses L2 in thin weeks)
- D. Add per-category L2 threshold overrides (like we did for L1)
- E. Tighten P2 corroboration: require `concernRate > AI_CONCERN_THRESHOLD` (0.2) instead of `concernRate > 0`

---

## Issue 3: T1 Misses (7 events, 50% detection)

**Root cause**: No L2 AI assessment data exists for 2017-2018. All T1 events that expect `l2: true` in `expectedLayers` will miss unless L1 alone reaches the threshold.

| Event           | Category               | Expected Layers | Why Missed                                                                                              |
| --------------- | ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| T1-1 Travel ban | judicialIndependence   | `l1: true`      | Thin category (6 docs/week avg), L1 threshold 3.8. Dampening factor ~0.6 means raw composite needs 6.3+ |
| T1-2 Comey      | executiveOversight     | `l2: true`      | No L2 data. L1 threshold 2.8 may not fire for a personnel action                                        |
| T1-2 Comey      | judicialIndependence   | `l2: true`      | No L2 data. L1 threshold 3.8 too high for thin category                                                 |
| T1-4 DACA       | civilLiberties         | `l1, l2: true`  | No L2 data. Single AG memo — may not spike volume enough for L1                                         |
| T1-4 DACA       | immigrationEnforcement | `l1, l2: true`  | No L2 data. Same — single-document event                                                                |
| T1-5 Family sep | civilLiberties         | `l1, l2: true`  | No L2 data. Single DOJ memo                                                                             |
| T1-5 Family sep | immigrationEnforcement | `l1, l2: true`  | No L2 data. Single DHS memo                                                                             |

**Potential fixes**:

- A. **L2 backfill for T1**: Run `pnpm layer2:backfill --from 2017-01-20 --to 2019-01-19`. This would add AI assessments for 2017-2018 documents, enabling L2 detection. Cost: ~$5-10 in API calls.
- B. **Adjust T1 expectations**: Events that explicitly expect `l2: true` but have no L2 data should have expectations lowered to `Stable` with notes explaining the architectural limitation. This is honest but reduces the test's aspirational value.
- C. **Lower judicialIndependence L1 threshold**: Current 3.8 is very high. But it was raised specifically to pass NC-3 (23.1% Biden 2022 elevation at 2.5). Lowering it would reintroduce NC-3 failure.

---

## Issue 4: T2 Misses (8 events, 68% detection)

### Category A: Events where signal is genuinely thin in formal documents

| Event                    | Category             | Signal Issue                                                                                                                 |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T2-3 DOGE/USAID          | executiveOversight   | DOGE operations weren't documented through formal oversight channels. OIG reports take months. Signal was in media/rhetoric. |
| T2-3 DOGE/USAID          | executiveActions     | L2 z-score > 1.5 but fails P2 corroboration or min-docs gate. Only 2 FR-based signals in this category.                      |
| T2-8 DOJ career firings  | lawEnforcement       | Internal personnel actions rarely appear in formal government documents. DOJ press releases announce policy, not firings.    |
| T2-8 DOJ career firings  | judicialIndependence | Same — thin category (6 docs/week), no formal document signal for personnel actions                                          |
| T2-12 Shutdown workforce | civilService         | Government shutdowns reduce document output, not increase it. The FR itself may shut down.                                   |

**Recommendation**: Consider downgrading `expectedMinStatus` to `Stable` for events where the signal is primarily in media/rhetoric sources that the system doesn't currently ingest. Add notes explaining the source gap. These are not detection failures — they're honest assessments of source coverage.

### Category B: Events where detection should be achievable

| Event                         | Category     | Current Status                         | Analysis                                                                                                                                                                                                            |
| ----------------------------- | ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2-7 Schedule F proposed rule | civilService | Stable, no layers                      | A proposed rule with 40K comments should spike L1 volume. If L1 doesn't fire, may be a data issue (documents not backfilled for that week) or the rule is a single FR document that doesn't spike aggregate volume. |
| T2-7 Schedule F final rule    | civilService | Elevated (L1 only), expected Divergent | L1 fires but needs 2+ layers for Divergent. L2 doesn't fire (flag rate z-score ≤ 1.5 or fails P2 gate). L3 didn't fire (thematic z-score ≤ 3.5, reinforcement-only mode).                                           |
| T2-10 Rescission $9.4B        | fiscal       | Stable, no layers                      | A $9.4B rescission request is 1-2 documents. With only FR-based signals, the week may have < 10 docs (L2 min-docs gate) and dampened L1.                                                                            |

**Potential fixes**:

- Investigate T2-7 Schedule F proposed rule: is the data present? Query `documents` for civilService in week of 2025-04-14.
- T2-7 final rule: If L3 is in reinforcement-only mode and L2 doesn't fire, Divergent is unachievable with L1-alone. Consider whether `Elevated` is an acceptable expected status.
- T2-10 rescission: May be an unreasonable expectation for a 1-2 document event in a thin week.

---

## Issue 5: Structural Dampening Impact on Thin Categories

The composite score dampening formula (structural-anomaly-service.ts):

```
dampening = min(documentCount, 10) / 10
composite = rawComposite * dampening
```

For judicialIndependence (6 avg docs/week, L1 threshold 3.8):

- Dampening factor: 6/10 = 0.6
- Effective threshold: 3.8 / 0.6 = **6.33 raw composite required**
- Normal z-scores of 2-3 across dimensions produce composites of ~2-3
- After dampening: 1.2-1.8, well below 3.8
- **Only weeks with genuine volume spikes (15+ docs) bypass dampening**

This creates a catch-22 for thin categories: the threshold was raised to 3.8 to pass NC-3, but dampening means the effective threshold is 6.3+, making detection nearly impossible except during large spikes.

---

## Summary: Prioritized Fix Paths

### Quick wins (no model cost, code-only):

1. **Fix `l2Fired()` display bug** — align with `isAIElevated()` logic so the detection table is accurate
2. **Tighten P2 corroboration gate** — require `concernRate > 0.05` instead of `> 0` to fix NC-3 L2-driven elevation in baseline
3. **Adjust known event expectations** — downgrade events with genuinely thin formal-document signal to `Stable` with notes

### Medium effort (calibration, no model cost):

4. **Per-category L2 threshold overrides** — like L1's `CATEGORY_STRUCTURAL_THRESHOLDS`, allow categories to have different L2 z-score thresholds
5. **Investigate T2-7 Schedule F proposed rule** — query production data to determine if documents exist

### Larger effort (API cost):

6. **L2 backfill for T1** — run `layer2:backfill` for 2017-2018 to enable L2 detection of T1 events (~$5-10)
7. **P1 recalibration for executiveOversight and fiscal** — adjust category descriptions to reduce baseline P1 flag rates

---

## Questions for Review

1. Should T1 events that explicitly require L2 (`expectedLayers: { l2: true }`) be marked as expected misses until L2 data exists, or should we invest in T1 L2 backfill?

2. Is `concernRate > 0` the right P2 corroboration threshold? A single "potentially concerning" doc in a week of 50 produces `concernRate = 0.02`, which satisfies the gate. Should this require a higher bar?

3. For thin categories (judicialIndependence, elections), is the current dampening + high threshold the right architecture, or should thin categories use a fundamentally different scoring approach?

4. Should events where the primary signal is in media/rhetoric (T2-3 DOGE, T2-8 DOJ firings) be downgraded in expectations, or should we track them as motivation for adding media/rhetoric sources?

5. The `l2Fired()` display bug means our historical detection reports have been overstating L2 contribution. Should we audit past sprint detection numbers for accuracy?
