# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprints 11-12 (condensed)

Sprints 11, 12, and 12.1 built the seed data pipeline: import/export framework, Biden 2024 baseline backfill with AI Skeptic, review report, interactive CLI review, and DB-centric review flow. Key decisions that remain relevant:

- **DB-centric review flow** (Sprint 12.1): `alerts` table is the single source of truth for review state. Both CLI and future UI read/write through `review-queue.ts`. JSON export is for audit only.
- **UI Spec §10A deviation**: Changed from JSON-as-primary-store to DB-centric flow. Interactive CLI mirrors planned UI review page using the same `getPendingReviews()` / `resolveReview()` API.
- **`reviewedDocuments` on EnhancedAssessment** (not in original spec): Stores top 10 source documents at assessment time. Essential for human reviewers.
- **ReviewFeedbackSchema**: Shared contract (CLI, UI, `apply-decisions.ts`) with 4 feedback types: `falsePositiveKeywords`, `missingKeywords`, `suppressionSuggestions`, `tierChanges`.

---

## Sprint 13: AI Skeptic Structured Feedback + Keyword Tuning Pipeline

**Planned:** Extend AI Skeptic prompt for structured keyword feedback, pre-populate feedback in interactive review, build aggregate report generator, create `apply-decisions.ts`, regression test fixtures.

**Actual:** Delivered as planned. All 7 work items shipped. No spec deviations — this sprint builds pipeline tooling not covered by the UI spec.

**Key decisions:**

- **AI response schema extension**: Added optional `suggestedAction` (keep/remove/move_to_warning/move_to_drift/move_to_capture) and `suppressionContext` to each keyword verdict. Optional fields ensure backward compatibility with existing stored assessments.
- **`extractAiFeedback()` as pure function**: Maps AI verdicts to `ReviewFeedback` fields — `false_positive` → `falsePositiveKeywords`, `suppressionContext` → `suppressionSuggestions`, tier move actions → `tierChanges`. Testable, no I/O.
- **Aggregate thresholds**: FP rate ≥50% for removal recommendation, ≥2 occurrences for tier change or suppression recommendation. Conservative — first cycle will validate these thresholds.
- **`apply-decisions.ts` regenerates entire file**: Rather than AST manipulation or string patching, it serializes the modified rules object to TypeScript source. Simpler and less fragile. Requires `prettier --write` after.
- **`lib/seed/**` added to ESLint max-lines exemption\*\*: Seed CLI files are growing CLI tools that don't benefit from the 300-line limit.

---

## Sprint 14: Biden 2022 Baseline Calibration

**Planned:** Biden 2022 baseline generation, rhetoric-based keyword gaps, first keyword refinement cycle.

**Actual:** Baseline calibration required 3 iterations (42→8 alerts). Signal tightening, volume threshold tuning, and keyword hallucination filter consumed the sprint. Rhetoric gap analysis and refinement cycle deferred to Sprint 14.1.

**Key decisions:**

- **`indices` → `executiveActions` rename** (V3 Addendum §14.2): The `indices` key was misleading — it implied external democracy indices, but the category actually tracks executive action volume/tempo. Renamed to `executiveActions` with title "Executive Action Volume". DB migration applied to 9 tables.
- **Signal tightening over keyword removal**: fiscal and elections had broad FR signal queries generating too many irrelevant documents. Fixed at the signal level (narrower FR queries) rather than adding suppressions. fiscal: 20→0 alerts, elections: 13→1 alert.
- **Volume thresholds raised**: drift 3→5, capture 2→3. The original thresholds were too sensitive for Biden 2022's document volumes.
- **Keyword hallucination filter**: AI assessment sometimes returned keywords not in the dictionary. Added validation in `resolveDowngrade()` to filter these before flagging.
- **Light fixtures strategy**: Export calibrated outputs (~29MB) + document manifest, not raw documents (~35MB). Raw docs are reproducible via `pnpm backfill`. Titles kept in manifest for future search support (SEARCH SPECIFICATION §4.1).
- **External Indices as separate capability** (V3 Addendum §14.5, UI Spec §9B): V-Dem, Freedom House, etc. will be a cross-reference validation layer at `/indices`, not part of the 11-category keyword pipeline. Deferred to Sprint K (~Sprint 20+).

---

## Sprint 14.1 (in progress): Rhetoric Gap Analysis + Refinement Cycle

**Planned:** Rhetoric-to-keyword gap analysis, missingKeywords in aggregate report, first refinement cycle.

**Actual:** Gap analysis built and run. All 6 mapped category dictionaries reviewed against rhetoric corpus. Result: **zero keyword additions needed** — dictionaries are well-calibrated. Rhetoric→document vocabulary gap is a translation gap (e.g., "fake news" → "press credentials revoked"), and existing keywords already cover the action side.

