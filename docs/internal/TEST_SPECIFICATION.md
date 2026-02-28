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

### Incremental Snapshot Pipeline (Sprint R-S1e)

- **Incremental fetch completeness**
  - Seed DB with documents up to date X for a source/category pair. Run snapshot. Assert it fetches all documents from date X-2 days to today (not just latest 20).
  - For a high-volume signal (>20 docs/day), assert all documents are captured — no silent loss from page-size cap.
  - With no prior data in DB for a source/category, assert fallback to `fetchRecent` behavior.

- **Overlap buffer dedup**
  - Seed DB with documents from days 1-5. Run snapshot with 2-day overlap buffer. Assert documents from days 4-5 are upserted (not duplicated), documents from day 6+ are inserted.
  - Assert `fetch_log` records both `fetchedCount` (all items from API) and `storedCount` (new items after dedup).

- **Cron lock**
  - Acquire lock for `snapshot`. Attempt second acquisition. Assert second returns false (lock held).
  - Acquire lock, simulate 7-hour age (>6-hour staleness threshold). Assert staleness check returns true and lock can be stolen.
  - Acquire lock, release it. Assert subsequent acquisition succeeds.
  - Assert different job names (`snapshot`, `legiscan_weekly`) can hold locks simultaneously.

- **LegiScan weekly cron**
  - Run LegiScan cron. Assert bills stored in documents table with correct `source_origin = 'legiscan'` and category tags.
  - Assert Layer 2 assessment runs on newly stored bills.
  - Assert `source_health` and `fetch_log` entries are recorded.
  - Run cron twice with unchanged `dataset_hash`. Assert second run skips download (hash-based idempotency).

- **fetch_log semantic distinction**
  - Assert source silence detection uses `fetchedCount`, not `storedCount`.
  - Assert `fetchedCount > 0` with `storedCount = 0` (overlap buffer dedup) does not trigger silence alert.
  - Assert `fetchedCount = 0` with HTTP 200 is recorded as source quiet (not pipeline error).

### Cross-Source Document Deduplication

- **Canonical ID extraction per source type**
  - Assert each fetcher (GovInfo, DOJ, CourtListener, LegiScan, FEC, FCC, IG RSS, Federal Register) extracts a `canonical_id` from its response when one is present.
  - Assert `canonical_id` is NULL (not empty string) when source does not provide a document identifier.

- **Cross-source normalization**
  - GovInfo packageId `"GAOREPORTS-GAO-26-107283"` and GAO RSS URL-derived `"GAO-26-107283"` normalize to the same canonical_id.
  - GovInfo IG report packageId and IG RSS feed report_id normalize to the same canonical_id for a known overlapping document.

- **Dedup at ingestion (per-category uniqueness)**
  - Insert a document with `canonical_id = "GAO-26-107283"` in category `executiveOversight` from GovInfo. Attempt insert of same document with different URL from GAO RSS but same normalized canonical_id in same category. Assert second insert returns `'duplicate'` and row count does not increase.
  - Insert two documents with `canonical_id = NULL` and different URLs. Assert both are inserted (no false dedup on NULL).
  - Insert two documents with different `canonical_id` values and same URL in same category. Assert second is rejected by existing URL composite unique (URL dedup still works as fallback).

- **Multi-category safety (canonical_id is per-category, not global)**
  - Insert a document with `canonical_id = "DOJ-PR-2025-1234"` in category `lawEnforcement` (primary). Insert same canonical_id in category `civilLiberties` (secondary routing). Assert both inserts succeed — same canonical_id in different categories is legitimate, not a duplicate.
  - Assert `UNIQUE(canonical_id, category) WHERE canonical_id IS NOT NULL` constraint allows this. A global `UNIQUE(canonical_id)` would break multi-category routing.

- **Monitoring integration**
  - Assert duplicate-rejection events are logged with both source types (e.g., "GovInfo→GAO duplicate rejected").
  - Assert coverage health dashboard includes duplicate-rejection rate per source pair.
  - Concrete test: ingest 10 GovInfo GAO reports, then ingest the same 10 via GAO RSS → assert 10 duplicates rejected, 0 new rows.

### Backfill Completeness Verification

- **Per-source API-vs-DB count comparison**
  - For each source type × baseline period, compare API result count against DB document count.
  - FEC: assert exact match (0 delta) — API supports precise date filtering.
  - GovInfo: assert ≤1% delta — near-perfect, small boundary-date edge cases acceptable.
  - CourtListener NOS signals (440, 530, 890): assert ≤3% delta — pagination cap may clip peak weeks.
  - DOJ: structural verification (complete fetch_log rows per category-week, maxPages sufficient for weekly windows).

