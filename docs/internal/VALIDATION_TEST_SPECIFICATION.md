# Democracy Monitor — Validation Test Specification

**Created**: 2026-03-05
**Purpose**: Known-event validation list, layer effectiveness assessment strategy, diagnostic queries, and data cleanup prerequisites. This document defines what the system should detect, how to measure whether each layer is contributing signal, and the concrete steps to get from current state to valid results.

**Relationship to other documents**:

- `ARCHITECTURE_PROPOSAL.md` — defines the three-layer architecture and convergence synthesis these tests validate
- `FUTURE_ROADMAP.md` §R-F9 — Event Retrospective Harness (the automated version of this manual validation)
- `TEST_SPECIFICATION.md` — ship/no-ship gate checklist (complementary; that covers unit/integration tests, this covers analytical validation)

---

## Table of Contents

1. [Prerequisites: Data Cleanup Before Validation](#prerequisites-data-cleanup-before-validation)
2. [Validation Event List](#validation-event-list)
3. [Negative Controls](#negative-controls)
4. [Layer Effectiveness Assessment](#layer-effectiveness-assessment)
5. [Diagnostic Queries](#diagnostic-queries)
6. [Interpreting Results and Tuning Strategy](#interpreting-results-and-tuning-strategy)

---

## Prerequisites: Data Cleanup Before Validation

Validation results are meaningless against contaminated data. The following cleanup must complete before running any validation tests.

### CourtListener Document Cleanup (validated 2026-03-05)

**Problem**: 164,494 CourtListener docket stubs have no meaningful content (jurisdiction codes like "28:1331 Fed. Question" or null). These flow through all three layers, producing noise: wasted L2 API calls on titles, unreliable assessments (e.g., a DC parking bill rated 0.95 `clearly_concerning`), and degraded L3 centroids from 5-word embeddings mixed with full-text embeddings.

**Population**: 164,494 `court_opinion` docket stubs (content-less) alongside 29,141 `judicial_opinion` documents (full text, linked by `case_id`). ~24,101 dockets have matching opinions; ~140,393 never will.

**Decision**: Mark all 164K `court_opinion` docket stubs as `metadata_only`. This is safe because:

- **L1 (structural)**: No filtering on `metadata_only` in weekly aggregator or structural anomaly service. Volume counts, NOS distribution, court level distribution, injunction rates all preserved.
- **L2 (AI assessment)**: `metadata_only` excluded from `backfill-layer2.ts`. Stops wasting API calls on jurisdiction codes.
- **L3 (thematic drift)**: Embedder skips `metadata_only` documents. Existing embeddings from stubs stop polluting centroids.
- **Keyword scoring**: `metadata_only` filter added to `recompute-scores.ts` (2026-03-05). Keyword scores no longer run on content-less documents.

**Execution sequence** (order matters):

1. **Mark all 164K `court_opinion` stubs as `metadata_only`**

   ```sql
   UPDATE documents SET content_type = 'metadata_only'
   WHERE source_type = 'court_opinion';
   ```

2. **Delete their L2 assessments** — assessments produced from jurisdiction codes are garbage

   ```sql
   DELETE FROM ai_document_assessments
   WHERE url IN (
     SELECT url FROM documents WHERE source_type = 'court_opinion'
   );
   ```

3. **Reset embeddings and `embedded_at` to NULL** — stop them polluting L3 centroids

   ```sql
   UPDATE documents SET embedded_at = NULL, embedding = NULL
   WHERE source_type = 'court_opinion';
   ```

   Embeddings are stored inline on the documents table (`embedding vector(1536)` column). Centroid computation filters on `embedding IS NOT NULL`. Both `embedded_at` and `embedding` must be NULLed — resetting only `embedded_at` would leave zombie vectors that centroid computation still picks up. (Confirmed with Claude Code 2026-03-05.)

4. **Add `metadata_only` filtering to L2 pipeline and keyword scorer** — three permanent fixes:
   - In `backfill-layer2.ts`: add ≥100 char content gate. Skip documents where `content` is NULL or `LENGTH(content) < 100`. Log skipped count for operational monitoring. Applies universally (CL, LegiScan title-only bills, FR null-content docs). **Important:** if a skipped document is from a source type with known backfillable content (FR documents where the API provides full text, WH documents where the URL can be fetched), log it separately as "content backfill candidate" rather than silently skipping — these are documents that _should_ be assessed once content is fetched.
   - In `recompute-scores.ts` / `document-scorer.ts`: `metadata_only` filter added (2026-03-05). Keyword scores no longer run on content-less documents.
   - **Content definition:** The ≥100 char gate applies to the `content` field (raw extracted text stored on the document row). Documents with short/null `content` from backfillable sources should be queued for content backfill, not permanently skipped.

5. **Recompute weekly aggregates** for CL-heavy categories (lawEnforcement, civilLiberties, judicialIndependence) after cleanup.

6. **Run L2 on the 29K `judicial_opinion` documents** — these have real content and should be assessed.

**Additional content gaps** (not blocking validation but noted):

- 536 LegiScan title-only bills (bill text not in bulk downloads; content gate handles them)
- 23,875 FR null-content documents (backfillable via FR API full-text endpoint — see Phase 2 content backfill plan)
- 4,323 WH title-only documents (URL fetch backfill planned)

### Verify `metadata_only` Classification Completeness

Before validation, confirm the full `metadata_only` population:

| Population                  | Count | Status                                                            |
| --------------------------- | ----- | ----------------------------------------------------------------- |
| GDELT rhetoric documents    | ~60K  | Confirmed `metadata_only`, 0 L2 assessments (verified 2026-03-05) |
| CourtListener docket stubs  | ~164K | Cleanup step above                                                |
| RSS headline-only documents | ~7K   | Leave as `full_text` for launch (have some content)               |

---

## Validation Event List

Events organized by period with expected categories, source types, and correct detection patterns per layer. Each event tests specific system capabilities.

### Preflight: Category Inventory Check

Before running any event validation, confirm the data exists. Run this first to avoid misinterpreting "category missing / not routed" as "layers are quiet":

```sql
-- Category inventory: what categories exist and how many docs per period?
SELECT category,
  COUNT(*) FILTER (WHERE published_at BETWEEN '2017-01-20' AND '2019-01-19') as trump_t1,
  COUNT(*) FILTER (WHERE published_at BETWEEN '2021-01-20' AND '2022-01-19') as biden_2021,
  COUNT(*) FILTER (WHERE published_at BETWEEN '2022-01-20' AND '2023-01-19') as biden_2022,
  COUNT(*) FILTER (WHERE published_at >= '2025-01-20') as trump_t2
FROM documents
GROUP BY category
ORDER BY category;
```

Then for each known-event week, confirm documents exist:

```sql
-- Spot check: do we have documents for the IG firing week?
SELECT category, source_type, COUNT(*)
FROM documents
WHERE published_at BETWEEN '2025-01-20' AND '2025-01-27'
GROUP BY category, source_type
ORDER BY category, source_type;
```

If a target category shows zero documents for an event week, the event test is invalid — the gap is in data ingestion, not detection.

### Trump T1 (2017–2018) — Baseline Period Events

These events occurred during a baseline period. The system isn't expected to flag baselines as concerning (baselines define the reference point). However, these events should produce **visible spikes relative to Biden baseline periods**. If Trump T1 and Biden periods are indistinguishable, calibration is wrong.

---

#### T1-1. Travel Ban Executive Orders

**Date**: Jan 27, 2017 (EO 13769); Mar 6, 2017 (EO 13780)
**Categories**: civilLiberties, immigrationEnforcement, judicialIndependence
**Sources**: FR (presidential document + DHS rulemaking), CourtListener (immediate TRO filings, NOS 440 and immigration NOS codes), DOJ (enforcement guidance)

**Correct detection**:

- **L1**: FR presidential document surge in week of Jan 23. CourtListener injunction filings spike weeks 1–4 (multiple federal courts issue TROs). NOS distribution shift toward immigration-related codes.
- **L2**: Executive orders flagged as `formal_override` erosion type. DHS implementation memos flagged.
- **L3**: Semantic shift in immigrationEnforcement toward enforcement-expansion language.

---

#### T1-2. James Comey Firing

**Date**: May 9, 2017
**Categories**: executiveOversight, judicialIndependence, lawEnforcement
**Sources**: WH (presidential statement), DOJ (AG/Deputy AG memos justifying firing), CourtListener (subsequent Special Counsel–related filings)

**Correct detection**:

- **L1**: Modest FR signal (no direct rulemaking). DOJ press releases shift topic toward "leadership transition." Potential source convergence: WH + DOJ + subsequent CL filings.
- **L2**: DOJ memos providing pretextual justification for removing an active investigator should be flagged. Erosion type: `institutional_capture` (removal of oversight figure).
- **L3**: May show DOJ output shifting semantically around this period.

---

#### T1-3. Jeff Sessions Recusal Pressure

**Date**: Feb–Mar 2017
**Categories**: judicialIndependence, lawEnforcement
**Sources**: DOJ (public statements), WH (presidential rhetoric)

**Correct detection**: **Expected miss.** The signal was in presidential statements and tweets, not in formal government documents. The system lacks rhetoric sources (Phase 6). Documenting this as an honest gap validates the rhetoric source roadmap.

---

#### T1-4. DACA Rescission

**Date**: Sep 5, 2017
**Categories**: civilLiberties, immigrationEnforcement, executiveActions
**Sources**: FR (DHS rulemaking), DOJ (AG Sessions memo), CourtListener (immediate legal challenges — multiple federal courts)

**Correct detection**:

- **L1**: FR rulemaking volume spike in immigrationEnforcement. CourtListener filing surge in civilLiberties.
- **L2**: DHS documents flagged as `formal_override`. AG memo flagged.
- **L3**: Semantic shift in immigrationEnforcement content.

---

#### T1-5. Family Separation Policy

**Date**: Spring 2018 (DOJ "zero tolerance" memo: Apr 6, 2018)
**Categories**: civilLiberties, immigrationEnforcement, lawEnforcement
**Sources**: FR (DHS enforcement memos), DOJ (AG Sessions zero-tolerance memo), CourtListener (Ms. L v. ICE, filed Jun 2018)

**Correct detection**:

- **L1**: CourtListener filings spike. FR shows DHS enforcement posture shift.
- **L2**: DOJ zero-tolerance memo flagged as `formal_override`. DHS enforcement memos flagged.
- **L3**: Semantic shift in immigrationEnforcement and lawEnforcement content.

---

### Trump T2 (Jan 20, 2025 – present) — Active Monitoring Period

These are the events the system must detect correctly. Ordered chronologically.

---

#### T2-1. Day One Executive Order Blitz

**Week of**: Jan 20, 2025
**Categories**: executiveActions (primary), civilService, immigrationEnforcement, civilLiberties, infoAvailability
**Sources**: FR (presidential documents — 20-30 EOs in first week vs. baseline ~2-3/week), WH (statements, fact sheets)

**What to detect**:

- **L1**: Massive structural anomaly in FR presidential document volume. Type composition shift (presidential documents from ~5% to ~40%+ of weekly output). Multiple categories simultaneously elevated = cross-category synchrony signal.
- **L2**: Schedule F reinstatement (civilService — `formal_override`), foreign aid freeze (executiveActions — `institutional_capture`), DEI order (civilService — `procedural_manipulation`). Multiple documents flagged across multiple categories.
- **L3**: Semantic shift across multiple categories simultaneously — the "all categories drifting at once" pattern.

**Why it matters**: Tests whether the system distinguishes "new administration transition activity" (Biden T1 also had EO surges) from the scale and substance of this transition. The negative control (NC-1) tests the other side of this comparison.

---

#### T2-2. Mass IG Firings

**Week of**: Jan 20, 2025 (firings: Jan 24)
**Categories**: executiveOversight (primary), judicialIndependence
**Sources**: WH (notification), IG RSS (sudden silence — 17 agencies lose IG output), GovInfo (congressional response documents), CourtListener (Feb 12, 2025 lawsuit by 8 fired IGs)

**What to detect**:

- **L1**: IG RSS sources go silent across multiple agencies simultaneously — the "institutional silence" signal. FR volume may not spike (no rulemaking involved). Cross-source pattern: structural silence (IG RSS) + media spike (GDELT) = convergence gap.
- **L2**: WH/DOJ documents justifying the firings should be flagged. Erosion type: `institutional_capture` (removal of oversight infrastructure). The fired-IGs lawsuit appears in CourtListener ~3 weeks later.
- **L3**: Remaining oversight documents may shift semantically (if new acting IGs produce different output).

**Why it matters**: Strongest test of the "missing data is itself a signal" design principle. Also tests convergence — structural silence (L1) + AI flagging (L2) should produce a higher-confidence signal than either alone.

---

#### T2-3. DOGE Entry into USAID / Agency Shutdown

**Week of**: Feb 3, 2025
**Categories**: executiveOversight, executiveActions, civilService, infoAvailability
**Sources**: WH (presidential statements, Rubio memo), FR (foreign aid freeze rulemaking), CourtListener (Feb 7 TRO by Judge Nichols), GDELT (massive media coverage spike)

**What to detect**:

- **L1**: GDELT volume spike for executiveActions/executiveOversight. CourtListener injunction filings. Source convergence: government documents (WH) + legal challenges (CL) + media coverage (GDELT) all firing simultaneously.
- **L2**: Rubio reorganization memo flagged as `institutional_capture`. Erosion type should reference congressional authority over agency creation.
- **L3**: Semantic shift in executiveOversight toward "reorganization" and "efficiency" language vs. "oversight" and "accountability" baseline language.

**Why it matters**: Tests cross-source convergence. Multiple independent institutional vantage points (executive action, judicial challenge, media coverage) should produce strong convergence signal.

---

#### T2-4. DOGE Access to Treasury Payment Systems

**Week of**: Jan 27 and Feb 3, 2025
**Categories**: fiscal, executiveOversight, infoAvailability
**Sources**: CourtListener (Feb 8 — Judge Engelmayer blocks access after 19 AG lawsuit), GDELT (coverage), WH (formal authorization if published)
**Signal density**: **Thin — expect 1-2 court filings + media coverage; little formal government document output.** Validation should not penalize L1 for being quiet on this event.

**What to detect**:

- **L2**: Documents granting DOGE access to sensitive payment data flagged. CourtListener injunction filing.
- **L1**: May be weak — the threat is in the substance of one document, not in volume or composition shifts. Do not interpret L1 silence as a failure for this event.

**Why it matters**: Tests whether the system catches threats to financial system integrity that manifest as a single high-impact document rather than a volume pattern.

---

#### T2-5. Deferred Resignation Program / Mass Federal Layoffs

**Week of**: Jan 27, 2025, continuing for months
**Categories**: civilService (primary), executiveActions
**Sources**: FR (OPM guidance, deferred resignation program rules), WH (executive orders), LegiScan (congressional response legislation)

**What to detect**:

- **L1**: Sustained OPM/personnel document volume above baseline — not a single-week spike but a sustained elevation over weeks/months.
- **L2**: Deferred resignation program flagged as `procedural_manipulation` (circumventing normal RIF procedures). OPM guidance documents flagged.
- **L3**: Sustained semantic shift in civilService documents toward termination/reduction language vs. hiring/management baseline. This is L3's unique value proposition — detecting gradual drift that no single week's L2 assessment would catch.

**Why it matters**: Tests detection of sustained, multi-week erosion. The system should see the _process_ (policy documents, OPM guidance, legal challenges), not just the _outcome_ (200K federal workers leaving).

---

#### T2-6. Probationary Employee Mass Firing

**Week of**: Feb 10, 2025
**Categories**: civilService (primary)
**Sources**: FR (OPM directive from Charles Ezell), CourtListener (legal challenges)

**What to detect**:

- **L2**: OPM directive flagged — agencies told to cite performance without evidence. Erosion type: `procedural_manipulation`.
- **L1**: OPM document spike. CourtListener filings follow in subsequent weeks.

---

#### T2-7. Schedule F / Schedule Policy/Career Reinstatement

**Dates**: Jan 20, 2025 (EO); Apr 2025 (proposed rule, 40K comments); Feb 6, 2026 (final rule published in FR)
**Categories**: civilService (primary)
**Sources**: FR (EO, proposed rule, final rule)

**What to detect**:

- **L2**: Each stage should produce escalating signal. The Jan 20 EO may be buried in the blitz (weak signal). The April proposed rule should be a clear flag — 50,000 positions stripped of civil service protections is `formal_override`. The Feb 2026 final rule should be the strongest signal.
- **L3**: Track semantic evolution of OPM documents from "workforce management" language toward "accountability to the president" language over 12+ months. This is the ideal L3 use case — gradual, sustained drift invisible to single-week L2 assessment.
- **L1**: FR document type shifts around the proposed rule (public comment volume spike) and final rule (formal rulemaking event).

**Why it matters**: Tests multi-stage detection. The same policy manifests as EO → proposed rule → comment period → final rule over 12+ months. The system should show escalation across stages.

---

#### T2-8. DOJ Career Official Firings

**Week of**: Feb 2025, continuing
**Categories**: lawEnforcement (primary), judicialIndependence
**Sources**: DOJ (press releases about leadership changes), CourtListener (if removed officials challenge), WH (formal statements)

**What to detect**:

- **L2**: DOJ documents about removing career prosecutors who worked on Trump investigations flagged. Erosion type: `selective_enforcement`.
- **L1**: DOJ topic distribution shift — reduced emphasis on public corruption, increased emphasis on immigration enforcement. This is a Layer 1 structural signal independent of any AI reading of content.
- **L3**: Semantic shift in DOJ output.

**Why it matters**: Tests whether the system catches selective enforcement signals through personnel changes, not just through policy documents.

---

#### T2-9. CISA Election Security Office Elimination

**Date**: 2025 (specific week varies)
**Categories**: elections (primary), infoAvailability
**Sources**: FR (formal reorganization if published), GDELT (media coverage)
**Signal density**: **Thin — primarily agency silence + media coverage; may have no formal FR document.** Detection depends on L1 "institutional silence" pattern (absence of expected documents) more than document content.

**What to detect**:

- **L1**: Structural gap — the agency that previously published election security documents stops publishing. This is the "institutional silence" pattern again.
- **L2**: Formal reorganization documents flagged if they exist. May have no L2 signal if no formal document was published.

---

#### T2-10. Foreign Aid Freeze / Rescissions Act

**Dates**: Jan 2025 (freeze EO); May 2025 (rescission request); Aug 2025 (Rescissions Act passed)
**Categories**: executiveActions (primary), fiscal
**Sources**: FR (executive order), GovInfo (congressional reports, budget documents), CourtListener (multiple lawsuits)

**What to detect**:

- **L1**: GovInfo/GAO budget documents reflecting the $9.4B rescission request. CourtListener legal challenge filings.
- **L2**: Executive order freezing congressionally appropriated funds flagged as `formal_override` — executive impounding funds that Congress appropriated.

**Why it matters**: Tests whether the fiscal category picks up budget-related signals through GovInfo/GAO, and whether the system tracks a policy across its lifecycle (EO → rescission request → congressional action → legal challenges).

---

#### T2-11. Supreme Court Allows Mass Layoffs to Proceed

**Week of**: Jul 7, 2025
**Categories**: judicialIndependence (primary), civilService
**Sources**: CourtListener (Supreme Court decision overriding lower court freezes)

**What to detect**:

- **L2**: Decision flagged as significant — the Court enabling executive power expansion over civil service protections. This tests Pass 2's ability to assess judicial opinions, not just executive branch documents.
- **L1**: Disposition pattern shift — government winning on workforce cases in a pattern that differs from baseline.

---

#### T2-12. Government Shutdown (Fall 2025)

**Week of**: Varies (fall 2025)
**Categories**: fiscal (primary), civilService
**Sources**: FR (OMB shutdown guidance), GovInfo (continuing resolution or appropriations bills), LegiScan (state-level impact legislation)

**What to detect**:

- **L1**: FR document volume drop during shutdown (agencies can't publish). This is both a fiscal event and a data availability event — the "missing data" signal.
- **L2**: OMB shutdown guidance flagged.

---

## Negative Controls

Events the system should **not** flag as democratic erosion. Equally important as positive detection.

### Pass/Fail Thresholds

| Metric                                                             | Target                                                   | Fail if                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------ |
| Biden 2022 P1 flag rate (per category)                             | 1–15%                                                    | >20% in any category                       |
| Biden 2022 P2 confirmation rate (of flagged)                       | 20–60%                                                   | >70% or <10%                               |
| Biden 2022 weeks at Elevated+ (per category)                       | ≤2 of ~52                                                | >5% of weeks Elevated+                     |
| Biden 2021 transition week P1 flag rate                            | Higher than steady state, but lower than Trump T2 week 1 | Comparable to or exceeding Trump T2 week 1 |
| Trump T2 P2 clearly*concerning rate \_outside known-event windows* | <10% of documents                                        | >15% — system flagging routine governance  |
| Trump T2 P1 "routine" rate (all weeks including events)            | >60% of documents classified routine                     | <50% — everything looks concerning         |

---

#### NC-1. Biden T1 Transition Activity (Jan 2021)

Should show elevated activity (new administration EOs, nominations) but **L2 should not flag these as erosion**. Biden's EOs should be classified as routine governance transitions. If the system flags Biden T1 transition as concerning at rates comparable to Trump T2, the category descriptions or Pass 1 calibration need adjustment.

**Specific test**: Compare P1 flag rate for executiveActions in the week of Jan 20, 2021 vs. Jan 20, 2025. Both should have elevated volume (L1 spike), but L2 flag rates should be substantially different.

---

#### NC-2. Biden 2022 Steady State

The primary baseline period. Should be **>95% Stable across all categories**. If more than 5% of weeks in Biden 2022 show Elevated status, calibration is off. The baseline defines "normal" — by definition it should look normal.

**Specific test**: Count weeks at each status level per category for Biden 2022. Any category with >2 Elevated weeks (out of ~52) needs investigation.

---

#### NC-3. Routine Government Operations in Trump T2

Not everything in Trump T2 is erosion. Routine FR rulemaking, normal DOJ prosecutions, standard OPM personnel guidance should be correctly classified as routine **even during a period with genuine concerning signals**. If the system flags >50% of Trump T2 documents as concerning, it's useless — the signal is buried in noise.

**Specific test**: For each category in Trump T2, check the P2 "routine" rate. The majority of documents in every week — including known-event weeks — should still be classified as routine governance. The concerning documents should be specific and identifiable, not a blanket elevation.

---

## Layer Effectiveness Assessment

### Current State Assessment

**Layer 2 (AI two-pass) is likely the strongest detector** because it reads actual content. When a document says "all USAID employees are placed on administrative leave," Pass 1 flags it, Pass 2 reads it, and the assessment explains why it's concerning with institutional context (e.g., recognizing that firing 17 IGs without congressional notice violates the Inspector General Act).

**Layer 1 (structural) has the data to produce signal.** FR metadata, CourtListener filings, DOJ press releases, GovInfo reports, LegiScan bills, and FEC data exist across all five periods. The question is whether baselines have been computed and whether the structural analyzers are producing scores. The diagnostic queries below will reveal this.

**Layer 3 (thematic drift) has data quality concerns** that the CourtListener cleanup addresses. After removing 164K content-less docket stub embeddings and 60K GDELT metadata-only embeddings, the remaining ~150K+ full-text embeddings should produce cleaner centroids. Per-source-type centroid computation (FR documents measured separately from CourtListener opinions) avoids the problem of source composition changes appearing as thematic drift.

### Phased Validation Strategy

**Phase A — Layer 2 as primary, Layer 1 as structural validation:**
Run validation events against L2 first. Does Pass 1 flag the right documents? Does Pass 2 correctly identify erosion types? Is the reasoning specific and auditable? Then check: when L2 says "this week is concerning in civilService," does L1 confirm unusual volume or composition? Discrepancies in either direction are informative.

**Phase B — Add Layer 3 after content cleanup:**
Once CL docket stubs are `metadata_only`, GDELT embeddings removed, and FR content backfilled, recompute L3 centroids. Key question: does L3 catch anything L2 missed? L3's unique value is detecting _gradual_ semantic drift — each individual week looks similar to the last, but cumulative drift over months is significant. Test this against T2-5 (sustained layoff program) and T2-7 (Schedule F evolution over 12 months).

**Phase C — Full convergence:**
When all three layers produce scores for the same weeks, test the convergence synthesis. Does multi-layer agreement (L1 + L2 + L3 all firing for the same category in the same week) produce higher-confidence signals than any single layer? Does disagreement produce useful diagnostic information?

### Layer Attribution Audit

For each known-event week, record which layer fired, how strongly, and what it said:

| Event              | Week     | Category           | L1 fired? | L2 fired? | L3 fired? | First/strongest | Most interpretable? | Top 3 evidence doc IDs |
| ------------------ | -------- | ------------------ | --------- | --------- | --------- | --------------- | ------------------- | ---------------------- |
| T2-1 EO Blitz      | Jan 20   | executiveActions   |           |           |           |                 |                     |                        |
| T2-2 IG Firings    | Jan 20   | executiveOversight |           |           |           |                 |                     |                        |
| T2-3 USAID         | Feb 3    | executiveOversight |           |           |           |                 |                     |                        |
| T2-5 Layoffs       | Jan 27+  | civilService       |           |           |           |                 |                     |                        |
| T2-6 Probationary  | Feb 10   | civilService       |           |           |           |                 |                     |                        |
| T2-7 Schedule F    | Apr 2025 | civilService       |           |           |           |                 |                     |                        |
| T2-8 DOJ Officials | Feb 2025 | lawEnforcement     |           |           |           |                 |                     |                        |

Fill this table from diagnostic query results. The "Top 3 evidence doc IDs" column makes every finding auditable — you can click through to the specific documents that caused the week's status rather than debating summaries.

---

## Diagnostic Queries

### Execution Order

Run diagnostics in this sequence to avoid chasing ghosts:

1. **Schema discovery preflight** (below) — confirm column names exist
2. **Category + doc-count inventory** (Validation Event List §Preflight) — confirm data exists for each event week
3. **CourtListener `metadata_only` cleanup** + embedding cleanup (Prerequisites §1-3)
4. **Add content gate + keyword scorer filter** (Prerequisites §4)
5. **Recompute weekly aggregates** for affected categories (Prerequisites §5)
6. **Diagnostic 1d** — are layer scores populated in `weekly_aggregates`? If NULLs → **stop and fix the scoring pipeline before proceeding.** All "quiet" results are uninterpretable until layer scores are non-null.
7. **Diagnostic 2a** (flag rates) + **2b** (event-week excerpts) — L2 signal quality
8. **Diagnostic 1a-1c** — L1 structural signal quality
9. **Diagnostic 3a-3b** — L3 thematic drift quality (only after embeddings are clean)
10. **Diagnostic 4a-4b** — cross-layer convergence

### Schema Discovery Preflight

Run before any diagnostic queries to confirm column names. Adjust all queries below to match actual schema.

```sql
-- What columns exist in weekly_aggregates?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weekly_aggregates'
ORDER BY ordinal_position;

-- What columns exist in ai_document_assessments?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ai_document_assessments'
ORDER BY ordinal_position;

-- What columns exist in documents?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;
```

### Week Definition

All `week_of` fields and all `DATE_TRUNC('week', ...)` expressions must use the same convention. Confirm what the snapshot pipeline uses (typically Monday-start, UTC) and ensure all diagnostic queries match. If the pipeline uses a different week boundary, adjust the `BETWEEN` ranges in event-week queries accordingly.

### Period Mapping

All diagnostic queries use this consistent period mapping based on the five baseline/monitoring periods:

```sql
-- Standard period CASE block — use in all queries
CASE
  WHEN <date_col> >= '2017-01-20' AND <date_col> < '2019-01-20' THEN 'trump_t1'
  WHEN <date_col> >= '2021-01-20' AND <date_col> < '2022-01-20' THEN 'biden_2021'
  WHEN <date_col> >= '2022-01-20' AND <date_col> < '2023-01-20' THEN 'biden_2022'
  WHEN <date_col> >= '2025-01-20' THEN 'trump_t2'
  ELSE 'other'
END as period
```

Note: `biden_2021` and `biden_2022` are distinct baseline periods (first-year-in-term vs. steady state). Do not collapse them. Weeks falling in gaps between periods (2019-2021, 2023-2025) are mapped to `other` and excluded from baseline comparisons.

### Diagnostic 1: Layer 1 Structural Signal Quality

#### 1a. Weekly document volume by category and period

```sql
SELECT category, week_of, document_count,
  CASE
    WHEN week_of >= '2017-01-20' AND week_of < '2019-01-20' THEN 'trump_t1'
    WHEN week_of >= '2021-01-20' AND week_of < '2022-01-20' THEN 'biden_2021'
    WHEN week_of >= '2022-01-20' AND week_of < '2023-01-20' THEN 'biden_2022'
    WHEN week_of >= '2025-01-20' THEN 'trump_t2'
    ELSE 'other'
  END as period
FROM weekly_aggregates
WHERE category IN (
  'executiveOversight', 'civilService', 'executiveActions',
  'civilLiberties', 'lawEnforcement', 'immigrationEnforcement',
  'judicialIndependence', 'fiscal'
)
ORDER BY category, week_of;
```

**What to look for**: Do known-event weeks show visible volume spikes relative to surrounding weeks and baseline periods? Does executiveOversight drop after Jan 24, 2025 (IG sources going silent)? Does executiveActions spike massively the week of Jan 20, 2025?

#### 1b. Source-type composition per category per week

```sql
SELECT d.category,
  DATE_TRUNC('week', d.published_at)::date as week_of,
  d.source_type,
  COUNT(*) as doc_count
FROM documents d
WHERE d.category IN ('executiveOversight', 'civilService', 'lawEnforcement',
  'civilLiberties', 'judicialIndependence')
  AND d.published_at >= '2025-01-01'
GROUP BY d.category, week_of, d.source_type
ORDER BY d.category, week_of, d.source_type;
```

**What to look for**: Do multiple source types contribute to each category? Does the source mix shift around known events (IG RSS going silent while GDELT/WH spike for executiveOversight)? If a category is 100% one source type, cross-source convergence is impossible for that category.

#### 1c. FR document type composition shifts

```sql
SELECT DATE_TRUNC('week', d.published_at)::date as week_of,
  COUNT(*) FILTER (WHERE d.metadata->>'documentType' = 'Presidential Document') as presidential,
  COUNT(*) FILTER (WHERE d.metadata->>'documentType' = 'Rule') as rules,
  COUNT(*) FILTER (WHERE d.metadata->>'documentType' = 'Notice') as notices,
  COUNT(*) FILTER (WHERE d.metadata->>'documentType' = 'Proposed Rule') as proposed_rules,
  COUNT(*) as total
FROM documents d
WHERE d.source_type = 'federal_register'
  AND d.category = 'executiveActions'
GROUP BY week_of
ORDER BY week_of;
```

**What to look for**: Does the EO blitz week (Jan 20, 2025) show a type composition shift — presidential documents jumping from ~5% to ~40%+ of weekly output? If so, L1 is capturing signal even with FR-only data.

#### 1d. Layer scores populated?

```sql
SELECT category, week_of,
  structural_score, ai_score, thematic_score, convergence_score,
  convergence_detail->>'status' as status
FROM weekly_aggregates
WHERE week_of BETWEEN '2025-01-13' AND '2025-03-01'
  AND category IN ('executiveOversight', 'civilService', 'executiveActions',
    'lawEnforcement', 'civilLiberties')
ORDER BY category, week_of;
```

**What to look for**: Are layer score columns populated or NULL? From earlier audits, `ai_score` was nearly empty (~1 week per category). If layer scores aren't computed, that's the first fix — they're the inputs to convergence synthesis.

---

### Diagnostic 2: Layer 2 AI Assessment Quality

Schema note: `ai_document_assessments` joins to documents via `(url, category)`, not `document_id`. Pass is indicated by `pass` column (1 or 2). Pass 1 relevance is `relevant` (boolean). Pass 2 assessment is `assessment` enum (`routine`, `novel_not_concerning`, `potentially_concerning`, `clearly_concerning`). Audit samples are `is_audit_sample = true`.

#### 2a. P1 flag rate and P2 concern rate by category and period

```sql
SELECT d.category,
  CASE
    WHEN d.published_at >= '2017-01-20' AND d.published_at < '2019-01-20' THEN 'trump_t1'
    WHEN d.published_at >= '2021-01-20' AND d.published_at < '2022-01-20' THEN 'biden_2021'
    WHEN d.published_at >= '2022-01-20' AND d.published_at < '2023-01-20' THEN 'biden_2022'
    WHEN d.published_at >= '2025-01-20' THEN 'trump_t2'
    ELSE 'other'
  END as period,
  COUNT(DISTINCT d.id) as total_docs,
  COUNT(DISTINCT CASE WHEN p1.url IS NOT NULL THEN d.url END) as p1_assessed,
  COUNT(DISTINCT CASE WHEN p1.relevant = true THEN d.url END) as p1_flagged,
  COUNT(DISTINCT CASE WHEN p2.assessment IN ('potentially_concerning', 'clearly_concerning')
    THEN d.url END) as p2_confirmed
FROM documents d
LEFT JOIN ai_document_assessments p1
  ON d.url = p1.url AND d.category = p1.category AND p1.pass = 1
LEFT JOIN ai_document_assessments p2
  ON d.url = p2.url AND d.category = p2.category AND p2.pass = 2
WHERE d.category != 'intent'
  AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
GROUP BY d.category, period
ORDER BY d.category, period;
```

**What to look for**: P1 flag rate should be higher in Trump T2 than Biden periods for categories with real events. If uniformly high across all periods → category description too broad (repeat the civilLiberties calibration). If uniformly low including Trump T2 → Pass 1 missing real signals. P2 confirmation rate should be meaningful (20-60% of flagged); if <5%, P1 is too aggressive.

#### 2b. P2 assessments for known-event weeks

Run for each event. Example for IG firings:

```sql
SELECT d.title, d.source_type, d.published_at,
  a.assessment, a.erosion_type,
  LEFT(a.reasoning, 300) as reasoning_excerpt
FROM documents d
JOIN ai_document_assessments a
  ON d.url = a.url AND d.category = a.category
WHERE d.category = 'executiveOversight'
  AND d.published_at BETWEEN '2025-01-20' AND '2025-02-07'
  AND a.pass = 2
  AND a.assessment IS NOT NULL
ORDER BY d.published_at;
```

**What to look for**: Did Pass 2 see the IG firings? What erosion type? Is reasoning specific ("17 inspectors general removed simultaneously without congressional notice, violating the Inspector General Act") or vague ("concerning changes to oversight")? Repeat for each event week × relevant category.

#### 2c. False negative audit results for Trump T2

Audit false negatives are Pass 2 audit samples that came back as concerning — documents that Pass 1 marked as not relevant but the audit sample found concerning on deeper review.

```sql
SELECT d.category, d.title, d.published_at, d.source_type,
  a.assessment, LEFT(a.reasoning, 200) as reasoning_excerpt
FROM documents d
JOIN ai_document_assessments a
  ON d.url = a.url AND d.category = a.category
WHERE a.pass = 2
  AND a.is_audit_sample = true
  AND a.assessment IN ('potentially_concerning', 'clearly_concerning')
  AND d.published_at BETWEEN '2025-01-20' AND '2025-06-01'
ORDER BY d.category, d.published_at;
```

**What to look for**: Clusters of false negatives in specific categories during known-event weeks → Pass 1 calibration needed. The LegiScan/lawEnforcement false negative cluster already found is this exact pattern.

---

### Diagnostic 3: Layer 3 Thematic Drift Quality

#### 3a. Embedding coverage and quality by category and period

```sql
SELECT d.category,
  CASE
    WHEN d.published_at >= '2017-01-20' AND d.published_at < '2019-01-20' THEN 'trump_t1'
    WHEN d.published_at >= '2021-01-20' AND d.published_at < '2022-01-20' THEN 'biden_2021'
    WHEN d.published_at >= '2022-01-20' AND d.published_at < '2023-01-20' THEN 'biden_2022'
    WHEN d.published_at >= '2025-01-20' THEN 'trump_t2'
    ELSE 'other'
  END as period,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE d.embedded_at IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (WHERE d.content IS NULL) as null_content,
  COUNT(*) FILTER (WHERE LENGTH(d.content) < 100) as short_content,
  ROUND(AVG(LENGTH(d.content)) FILTER (WHERE d.content IS NOT NULL)) as avg_content_length
FROM documents d
WHERE (d.content_type IS NULL OR d.content_type != 'metadata_only')
GROUP BY d.category, period
ORDER BY d.category, period;
```

**What to look for**: Is embedding quality consistent across periods? If Trump T1 has avg_content_length 2,000 but Trump T2 has 500 (more source types with shorter content), centroids aren't comparable. What fraction of each category's embeddings come from short-content documents?

#### 3b. Per-source-type embedding quality

```sql
SELECT d.category, d.source_type,
  CASE
    WHEN d.published_at >= '2017-01-20' AND d.published_at < '2019-01-20' THEN 'trump_t1'
    WHEN d.published_at >= '2021-01-20' AND d.published_at < '2022-01-20' THEN 'biden_2021'
    WHEN d.published_at >= '2022-01-20' AND d.published_at < '2023-01-20' THEN 'biden_2022'
    WHEN d.published_at >= '2025-01-20' THEN 'trump_t2'
    ELSE 'other'
  END as period,
  COUNT(*) as doc_count,
  ROUND(AVG(LENGTH(d.content)) FILTER (WHERE d.content IS NOT NULL)) as avg_content_length,
  COUNT(*) FILTER (WHERE d.embedded_at IS NOT NULL) as embedded_count
FROM documents d
WHERE (d.content_type IS NULL OR d.content_type != 'metadata_only')
GROUP BY d.category, d.source_type, period
ORDER BY d.category, d.source_type, period;
```

**What to look for**: Can you compute per-source-type centroids? Need enough documents per source type per period for a meaningful centroid. FR with 500 docs/period/category → stable centroid. CL opinions with 20 → noisy. Weight accordingly.

---

### Diagnostic 4: Cross-Layer Convergence

#### 4a. Status distribution by period

```sql
SELECT category,
  CASE
    WHEN week_of >= '2017-01-20' AND week_of < '2019-01-20' THEN 'trump_t1'
    WHEN week_of >= '2021-01-20' AND week_of < '2022-01-20' THEN 'biden_2021'
    WHEN week_of >= '2022-01-20' AND week_of < '2023-01-20' THEN 'biden_2022'
    WHEN week_of >= '2025-01-20' THEN 'trump_t2'
    ELSE 'other'
  END as period,
  convergence_detail->>'status' as status,
  COUNT(*) as weeks
FROM weekly_aggregates
WHERE convergence_detail->>'status' IS NOT NULL
GROUP BY category, period, convergence_detail->>'status'
ORDER BY category, period, status;
```

**What to look for**: Biden periods should be >95% Stable. Trump T1 mostly Stable with some Elevated around known events. Trump T2 should show more Elevated/Divergent/ConfirmedConcern, concentrated around known-event weeks. If all periods look the same → system not differentiating. If Biden periods show lots of Elevated → calibration off.

#### 4b. Cross-category synchrony check

```sql
SELECT week_of,
  COUNT(*) FILTER (
    WHERE convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
  ) as elevated_categories,
  COUNT(*) as total_categories,
  STRING_AGG(
    CASE WHEN convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
      THEN category ELSE NULL END,
    ', '
  ) as which_elevated
FROM weekly_aggregates
WHERE week_of BETWEEN '2025-01-13' AND '2025-03-01'
  AND convergence_detail->>'status' IS NOT NULL
GROUP BY week_of
HAVING COUNT(*) FILTER (
  WHERE convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
) >= 3
ORDER BY week_of;
```

**What to look for**: The week of Jan 20, 2025 should show multiple categories simultaneously elevated. If the IG firing week and USAID week also show multi-category elevation, the cross-category synchrony signal is working.

---

## Interpreting Results and Tuning Strategy

### Decision Matrix

| Finding                                          | Interpretation                                                                                       | Action                                                                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L2 fires but L1 doesn't on known-event weeks     | Content changed but structure didn't, OR structural dimensions not computed for that category/source | Check if structural scores exist for that category. If they do and are flat, structural dimensions may not capture this type of event. If NULL, compute them.                       |
| L1 fires but L2 doesn't on known-event weeks     | Volume/composition shifted but L2 missed the content signal                                          | Check P1 flag rate for those weeks. If P1 didn't flag relevant documents → category description needs calibration (tighten to threat vector).                                       |
| L3 shows drift but L1/L2 are quiet               | Language is shifting gradually without triggering per-document or structural thresholds              | Investigate — this is L3's unique value. The drift may be real but slow. Or embeddings may be noisy.                                                                                |
| All layers quiet during known-event weeks        | Documents may not be in the database, OR the event didn't produce government documents               | Check document counts for that week first. If documents exist but aren't flagged → calibration issue. If no documents → source gap (the event was in rhetoric, not formal records). |
| Biden periods show elevated signal               | Calibration problem — baseline should be quiet                                                       | Review category descriptions for over-breadth. Investigate which specific documents triggered flags. Adjust category descriptions or P1 prompts.                                    |
| P1 flag rate >30% in any category for any period | P1 too aggressive for that category                                                                  | Category description is topic-scoped rather than threat-scoped. Apply the civilLiberties calibration pattern: rewrite description to focus on erosion mechanism, not subject area.  |
| P2 confirmation rate <10%                        | P1 flagging too many documents that P2 finds routine                                                 | Same as above — P1 is casting too wide a net. Tighten category description.                                                                                                         |
| P2 confirmation rate >80%                        | P1 may be too conservative — potential false negatives                                               | Check audit false negative rate. If audit catches concerning documents P1 missed, P1 needs broadening or the category description is too narrow.                                    |

### Content Gate Impact Assessment

After implementing the ≥100 char content gate, re-run diagnostic 2a to measure the change:

- How many documents per category were filtered?
- Did P1 flag rates change (they should increase — removing noise from the denominator)?
- Did P2 confirmation rates change?
- Did any known-event documents get filtered that shouldn't have been?

### Per-Layer Launch Readiness Criteria

| Layer               | Ready when                                                                                                                                                                             | Current blocker                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| L1 (Structural)     | Baseline means/stddevs computed per source type per category per baseline period; structural scores populated in weekly_aggregates                                                     | May not be computed yet — diagnostic 1d reveals this                                                   |
| L2 (AI Assessment)  | P1 flag rate 1-15% across all categories in Biden periods; P2 confirmation rate 20-60%; known-event weeks show elevated flag rates; no garbage assessments from content-less documents | CourtListener cleanup (prerequisite above); possible category description recalibration needed         |
| L3 (Thematic Drift) | Per-source-type centroids computed from clean embeddings; centroid distances correlate with known events; embedding quality consistent across periods                                  | CourtListener cleanup + GDELT embedding removal; content backfill for FR/WH documents improves quality |
| Convergence         | All three layer scores populated in weekly_aggregates; convergence formula producing non-null output; Biden periods >95% Stable                                                        | Requires all three layers to be individually ready                                                     |

---

## Appendix: Event Timeline Quick Reference

| Date          | Event                             | Primary Category                       |
| ------------- | --------------------------------- | -------------------------------------- |
| Jan 27, 2017  | Travel Ban EO                     | civilLiberties, immigrationEnforcement |
| May 9, 2017   | Comey Firing                      | executiveOversight                     |
| Sep 5, 2017   | DACA Rescission                   | immigrationEnforcement                 |
| Apr 6, 2018   | Zero Tolerance Memo               | lawEnforcement, immigrationEnforcement |
| Jan 20, 2025  | EO Blitz + Schedule F             | executiveActions, civilService         |
| Jan 24, 2025  | Mass IG Firings (17)              | executiveOversight                     |
| Jan 28, 2025  | Deferred Resignation Program      | civilService                           |
| Feb 1-7, 2025 | DOGE/USAID Shutdown               | executiveOversight, executiveActions   |
| Feb 8, 2025   | DOGE Treasury Access Blocked      | fiscal                                 |
| Feb 13, 2025  | Probationary Employee Firings     | civilService                           |
| Feb 2025+     | DOJ Career Official Firings       | lawEnforcement                         |
| Apr 2025      | Schedule F Proposed Rule          | civilService                           |
| May 2025      | Foreign Aid Rescission Request    | fiscal                                 |
| Jul 8, 2025   | SCOTUS Allows Mass Layoffs        | judicialIndependence                   |
| Aug 2025      | Rescissions Act                   | fiscal                                 |
| Fall 2025     | Government Shutdown               | fiscal                                 |
| 2025          | CISA Election Security Eliminated | elections                              |
| Feb 6, 2026   | Schedule F Final Rule             | civilService                           |