**Key decisions:**

- **PolicyArea-based classification**: Rhetoric docs are stored as `category = 'intent'` (undifferentiated). Gap analysis reuses `classifyPolicyAreaWithScore()` from the live intent path to classify each doc title into one of 5 policy areas, then maps to assessment categories via `POLICY_AREA_CATEGORIES` (many-to-many). Docs with score 0 (no keyword matches) are skipped — 49,685 of 50,651 are unclassifiable generic government content.
- **Many-to-many PolicyArea → category mapping**: `rule_of_law` → courts, igs; `civil_liberties` → courts, executiveActions; `elections` → elections; `media_freedom` → mediaFreedom; `institutional_independence` → rulemaking, executiveActions, igs. Five categories intentionally unmapped (civilService, fiscal, military, hatch, infoAvailability) — they get keyword proposals from other feedback loops.
- **Bigram-only analysis**: Extracts bigrams from document titles. Many keyword dictionary entries are multi-word phrases, making bigrams a good match. Unigrams would be too noisy; trigrams could be added later.
- **Title-only, not content**: GDELT content is often null; titles are the reliable field across all rhetoric sources.
- **GDELT international noise**: ~50% of gaps are artifacts of GDELT's global coverage (Ethiopia, Hong Kong, Pakistan, Philippines press freedom stories). Future improvement: filter by GDELT country codes to US-only rhetoric. Not built now — noted for rhetoric pipeline (§13.6).
- **Refinement cycle outcome**: No keywords added → no `apply-decisions.ts` run needed → no re-validation run needed. Sprint 14.1 refinement cycle completes as "dictionaries confirmed well-calibrated."

**Spec deviation — `source_type` inconsistency (#28):**

Three specs define `source_type` differently:

| Spec                           | `source_type` means                                                       |
| ------------------------------ | ------------------------------------------------------------------------- |
| V3 Addendum (line 60)          | Fetch method (`api`, `rss`, `html`, `json`)                               |
| Search Specification (§8, §10) | Origin/provider (`federal_register`, `whitehouse`, `gdelt`)               |
| Actual DB                      | FR document classification (`Notice`, `Rule`) + content type (`rhetoric`) |

Root cause: `federal-register-fetcher.ts` stores FR API document types (`Notice`, `Rule`); `rhetoric-fetcher.ts` hardcodes `'rhetoric'` for both WH and GDELT. Neither matches either spec. The Search Specification assumed origin-based values that don't exist.

**Resolution:** Tracked as #28. Must be fixed before Sprint L (Search Infrastructure). `rhetoric-keyword-gaps.ts` works around it with `WHERE source_type = 'rhetoric'` and a `TODO(#28)` comment. No other current code is affected.

---

### Keyword refinement workflow

Sprint 13 built the tooling (items 1, 3, 5). Sprint 14.1 completes the remaining steps:

1. ~~AI Skeptic pre-populates feedback~~ — **Done** (Sprint 13)
2. ~~missingKeywords from rhetoric analysis~~ — **Done** (Sprint 14.1). Bigram frequency on WH/GDELT titles, compared against keyword dictionaries. Preserves keyword layer independence.
3. ~~Post-session aggregate report~~ — **Done** (Sprint 13, extended in Sprint 14.1 with `aggregateMissingKeywords()`)
4. ~~Double human review~~ — **Done** (Sprint 14.1). Human reviewed all 6 mapped categories. Result: zero additions — dictionaries well-calibrated, rhetoric→document vocabulary gap is a translation gap already covered by existing keywords.
5. ~~Changes in code via apply-decisions.ts~~ — **Done** (Sprint 13, `pnpm seed:apply`). Not needed this cycle (zero additions).
6. ~~Validate with re-run~~ — **N/A** this cycle (no keyword changes → baseline unchanged at 8 alerts).

### Baseline strategy (Sprint 14-15)

- **Biden 2022** (primary) — Steady state normal governance. 58,713 docs, 8 alerts after calibration.
- **Biden 2021** — First-year-in-term baseline (Sprint 15)
- **Obama 2013** — Cross-president validation (Sprint 15; risk: WH archive URL structure differs)

### Updated sprint sequence

- ~~Sprint 13:~~ **Done** — AI Skeptic structured feedback + keyword tuning pipeline
- ~~Sprint 14:~~ **Done** — Biden 2022 baseline calibration (3 iterations, signal tightening, fixtures)
- **Sprint 14.1:** Rhetoric gap analysis + first refinement cycle
- **Sprint 15:** Biden 2021 + Obama 2013 baselines + cross-baseline validation
- **Pre-Sprint L:** Normalize `source_type` values (#28)

See ROADMAP.md for full sequence.
