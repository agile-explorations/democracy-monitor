# Democracy Monitor — Test Specification (Ship/No-Ship Gates)

**Source:** ChatGPT architecture review (2026-02-25), with additions from project analysis.
**Status:** Pre-implementation. Maps to `ARCHITECTURE_PROPOSAL.md` §Layer 1–3, §Convergence Synthesis, §Sprint R-S1.

These are **gates**: if any item fails, you don't ship that bundle.

---

## Unit Tests (Logic Correctness)

### Category Routing

- **Primary + secondary invariants**
  - Every doc returns exactly **one primaryCategory**.
  - Secondary categories are **0..N**, each with confidence ∈ [0,1].
  - Primary category confidence ≥ any secondary confidence (or explicit rule if not).

- **Determinism for a pinned bundle**
  - Given fixed router model + prompt + inputs, routing output is identical across runs (hash match).

- **Rhetoric cross-feed**
  - For a rhetoric doc, secondary categories can be assigned; those secondaries are persisted and queryable for per-category baselines/convergence.
  - Rhetoric documents routed to `primaryCategory` (not `'intent'`) appear in Layer 1 source convergence counts for that category.

### Structural Anomaly Scoring

- **Z-score math sanity**
  - If `current == baselineMean`, z ≈ 0.
  - If `std == 0`, behavior is defined (e.g., clamp std to epsilon) and test asserts no NaNs.

- **Asymmetric dampening bypass** (ref: `VOLUME_COLLAPSE_FRACTION = 0.25`)
  - If `docCount < baselineMean * collapseFraction`, then `dampeningFactor = 1.0` (collapse bypass).
  - If `docCount >= baselineMean * collapseFraction` and `docCount < STRUCTURAL_MIN_DOC_COUNT`, normal dampening applies.
  - Concrete test: source type with baseline mean of 50 docs/week dropping to 1 doc/week → strong negative z-score with dampeningFactor = 1.0, not 0.1.

- **Source influence cap** (ref: `SOURCE_MAX_WEIGHT = 0.4`)
  - No single source type contributes > SOURCE_MAX_WEIGHT (40%) to category composite, regardless of document volume.
  - Test: lawEnforcement with DOJ at 400 docs/week and CourtListener at 50 docs/week → DOJ contribution capped at 40%.

- **Minimum sample gates**
  - Concern rate is not computed / not eligible for status escalation until `nonAuditPass2Count >= AI_CONCERN_MIN_SAMPLE` (3).
  - Narrative generation blocked until `≥ 3 primary source documents` are citable.

- **FEC staleness handling**
  - FEC structural analyzer produces null on non-batch weeks (not carried-forward score).
  - `totalSourceCount` in convergence formula excludes FEC on non-batch weeks.
  - Stale FEC score never counted as "agreeing" with fresh anomaly from another source.

### Convergence Logic

- **Dependency-aware effective source count** (ref: source dependency map)
  - DOJ↔CourtListener, FR↔GDELT, LegiScan↔FR pairs receive 0.75× `convergenceFraction` when only 2 sources anomalous and they form a dependent pair.
  - When a third independent source corroborates, full weight applies.

- **Edge cases**
  - 1 anomalous source → status can be Elevated, never Divergent or Confirmed Concern (requires layersElevated ≥ 2).
  - 2 anomalous sources from a dependent pair with 0.75× weight → convergence score reduced; status depends on reduced score + Layer 2 concern rate (may still reach Confirmed Concern if concern rate is high, but threshold is harder to clear).
  - Convergence bonus is multiplicative: if `baseComposite ≈ 0`, convergence bonus produces ≈ 0 (convergence cannot create signal from noise).

### Status Mapping

- **Monotonicity**
  - Increasing anomaly magnitude or independent-source convergence cannot reduce status.
  - Adding a third anomalous source to a 2-source convergence cannot lower the status.

- **Semantic separation**
  - Detection status and narrative trigger are separate flags.
  - Status changes do not automatically force narrative — narrative requires ≥ 3 citable documents independently of status.

---

## Integration Tests (Pipeline Behavior End-to-End)

### "No Layer Gates Another Layer"

- Feed a mixed batch where keywords would have missed items historically:
  - Assert **every doc** is ingested → routed → embedded (as applicable) → eligible for L1 scoring.
  - Assert L2 does not depend on any keyword prefilter.
  - Assert L3 embedding is computed for all source types (not just FR/rhetoric).

### Multi-Source Ingestion + Coverage Health

- Simulate:
  1. Normal week (all sources producing expected volume).
  2. Source silent (no new docs from one feed — but source is operational).
  3. Pipeline failure (ingest job errors — source is available but pipeline is broken).
  4. Expected seasonal dip (e.g., LegiScan off-session, court recess).

