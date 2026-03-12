# Release 1: Detection Quality & Platform Hardening — Implementation Plan

**Status:** Approved with modifications (cross-model review complete)
**Date:** 2026-03-12
**Reviewers:** Claude Code, Claude.ai, ChatGPT
**Goal:** Close every detection gap that can be closed with the existing source stack, build operational infrastructure for ongoing accuracy improvement, and establish human review processes.

---

## Current State

| Metric                     | Value                                                          | Source                           |
| -------------------------- | -------------------------------------------------------------- | -------------------------------- |
| Known event detection rate | 77% overall (64% T1, 84% T2)                                   | `pnpm backtest`                  |
| Known events defined       | 43 total (14 T1 + 29 T2)                                       | `lib/validation/known-events.ts` |
| NC-3 baseline pass rate    | 11/13 categories (tiered thresholds)                           | `pnpm validate:detection`        |
| Layer 3 mode               | Reinforcement-only (44% baseline FP, 0 independent detections) | Sprint R-CAL2                    |
| Per-category thresholds    | None (global thresholds only)                                  | `scoring-config.ts`              |
| Cross-category synchrony   | Simple weighted count (not semantic)                           | `overview-service.ts`            |
| Enrichable documents       | 56,882 with null or stub content                               | Production DB audit              |
| Admin review queue         | Does not exist                                                 | —                                |
| Balance of Powers (P2.5)   | Spec complete, no code                                         | `BALANCE_OF_POWERS_PROPOSAL.md`  |

---

## Release Structure: 1A (Required) + 1B (Conditional)

Release 1 is split into two stages to protect calibration work from scope creep.

**Release 1A (must ship):**

- Phase 0: Content enrichment (FR + DOJ) + re-embed + recompute baselines
- Phase 0 parallel: Narrative prompt improvements
- A1: L3 baseline recomputation on clean data
- A2: Per-category L1 threshold calibration
- A3: Event retrospective harness
- B3: P1 calibration for remaining categories

**Release 1B (ship only after 1A hits targets):**

- B1: L3 re-evaluation as independent signal
- B2: Cross-category synchrony detection
- 0.3: LegiScan bill text enrichment (stretch)

**Conditional on 1A stability:**

- C1: Balance of Powers Phase A (design during Phase 0, build after 1A validation)

---

## Success Criteria

### Required (ship gate for 1A)

- Content enrichment complete for FR + DOJ (52K+ documents with full text)
- Re-embedding complete, baselines recomputed from clean data
- NC-3 passes all categories (≤5% Elevated for ≥20 docs/week, ≤10% for thin)
- Retrospective harness operational and producing reproducible reports
- T2 detection rate: no regression from current 84%
- No category with materially worse false positive rate than current

### Target

- Known-event detection rate improves from 77% to 85% (measured across both T1 and T2)
- T2 validation set: improve on at least 3 specifically targeted misses

### Stretch

- L3 graduates to independent signal for some or all categories
- Balance of Powers "Checks Activated" panel ships

---

## Prioritized Implementation Plan

### Phase 0: Content Enrichment (Weeks 1–2)

Everything downstream — embeddings, L3 baselines, thematic drift detection — is only as good as the document content it's built on. **56,882 documents** currently have null or stub content that could be enriched from existing APIs. These documents embed on title-only, producing low-quality vectors that degrade L3 centroid calculations. Enriching content before recomputing baselines is the single highest-leverage preparatory step.

#### 0.1 Federal Register Full-Text Enrichment

**Priority: Critical** | Effort: Medium | **52,711 documents** (24K null + 29K abstract-only)

The FR fetcher currently stores only abstracts. The FR API provides full document text via `raw_text_url`, but `backfill:content --source fr` only enriches Presidential Documents today. The other 50K+ (Notices, Rules, Proposed Rules) are left as stubs.

**Current state by FR document type:**

| Type                  |  Total | Null content | Short (<400) | Has content (>400) |
| --------------------- | -----: | -----------: | -----------: | -----------------: |
| Notice                | 70,568 |       23,888 |       20,196 |             26,484 |
| Rule                  | 26,804 |          206 |        6,270 |             20,328 |
| Proposed Rule         | 13,901 |           10 |        2,108 |             11,783 |
| Presidential Document |  2,617 |           33 |            0 |              2,584 |