- **Text-search signal pagination fitness**
  - For all CourtListener text-search signals (e.g., `cl_first_amendment`): assert peak weekly result count ≤ pagination cap (200 at maxPages=10, or current maxPages × 20).
  - If peak weekly exceeds cap, the query is too broad and must be scoped further before backfill is valid.
  - Concrete test: query `cl_first_amendment` for the highest-volume week in Trump T1. Assert result count ≤ 200.

- **NOS signal pagination fitness (post-maxPages bump)**
  - For CourtListener NOS signals (440, 530, 890): assert peak weekly result count ≤ 300 after maxPages=15 bump (15 × 20 results/page).
  - If peak weekly exceeds 300, the NOS code requires further scoping or an additional maxPages increase.
  - Concrete test: query each NOS code for the highest-volume week in Trump T1. Assert result count ≤ 300.

- **FR signal completeness**
  - Assert all 13 categories have at least one FR signal with documents in all baseline periods.
  - Concrete test: `SELECT category, COUNT(*) FROM documents WHERE source_origin = 'federal_register' GROUP BY category` returns rows for all 13 categories.

- **GDELT cross-feed completeness**
  - Assert all 13 categories have GDELT rhetoric documents routed via cross-feed in all baseline periods.
  - Concrete test: `SELECT category, COUNT(*) FROM documents WHERE source_origin = 'gdelt' AND category != 'intent' GROUP BY category` returns rows for all 13 categories.
  - Critical for immigrationEnforcement, lawEnforcement, civilLiberties (new categories added after Sprint R1/R3.2 cross-feed was initially validated against 11 categories).

- **Post-fix re-backfill integrity**
  - After `cl_first_amendment` query rewrite: assert zero documents remain with the old query signature (purge was complete).
  - After FR gap fill: assert lawEnforcement, civilLiberties, mediaFreedom, and immigrationEnforcement each have FR documents in all 4 baseline periods + Trump T2.
  - After GDELT re-cross-feed: assert lawEnforcement, civilLiberties, and immigrationEnforcement each have GDELT documents in all 4 baseline periods + Trump T2.

### Source-Type Embedding Segregation

- For a category with multiple source types:
  - Assert embeddings are generated/stored with source-type tags.
  - Assert Layer 3 computes per-source-type centroids and drift scores independently.
  - Assert adding a new source type to a category does NOT invalidate existing source-type embedding baselines.
  - Assert Layer 1 structural scoring operates at category level by aggregating per-source-type scores.

### Stratified L2 Audit Sampling

- Stratification is by **(category × sourceType)**, not just category. Each active (category, sourceType) bucket must have a minimum number of sampled documents in the audit. This prevents "random 2% globally" from accidentally under-sampling thin source types within a category.
- For a week with multiple (category × sourceType) buckets:
  - Assert audit sample includes at least the minimum per active bucket (e.g., ≥1 per bucket if bucket has ≥10 docs, or proportional minimum for smaller buckets).
  - Assert no active (category × sourceType) bucket is entirely unsampled.
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

### Router Drift Detection + Baseline Invalidation

- Re-route the same frozen corpus with the same bundle:
  - Category distribution must match within tight bounds (or exactly, if deterministic).
- Re-route with a new bundle:
  - Distribution shift beyond threshold must raise a **router-drift warning** and force baseline regeneration or "baseline invalid" banner for affected categories.
- **Ship gate: baseline invalidation on bundle change.** If the router bundle (model version, prompt, or classification rules) changes, and the resulting category distribution shift exceeds threshold for any category, the system **must not produce weekly statuses for that category** until baselines are recomputed with the new bundle. This prevents "instrument changed" from being misread as "government changed." Concretely: weekly status computation checks that baseline bundle version matches current bundle version; mismatch → status = `BaselineInvalid` (not Stable, not Elevated).

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
- [ ] Cross-source dedup catches overlapping documents (canonical_id normalization works for GovInfo↔GAO and GovInfo↔IG pairs; NULL canonical_ids do not false-dedup)
- [ ] Backfill completeness verified: API-vs-DB counts within tolerance per source type; all text-search signals fit pagination cap; all 13 categories have FR documents; all 13 categories have GDELT cross-feed documents
- [ ] L2 audit is stratified by (category × sourceType) with minimum per active bucket, and always produced
- [ ] Pass 2 mechanism extraction fields present for concerning documents
- [ ] Narrative minimum document threshold enforced (≥ 3 citable docs)
- [ ] Reproducibility holds for same bundle; drift warnings fire for changed bundle
- [ ] Baseline invalidation: bundle version mismatch between baseline and current → status = `BaselineInvalid` (system must not produce Stable/Elevated statuses from stale baselines)
- [ ] Calibration meets false-positive targets (Biden baselines > 95% Stable)
- [ ] Known-events sanity set triggers as expected

---

_This checklist should be converted to test fixtures and PR template checkboxes before Sprint R-S1 implementation begins._