- Assert UI/state distinguishes: **No Data vs. Source Silent vs. Pipeline Failure vs. Seasonal Dip**.
- Assert coverage health alert fires when source goes silent for >2× expected cadence.
- Assert DOJ taxonomy changes are logged as coverage health events, not structural anomalies.

### Source-Type Embedding Segregation

- For a category with multiple source types:
  - Assert embeddings are generated/stored with source-type tags.
  - Assert Layer 3 computes per-source-type centroids and drift scores independently.
  - Assert adding a new source type to a category does NOT invalidate existing source-type embedding baselines.
  - Assert Layer 1 structural scoring operates at category level by aggregating per-source-type scores.

### Stratified L2 Audit Sampling

- For a week with multiple (category × sourceType) buckets:
  - Assert audit sample includes at least the minimum per active bucket (or meets stratification rule).
  - Assert audit report is generated even if L2 narratives are suppressed by min-doc gate.

### Mechanism Extraction (Pass 2)

- For Pass 2 assessments on new-source documents:
  - Assert structured output includes mechanism fields (power expanded, oversight reduced, enforcement changed, due process changed, access gained).
  - Assert at least one mechanism field is non-empty for documents assessed as `potentially_concerning` or `clearly_concerning`.
  - Assert Opus narrative input includes mechanism fields when generating narratives.

### Bundle Versioning / Reproducibility

- Run the same input set twice with the same bundle:
  - Structural metrics + routing + convergence + status must match exactly.
- Run with a different bundle:
  - Differences must be attributed to bundle version change, and logged.

---

## Calibration Assertions (Instrument Behavior)

### Baseline Stability

- On a "known stable" historical window (Biden 2022):
  - % of weeks labeled Elevated+ stays below false-positive target (< 5%).
  - Confirmed Concern rate ≈ 0% (no Confirmed Concern in any Biden baseline).
  - After source expansion: Biden baselines still meet > 95% Stable target with new source-type baselines added.

### Sensitivity Sanity Checks (Known-Events Set)

- Curate a small set of "obvious" events expected to trigger:
  - At least one **volume-collapse** event (e.g., FEC 2025 quorum loss, IG firings).
  - At least one **cross-source convergence** event (e.g., DOGE-era civil service actions appearing in FR + GDELT + WhiteHouse).
  - At least one **mechanism extraction** outcome in Pass 2 (e.g., executive order expanding Schedule F authority → "power expanded: hiring/firing authority moved to political appointees").
  - At least one **thematic drift** event (e.g., LegiScan bill language shifting from "voter modernization" to "ballot security" within a session).

- Assertions:
  - First trigger layer is consistent with spec (L1 structural fires first for volume/structural events; L2 fires first for content-only events).
  - L2 narrative does not fire on < 3 primary documents.
  - Volume-collapse events produce dampeningFactor = 1.0 (bypass fires correctly).

### Router Drift Detection

- Re-route the same frozen corpus with the same bundle:
  - Category distribution must match within tight bounds (or exactly, if deterministic).
- Re-route with a new bundle:
  - Distribution shift beyond threshold must raise a **router-drift warning** and force baseline regeneration or "baseline invalid" banner for affected categories.

### Composition Monitoring

- For each category:
  - Source-mix distribution divergence from baseline produces a measurable metric.
  - Large source-mix shifts require either (a) a warning banner, or (b) exclusion from status escalation until enough time accrues.

---

## Ship/No-Ship Gate Summary

Ship a bundle only if ALL of these are true:

- [ ] Routing deterministic + primary/secondary schema passes
- [ ] Volume-collapse bypass works and is tested (dampeningFactor = 1.0 when docCount < baselineMean × 0.25)
- [ ] Source influence cap prevents single-source domination (≤ 40%)
- [ ] Dependency-aware convergence prevents correlated-noise inflation (0.75× for dependent pairs)
- [ ] FEC staleness produces null on non-batch weeks
- [ ] Coverage health distinguishes silence vs. failure vs. seasonal dip
- [ ] L2 audit is stratified and always produced
- [ ] Pass 2 mechanism extraction fields present for concerning documents
- [ ] Narrative minimum document threshold enforced (≥ 3 citable docs)
- [ ] Reproducibility holds for same bundle; drift warnings fire for changed bundle
- [ ] Calibration meets false-positive targets (Biden baselines > 95% Stable)
- [ ] Known-events sanity set triggers as expected

---

_This checklist should be converted to test fixtures and PR template checkboxes before Sprint R-S1 implementation begins._