**Work:**

1. Extract document number from URL (pattern: `/documents/YYYY/MM/DD/{doc_number}/slug`) — all 24K null-content docs have this pattern
2. Expand `backfill:content --source fr` to fetch full text for all FR types (not just Presidential Documents):
   - Call `https://www.federalregister.gov/api/v1/documents/{doc_number}.json`
   - Extract `raw_text_url` → fetch and store plain text
   - Fall back to `body_html_url` → strip HTML if raw text unavailable
3. Run enrichment with rate limiting (FR API allows 1,000 requests/hour)
4. Enriched docs automatically get `embedded_at = NULL` for re-embedding

**Estimated API calls:** ~52K documents ÷ 1,000/hour = ~52 hours of API time. Runs unattended.

**Decision: Enrich everything.** Don't filter by FR `action` field. Building a filter requires engineering effort and edge-case handling, and risks missing relevant documents. The embedding model naturally produces low-information vectors for thin documents (meeting announcements), which dampens their centroid impact. The cost of over-enriching is unattended API time; the cost of under-enriching is permanently degraded embeddings for documents that turn out to matter.

**Scope: All periods (2017–2026).** T2 analysis-period documents need good embeddings too — L3 measures drift against baseline centroids using current-week vectors. Both sides of the comparison must be clean.

---

#### 0.2 DOJ Full-Body Fix

**Priority: High** | Effort: Small (code fix) | **2,758 documents**

The DOJ API returns the full press release `body`, but the fetcher truncates to ~800 chars (stores `teaser` instead of `body`). This is a code-level fix, not a new pipeline.

**Work:**

1. Fix `doj-fetcher.ts` to store full `body` field instead of truncating to teaser
2. Add DOJ source to `backfill:content` (re-fetch full body for existing short docs)
3. Run enrichment

**Decision: API `body` field is sufficient.** Don't add HTML page scraping — that introduces fragility. If the API body is truncated for some documents, investigate those specific cases during the enrichment run.

---

#### 0.3 LegiScan Bill Text (Deferred to 1B)

**Priority: Low** | Effort: Medium | **1,024 documents**

**Decision: Defer.** State-level bills are the lowest-priority documents for L3 centroid quality. Title+description embeddings are adequate for state legislation. Spend effort on the 52K federal documents instead.

---

#### 0.4 Enrichment → Re-embed → Recompute Pipeline

**Priority: Critical** | Effort: Small (orchestration) | Prerequisite: 0.1 + 0.2

After content enrichment, the pipeline must flow through:

1. `pnpm backfill:content` — enrich all sources (sets `embedded_at = NULL` on updated docs)
2. `pnpm embeddings:backfill --all-dates` — re-embed enriched docs with full content across all periods
3. `pnpm baselines:compute` — recompute L3 centroids from content-rich embeddings (excluding `metadata_only`)
4. `pnpm backtest` — measure detection impact

This sequence is the prerequisite for Phase A's L3 baseline work.

---

#### 0.5 Narrative Prompt Improvements (Parallel)

**Priority: High** | Effort: Small | Prerequisite: None

Ship alongside Phase 0 enrichment work. These are prompt-only changes to `narrative-prompts.ts` — zero infrastructure cost, immediate quality improvement:

- Evidence-proportional length (don't pad thin weeks)
- "Why this might matter" framing
- Weighted counter-arguments (proportional to claim strength)
- L2-empty transparency (acknowledge when no AI assessments exist)
- Small-sample caveats
- GPT-4o evidence-sufficiency criterion for the feedback pass
- Weekly/term summary improvements

**Tiered narrative generation:** Reduce 3-pass pipeline (Claude draft → GPT-4o feedback → Claude revision) to single-pass with automated validation for Elevated and Stable statuses. Reserve full 3-pass for ConfirmedConcern and Divergent only. Cuts narrative generation cost ~60% and latency ~60%.

---

### Phase A: Detection Foundation (Weeks 2–4)

These items unblock everything else. A2 and A3 can start in parallel with Phase 0.

#### A1. Layer 3 Baseline Recomputation

**Priority: Critical** | Effort: Medium | Prerequisite: Phase 0

Layer 3 baselines are contaminated by two problems: (1) ~164K CourtListener docket stubs and ~60K GDELT metadata-only documents inflating the noise floor, and (2) ~52K documents with title-only embeddings due to missing content (now addressed by Phase 0). Both issues cause a 44% false positive rate and make L3 useless as an independent signal.

**Work:**

1. Modify `baselines:compute` to exclude `metadata_only` documents from centroid computation
2. Recompute all 4 baseline period centroids (Biden 2021, Biden 2022, Trump T1 2017, Trump T1 2018) — now using content-rich embeddings from Phase 0
3. Recalculate per-category noise floors (mean + SD of week-to-week embedding distances)
4. Run backtest to measure impact on known-event detection

**Success criteria:** Baseline FP rate drops from 44% to <15%. At least 2-3 known events show independent L3 detection (currently 0).

---

#### A2. Per-Category L1 Threshold Calibration

**Priority: Critical** | Effort: Medium | Prerequisite: None (can start during Phase 0)

All categories use the same global structural anomaly threshold (`STRUCTURAL_ANOMALY_THRESHOLD = 2.5`). Thin categories (<10 docs/week: elections, infoAvailability, hatch, mediaFreedom) produce noisy z-scores that inflate false positive rates. The current dampening (`STRUCTURAL_MIN_DOC_COUNT = 10`) helps but is a blunt instrument.

**Decision: Option B (manual overrides) for 1A, with Option A infrastructure built alongside.**

- Compute per-category baseline distributions (mean/stddev per structural dimension) regardless — they're diagnostic data needed for either approach
- Use distributions to inform manual threshold choices for failing categories
- If manual thresholds feel unprincipled after iterations, upgrade to Poisson-based intervals in 1B

**Work:**

1. Compute per-category baseline distributions (mean/stddev of JSD, volume, composition, authority, velocity) from Biden 2021+2022
2. Store per-category thresholds in `scoring-config.ts` (or a new `category-thresholds.ts`)
3. Set manual threshold overrides for thin categories based on distribution analysis
4. Validate: all categories pass NC-3 (≤5% Elevated for high-volume, ≤10% for thin)

---

#### A3. Event Retrospective Harness

**Priority: High** | Effort: Medium (~300 LOC) | Prerequisite: None (can start during Phase 0)

A reusable tool for running known events through the complete detection pipeline. Currently `pnpm backtest` reads stored weekly*aggregates — it measures what was detected, not what \_would be* detected with current settings. The harness should re-run detection from scratch on historical data to evaluate calibration changes.

**Decision: Stored AI assessments by default, with `--rerun-ai` flag for specific categories.**

- Stored `ai_document_assessments` as default — cheap, fast, reproducible
- `--rerun-ai` flag for categories being calibrated (captures prompt changes)
- The harness must run both T1 and T2 event sets — optimizing for T1 alone could degrade T2

**Work:**

1. Build `pnpm retrospective --event <id>` CLI that:
   - Loads documents for the event's week + category
   - Runs L1 structural scoring with current thresholds
   - Runs L2 assessment summary from stored AI assessments (or re-runs with `--rerun-ai`)
   - Runs L3 thematic drift with current baselines
   - Runs convergence synthesis
   - Compares result against expected status
2. Batch mode: `pnpm retrospective --all` runs all 43 events (both T1 and T2)
3. Output: detection report showing per-layer contribution, which layer(s) fired, comparison to expected

---

#### B3. P1 Calibration for Remaining Categories

**Priority: Medium** | Effort: Small per category | Prerequisite: None

Included in 1A because it directly improves detection accuracy without depending on clean baselines.

civilLiberties was calibrated in Sprint R-CAL1 (73% → 3.1% P1 flag rate). elections has 70.5% P1 flag rate (but only 61 total docs — low cost impact). infoAvailability has 2.4% P2 confirmation rate (possible over-filtering).

**Work:**

1. Audit elections P1 descriptions — apply threat-vector framing ("Government actions that restrict voting access") instead of topic framing
2. Audit infoAvailability P2 confirmation — is P1 sending appropriate candidates?
3. Re-run P1 on a sample for each adjusted category, measure flag rate change
4. Backfill L2 assessments for adjusted categories

---

### ── 1A GATE (Week 5) ──

**Evaluate against Required success criteria before proceeding to 1B:**

- Content enrichment complete, baselines recomputed?
- NC-3 passes all categories?
- Retrospective harness operational?
- T2 detection rate: no regression?

If gate passes → proceed to Phase B (1B items). If not → fix regressions before proceeding.

---

### Phase B: Detection Accuracy — Release 1B (Weeks 5–7)

#### B1. Layer 3 Re-evaluation as Independent Signal

**Priority: High** | Effort: Medium | Prerequisite: A1 (1A gate passed)

After baseline recomputation, evaluate whether L3 can graduate from reinforcement-only to independent detection.

**Work:**

1. Run backtest with L3 as independent signal (modify convergence synthesis to count L3 alone)
2. Measure: precision (what % of L3-only detections are real?), recall (does L3 catch events L1/L2 miss?)
3. Audit top 10 L3-only detections manually — are they false positives or genuine semantic drift?
4. If precision >60%: promote L3 to independent signal (can be per-category, not binary global)
5. If precision <60%: investigate alternative threshold calibration (try 2.5, 3.0 instead of 3.5), consider per-category L3 thresholds
6. Update convergence synthesis to remove reinforcement-only guard if warranted

**Success criteria:** L3 independently detects ≥3 known events that L1/L2 miss, with baseline FP <10%. L3-only detections must include at least one gradual-drift event (e.g., T2-5 deferred resignation over 6+ months, T2-7 Schedule F evolution over 12 months) — not just volume spikes that L1 could have caught with different thresholds. L3's unique value proposition is detecting slow semantic drift, not duplicating L1's structural detection with different math.

**Note:** L3 graduation can be per-category, not binary global. Some categories may have cleaner embeddings than others.

---

#### B2. Cross-Category Synchrony Detection

**Priority: Medium** | Effort: Medium (~50-80 LOC) | Prerequisite: None (independent, quick win)

Currently the synchrony chart counts how many categories are elevated per week. True synchrony detection would identify _coordinated_ elevation — when specific categories reliably co-occur (e.g., civilService + executiveOversight + executiveActions spiking together suggests coordinated institutional pressure).

**Work:**

1. Compute pairwise category co-elevation frequency (how often are categories X and Y both elevated in the same week?)
2. Compare against baseline co-elevation rates to find unusual clustering
3. Define synchrony score: weighted by how many unusual pairings are active
4. Surface in overview: "3 categories showing coordinated elevation (historically independent)"
5. Optional: temporal lag detection (does category A spike 1 week before category B?)

**Decision: Pairwise co-elevation is sufficient for 1B.** Embedding-based semantic similarity between categories is more powerful but much more complex. Start with the statistical approach; upgrade if co-elevation proves insufficient.

---

### Phase C: Balance of Powers Phase A (Weeks 6–9, conditional on 1A stability)

#### C1. P2.5 Check Classification

**Priority: High** | Effort: Medium-Large | Prerequisite: 1A gate passed, stable P2 pipeline

**Decision: Design schema during Phase 0, build after 1A validation.** The 4-table schema is well-specified. Do schema design and migration while enrichment runs unattended. Start P2.5 classification work only after A1-A3 prove the detection foundation is stable. Ship "Checks Activated" panel in Release 1 only if extraction quality is clearly good; otherwise push to 1B.

**Work:**

1. **Schema migration:**
   - Add `check_direction`, `check_type`, `checked_action_refs`, `linkability` columns to `ai_document_assessments`
   - Create `document_identifiers` table (lookup for matching)
   - Create `check_links` table (resolved constraint pairs)
   - Create `check_balance_weekly` table (aggregated metrics)
2. **Identifier extraction:** Regex patterns to populate `document_identifiers` from existing document titles/metadata (EO numbers, FR citation patterns, case numbers, bill numbers)
3. **P2.5 prompt + classification:** gpt-4o-mini pass on P2-assessed documents + check-heavy sources (CourtListener, GAO, LegiScan)
4. **Matching pipeline:** Tiered matching (exact ID → raw ID → title+date → embedding similarity)
5. **"Checks Activated" panel:** Category detail page shows institutional responses for selected week
6. **Coverage heatmap:** Internal diagnostic showing which directional edges have adequate signal

**Decision: Start narrow on P2.5 scope.** P2-assessed documents + check-heavy sources as the proposal specifies. Run 500-document recall sample to determine whether expansion is needed. Cost for expanded scope is modest (~$1-3/week at gpt-4o-mini prices) so expansion is likely the default, but validate first.

**Decision: Phase A has standalone value.** The "Checks Activated" panel is immediately useful independent of the Phase B triangle visualization. When a user sees civilService at ConfirmedConcern and the panel shows "Judicial → Executive: 2 injunctions filed this week," that's useful context regardless of whether Release 3 ever ships.

**Expected signal strength by edge:**
| Edge | Strength | Primary sources |
|------|----------|-----------------|
| Judicial → Executive | Strong | CourtListener injunctions/rulings |
| Executive → Legislative | Strong | FR signing statements, EOs |
| Legislative → Executive | Medium | GAO reports, LegiScan constraint bills |
| Others | Weak-Low | Low volume, may not be viable |

---

### Phase D: Human Review Infrastructure (Post-1A, post-launch)

#### D1. Admin Review Queue

**Priority: Medium** | Effort: Medium | Prerequisite: Dashboard operational

**Decision: No auth before launch.** The public site is already live. Add auth when building the review queue. Simple shared-secret token or GitHub OAuth for 2-3 trusted reviewers is sufficient initially.

**Work:**

1. Auth layer (GitHub OAuth for trusted reviewers)
2. Review queue page: shows P2-flagged documents with AI reasoning
3. Review actions: Confirm, Override (with reason), Skip
4. Storage: `human_reviews` table (document_url, reviewer_id, action, reasoning, timestamp)
5. Dashboard for review stats (reviewed %, agreement rate with AI)

---

#### D2. Feedback Learning Pipeline

**Priority: Lower** | Effort: Medium-Large | Prerequisite: D1 operational

**Decision: Defer to post-launch.** The review queue (D1) needs volume before feedback patterns emerge. Start simple — a quarterly manual review of override patterns is adequate initially.

---

### Phase E: Supplementary Sources (Flexible timing)

| Source                   | Value                             | Blocker                  | Decision                               |
| ------------------------ | --------------------------------- | ------------------------ | -------------------------------------- |
| Oversight.gov IG reports | executiveOversight signal         | No reliable API          | Blocked, monitor for API availability  |
| VRL calibration data     | Validates LegiScan classification | Data access TBD          | Validation aid, not a detection source |
| CBO reports              | Fiscal category signal            | Low volume, small effort | Quick win if fiscal underperforms      |

---

### Phase F: Platform & Media (Defer)

**Decision: Defer media signal entirely.** A MediaCloud API spike (1-2 days) is worth doing as investigation, but the full media signal feature is its own release.

Platform polish (onboarding, mobile, performance) is scoped after core detection work.

---

## Dependency Graph

```
Phase 0 (parallel work):
  0.1 (FR Enrichment) ──┐
  0.2 (DOJ Fix)        ─┤
                         ├→ 0.4 (Re-embed + Recompute) ──→ A1 (L3 Baselines)
  0.5 (Narrative prompts) ─── (parallel, ships with 1A)
  C1 schema design      ─── (parallel, design only)

Phase A (parallel with Phase 0 where noted):
  A2 (Per-cat L1)       ─── (start during Phase 0)
  A3 (Retrospective)    ─── (start during Phase 0)
  B3 (P1 Calibration)   ─── (start during Phase 0)

── 1A GATE (Week 5) ──

Phase B (only after 1A gate):
  A1 ──→ B1 (L3 Re-evaluation)
  B2 (Synchrony)        ─── (independent, quick win)

Phase C (only after 1A stable):
  C1 (BoP Phase A)      ──→ Release 3 (BoP visualization)

Post-launch:
  D1 (Review Queue)     ──→ D2 (Feedback Pipeline)
```

---

## Resolved Questions

### Content Enrichment

| #   | Question             | Decision                    | Rationale                                                                                                                 |
| --- | -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | FR Notice filtering  | Enrich everything           | Batch operation runs unattended. Filtering is more work than enriching. Embedding model naturally dampens thin documents. |
| 2   | DOJ body vs. scrape  | API `body` field sufficient | Don't add HTML scraping fragility. Investigate API truncation cases if they arise.                                        |
| 3   | LegiScan feasibility | Defer to 1B stretch         | Lowest-priority docs for L3 quality. Title+description adequate for state bills.                                          |
| 4   | Enrichment scope     | All periods (2017–2026)     | Both sides of L3 comparison need clean vectors. T2 title-only embeddings are as bad as contaminated baselines.            |

### Detection Strategy

| #   | Question                    | Decision                                                                                                           | Rationale                                                                                                      |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 5   | Per-category thresholds     | Option B (manual) for 1A, Option A infrastructure alongside                                                        | Compute per-category distributions regardless. Manual overrides ship fast. Upgrade to Poisson in 1B if needed. |
| 6   | L3 graduation criteria      | ≥3 independent detections, <10% baseline FP, must include ≥1 gradual-drift event. Per-category graduation allowed. | L3's value is slow drift detection, not duplicating L1. Per-category allows partial graduation.                |
| 7   | Retrospective harness scope | Stored AI assessments default, `--rerun-ai` flag for calibration                                                   | Default must be cheap enough to run on every calibration change. Must run both T1 and T2 events.               |

### Balance of Powers

| #   | Question                 | Decision                                                                      | Rationale                                                                           |
| --- | ------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 8   | P2.5 scope               | Start narrow (P2-assessed + check-heavy sources), expand after recall test    | Validate before committing to 336K docs. Expansion cost is modest.                  |
| 9   | Phase A standalone value | Yes — "Checks Activated" panel is useful independent of Phase B visualization | Court injunctions + GAO reports in category context are immediately valuable.       |
| 10  | Schema timing            | Design during Phase 0, build after 1A validation                              | Parallel design, sequential build. Ship only if extraction quality is clearly good. |

### Platform & Process

| #   | Question            | Decision                                                  | Rationale                                                                           |
| --- | ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 11  | Auth requirement    | No auth before launch                                     | Public site is live. Add auth with review queue post-launch.                        |
| 12  | Media signal timing | Defer entirely                                            | MediaCloud spike worth 1-2 days investigation, but full feature is its own release. |
| 13  | Detection target    | 85% across T1+T2 combined, explicit T2 no-regression gate | Prevents optimizing T1 at T2's expense. T2 events are what the public cares about.  |

---

## Timeline

| Phase       | Weeks      | Scope                                                                                                                       | Ship gate                                       |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0           | 1–2        | FR enrichment, DOJ fix, re-embed, recompute baselines. Narrative prompt changes in parallel. BoP schema design in parallel. | Enrichment complete, baselines recomputed       |
| A           | 2–4        | L3 baselines on clean data, per-category L1 thresholds, retrospective harness, P1 calibration                               | NC-3 passes all categories, harness operational |
| **1A GATE** | **Week 5** | **Evaluate: NC-3, detection rate, T2 no-regression**                                                                        | **Ship/no-ship decision**                       |
| B           | 5–7        | L3 re-evaluation (only if 1A gate passes), cross-category synchrony                                                         | L3 graduation decision                          |
| C           | 6–9        | Balance of Powers Phase A (only if 1A stable)                                                                               | "Checks Activated" panel                        |

**Total for 1A:** ~5 weeks (2 weeks enrichment + 3 weeks calibration, with parallelism — A2, A3, B3 proceed while enrichment runs).

**Total for 1A + 1B + C:** ~9 weeks if everything goes well. The 1A gate at Week 5 is the decision point for whether to proceed with 1B/C or ship 1A alone.
