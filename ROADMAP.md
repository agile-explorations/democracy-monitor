# Democracy Monitor — Roadmap

This document describes the planned sprint sequence for completing the Democracy Monitor system. It bridges the specification documents (which describe _what_ the system does) and GitHub Issues (which track _who is doing what right now_).

**Specification documents:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` — Backend features: source health, feedback learning, novel threat detection, expert contributions, cycle-aware baselines (Sprints A-J, Phase 15)
- `UI DESIGN SPECIFICATION V3.md` — UI redesign: information architecture, visual language, component design, admin interface (Phases 1-5)
- `SIGNAL_GAP_REMEDIATION.md` — Signal detection gap fixes: InsufficientData display, presidential documents, keyword expansion, rhetoric cross-feed, expanded FR queries (Phases 16-20, Sprints 20-22)

**Prior work:** Sprints 1-10 built the core dashboard, assessment engine, AI skeptic review, progressive disclosure, snapshot/backfill infrastructure, history page, infrastructure overlay, rhetoric tracking, P2025 pipeline, validation indices, and test coverage. Sprints 11-12.1 built seed data framework, baseline backfill, review report, interactive CLI review, and DB-centric review flow. See `MEMORY.md` sprint log and `DECISIONS.md` for details.

---

## Decision: Scrap UI and Rebuild

The UI redesign (UI Design Specification V3) changes three foundational layers that cascade through every existing component:

1. **Color system** — traffic-light (green/yellow/orange/red) to single-hue indigo scale + status icons
2. **Information architecture** — monolithic dashboard with inline sections to multi-page app with `/category/[key]`, `/category/[key]/week/[date]`, `/infrastructure`, `/rhetoric`, `/p2025`, `/health`, `/admin/*`
3. **Data flow** — components fetch their own data internally to props-driven, embed-ready components receiving data from page-level loaders

**Decision: Fresh start with selective salvage.** All 36 current components will be replaced. What we keep:

| Asset                                              | Why                                                 |
| -------------------------------------------------- | --------------------------------------------------- |
| Pages Router                                       | Spec doesn't require App Router                     |
| Recharts                                           | UI spec explicitly says keep it                     |
| `lib/hooks/useLocalStorage.ts`                     | Used for reading level, dark mode, first-visit flag |
| `lib/types/`                                       | Type definitions are backend-aligned                |
| `lib/services/`, `lib/data/`, `lib/ai/`, `lib/db/` | Entire backend layer unchanged                      |
| `pages/api/*`                                      | All API routes survive                              |
| `components/ui/Markdown.tsx`                       | Utility, not design-system-dependent                |
| `tailwind.config.ts`                               | Extended, not replaced                              |

---

## Seed Data Pipeline

Before any UI work begins, we need realistic data in the database. All baseline periods and the current (T2) period go through the **same** AI Skeptic + human review process. This is critical because false-positive keywords inflate baseline statistics just as they inflate current-period scores — a clean baseline requires the same keyword tuning as clean T2 data.

**Baselines:**

- **Biden 2022** (primary) — "Steady state normal governance." Year 2, post-transition, settled operations.
- **Biden 2021** — First-year-in-term baseline. Normal but elevated transition activity.
- **Trump 2017** — Cross-president first-year-in-term baseline. Validates keyword dictionaries across administrations.
- **Trump 2018** — Cross-president Year 2 baseline. Paired with Biden 2022 for cycle-adjusted comparison.

**Pipeline:**

1. **Generate baselines + T2 backfill** — Run `backfill-baseline` for each baseline period and `backfill` for T2 (Jan 20 '25 – present), all with AI Skeptic enabled, all fetching FR + WH + GDELT.
2. **AI-assisted human review** — Interactive CLI review (`pnpm seed:review --interactive`) for items where AI Skeptic flagged disagreements. AI pre-populates `falsePositiveKeywords`, `suppressionSuggestions`, `tierChanges`; human approves/edits.
3. **Post-session aggregate report** — Synthesizes reviewed feedback into specific keyword dictionary change recommendations. Each recommendation approved by human.
4. **Keyword tuning** — `apply-decisions.ts` writes approved changes to `assessment-rules.ts` (in code, versioned).
5. **Rhetoric-based gap analysis** — Surfaces terms frequent in WH/GDELT rhetoric but absent from keyword dictionaries. Feeds `missingKeywords` into aggregate report.
6. **Re-score + validate** — Re-run scoring with tuned keywords. Cross-baseline validation confirms improvement across all periods.
7. **Commit seed data** — Final fixtures committed to `lib/seed/fixtures/`. New deployments run `pnpm seed:import` — no API keys required.

See V3 Addendum Risk Reminders #12-14 and `DECISIONS.md` "Forward-Looking Decisions" for design rationale.

### AI Cost Estimate

Both baseline and backfill scripts call `enhancedAssessment()` (the AI Skeptic) for each category-week. The AI does first-pass triage that a human will review, so we use `gpt-4o-mini` for bulk runs (daily `snapshot.ts` continues to prefer Claude Sonnet for higher-stakes individual assessments).

**Token estimates per call:** ~4,000 input (system prompt + keyword matches + document summaries + RAG docs) and ~800 output (structured JSON with per-keyword verdicts).

| Period                    | Weeks | x 11 Categories | AI Calls  | Cost (gpt-4o-mini) |
| ------------------------- | ----- | --------------- | --------- | ------------------ |
| Biden 2024 baseline       | ~55   | 11              | 605       | ~$0.61             |
| T2 backfill               | ~55   | 11              | 605       | ~$0.61             |
| **Sprint 11 total**       |       |                 | **1,210** | **~$1.21**         |
| Biden 2022 baseline       | ~52   | 11              | 572       | ~$0.57             |
| **Sprint 14 total**       |       |                 | **572**   | **~$0.57**         |
| Biden 2021 baseline       | ~52   | 11              | 572       | ~$0.57             |
| Trump 2017 baseline       | ~52   | 11              | 572       | ~$0.57             |
| Trump 2018 baseline       | ~52   | 11              | 572       | ~$0.57             |
| **Sprint 15 total**       |       |                 | **1,716** | **~$1.71**         |
| Sprint 15.1 AI re-runs    | —     | —               | ~2,288    | ~$2.28             |
| **All baselines**         |       |                 | **5,786** | **~$5.77**         |
| Sprint 21 regen (est.)    | —     | —               | ~2,500+   | ~$8–24             |
| Sprint 22 rhetoric (est.) | —     | —               | ~1,150    | ~$1–2              |

gpt-4o-mini rates: $0.15/1M input, $0.60/1M output. For comparison, the same runs on Claude Sonnet 4.5 would cost ~$57 total ($3/1M input, $15/1M output) — 24x more for first-pass triage that gets human review anyway.

**Implementation:** Add a `--model` flag to `backfill.ts` and `backfill-baseline.ts` (default: `gpt-4o-mini`). The `--skip-ai` flag bypasses AI entirely for fast re-scoring runs after keyword tuning.

---

## Sprint Sequence

### Sprint 11: Seed Data Framework + Baseline & T2 Backfill

> **Actual:** Delivered as planned. Added GDELT retry/backoff, military signal coverage fixes, migration journal. See `DECISIONS.md` for details.

**Goal:** Build the import/export pipeline for repo-stored seed data. Run both the Biden 2024 baseline and T2 backfill against live APIs with AI Skeptic enabled. Validate that the existing pipeline code works against real external systems.

**Code work (~300 lines new/modified):**

1. Create `lib/seed/export.ts` — export DB tables to typed JSON fixtures in `lib/seed/fixtures/`
2. Create `lib/seed/import.ts` — load fixtures into fresh DB (idempotent, ON CONFLICT DO NOTHING)
3. Add CLI entries in `package.json`: `seed:export`, `seed:import`, `build-baseline`
4. Extend `backfill-baseline.ts` to fetch WH + GDELT alongside Federal Register
5. Modify `backfill.ts` and `backfill-baseline.ts` to call `enhancedAssessment()` instead of keyword-only. Add `--skip-ai` and `--model` flags.
6. Fix issues discovered when running both scripts against live APIs (expect rate limits, pagination edge cases, date range bugs)

**Run work (external APIs, ~$1.21 AI cost with gpt-4o-mini):**

- Run `build-baseline --baseline biden_2024 --model gpt-4o-mini` against live FR API, WH archive, GDELT (~605 AI calls)
- Run `backfill --from 2025-01-20 --model gpt-4o-mini` with AI Skeptic against live FR API, WH, GDELT (~605 AI calls)
- Export results: `documents`, `document_scores`, `weekly_aggregates`, `baselines`, `assessments`

**E2E test:**

- `seed:export` produces JSON fixtures
- `seed:import` into fresh DB succeeds
- Baseline row exists for each of 11 categories with non-null `avgWeeklySeverity`
- Both baseline and T2 assessments have non-empty `keywordReview` arrays
- Weekly aggregate count matches expected weeks x categories for both periods

**Risks:**

- Pipeline has never been run against live systems — expect debugging
- FR API rate limits may require backoff/retry logic
- WH archive scraping may hit anti-bot measures
- GDELT historical API may return unexpected formats for older dates
- AI calls add ~12 minutes of runtime at 1 call/second (within gpt-4o-mini rate limits)

---

### Sprint 12: AI-Assisted Review Report + Decisions Template

> **Actual:** Delivered review report + Zod-validated decisions schema + JSON template. Extracted 706 items across 4 flag types. See `DECISIONS.md` for details.

**Goal:** Generate a targeted review report from AI Skeptic output covering both baseline and T2 periods. Human reviews flagged items.

**Code work (~250 lines new):**

1. Create `lib/seed/review-report.ts` — generates targeted review report
2. Create `lib/seed/review-decisions.ts` — TypeScript schema for the decisions file
3. Add CLI entries: `seed:review` (generate report), `seed:apply` (apply decisions — Sprint 13)

**Review gate:** Sprint 12 output goes to human review. Sprint 13 cannot start until review is complete.

---

### Sprint 12.1: Review Flow Alignment + Baseline Coverage

> **Actual:** Delivered all work items. DB-centric review flow, interactive CLI, FR signals for igs/infoAvailability. 253 review items from fresh baseline. See `DECISIONS.md` for full retrospective.

**Goal:** Align review-report flagging with UI spec (per-assessment items, not per-keyword), build interactive CLI review flow, add missing category signals.

**Code work:**

1. Rewrite `review-report.ts` — `ReviewItem` model (one per flagged assessment where `flaggedForReview === true`)
2. Update `review-decisions.ts` — `ReviewFeedbackSchema` with 4 feedback types for Sprint 13 consumption
3. Extend `review-queue.ts` — `ResolveDecision` with feedback, `getResolvedReviews()`, `resetResolvedReviews()`
4. New `interactive-review.ts` — pure functions + readline wrappers for CLI review
5. Add FR signals for `igs` (inspector general, oversight) and `infoAvailability` (FOIA, public records)
6. Add `reviewedDocuments` field to `EnhancedAssessment` — stores source documents reviewed by AI

**Key deviation:** DB-centric review flow (alerts table) instead of JSON-as-primary-store. See `DECISIONS.md` §Sprint 12.1.

---

### Sprint 13: AI Skeptic Structured Feedback + Keyword Tuning Pipeline

> **Actual:** Delivered as planned. All 7 work items shipped. Extended AI Skeptic prompt with `suggestedAction`/`suppressionContext`, pre-populated feedback in interactive review, aggregate report generator, `apply-decisions.ts`, regression test fixtures. 63 new tests (772 total). See `DECISIONS.md` for details.

**Goal:** Extend AI Skeptic to generate structured keyword feedback, pre-populate in interactive review, build aggregate report, create `apply-decisions.ts` that writes changes to `assessment-rules.ts`. First keyword refinement cycle.

**Depends on:** Sprint 12.1 (DB-centric review flow, `ReviewFeedbackSchema`)

**Code work (~350 lines new/modified):**

1. Update AI Skeptic prompt (`lib/ai/prompts/skeptic-review.ts`) to generate structured feedback: `falsePositiveKeywords`, `suppressionSuggestions`, `tierChanges` in the response schema
2. Update `parseSkepticReviewResponse()` to extract feedback fields and store in assessment metadata
3. Update interactive review to pre-populate feedback from AI verdicts — after reviewer makes status decision, show "AI flagged these as false positives: [X, Y]. Accept as feedback? [Y/n]"
4. Create post-session aggregate report generator — after completing all reviews, synthesize feedback patterns: keywords that were false_positive in >70% of reviews for a category, systematic tier mismatches, suppression candidates
5. Create `lib/seed/apply-decisions.ts` — reads resolved reviews from alerts table, applies approved changes:
   - Updates `assessment-rules.ts` (keyword removals, tier changes)
   - Adds suppression rules for confirmed false positives
   - Generates patch summary for human verification before applying
6. Create regression test fixtures: `known-true-positives.ts` and `known-false-positives.ts`
7. Re-score with updated rules (`build-baseline --skip-fetch --skip-ai`), recompute baseline statistics

**E2E test:**

- AI Skeptic response includes structured feedback fields
- Interactive review pre-populates false positive keywords from AI verdicts
- Aggregate report shows keyword patterns across reviews
- `apply-decisions.ts` modifies `assessment-rules.ts` with correct changes
- All known true positives score at or above expected tier
- All known false positives are suppressed

**Iterative:** May repeat the review → aggregate → apply → re-run cycle. Exit criterion: human reviewer signs off on scoring distribution.

---

### Sprint 14: Biden 2022 Baseline + Rhetoric-Based Keyword Gaps

> **Status: Done.** Actual: 3 calibration iterations (42→8 alerts). Signal tightening for fiscal/elections/rulemaking. Volume thresholds raised (drift 3→5, capture 2→3). Keyword hallucination filter added. Light fixture export (~29MB) with document manifest. Category rename `indices` → `executiveActions`. 16 coverage tests added. Rhetoric gap analysis + refinement cycle deferred to Sprint 14.1.

**Goal:** Switch to Biden 2022 as primary "steady state normal governance" baseline. Calibrate signals and thresholds to minimize false positives. Export as deterministic fixture set.

**Depends on:** Sprint 13 (keyword tuning pipeline)

**Actual code work:**

1. ~~Run `build-baseline --baseline biden_2022 --model gpt-4o-mini` for Jan 2022 – Dec 2022~~ — **Done** (58,713 docs, 1,272 API calls)
2. ~~Signal tightening~~ — **Done** (fiscal: budget→executive overreach terms, elections: voter→suppression terms, rulemaking: narrowed)
3. ~~Volume threshold calibration~~ — **Done** (drift 3→5, capture 2→3, keyword hallucination filter)
4. ~~Export Biden 2022 as light fixtures with document manifest~~ — **Done** (~29MB committed, raw docs gitignored)
5. ~~Rename `indices` → `executiveActions`~~ — **Done** (V3 Addendum §14.2)
6. ~~Coverage tests for parseCliArgs + computeProportions~~ — **Done** (16 tests, 799 total)

---

### Sprint 14.1: Rhetoric-Based Keyword Gaps + First Refinement Cycle

> **Actual:** Delivered rhetoric gap analysis with PolicyArea→category mapping. 412 gaps across 6 categories (966/50,651 docs classifiable). Human review result: zero keyword additions needed — dictionaries well-calibrated, rhetoric→document vocabulary gap is a translation gap. See `DECISIONS.md` for full findings.

**Goal:** Build rhetoric-to-keyword gap analysis. Run first full keyword refinement cycle using the calibrated Biden 2022 baseline as reference.

**Depends on:** Sprint 14 (calibrated Biden 2022 baseline + fixtures)

**Actual code work:**

1. ~~Rhetoric-to-keyword gap analysis~~ — **Done** (`lib/seed/rhetoric-keyword-gaps.ts`, `lib/data/category-topics.ts`). PolicyArea-based classification using `classifyPolicyAreaWithScore()`, bigram frequency analysis, gaps compared against keyword dictionaries.
2. ~~Integrate missingKeywords into aggregate report~~ — **Done** (Sprint 14.1, via `aggregateMissingKeywords()`)
3. ~~First refinement cycle~~ — **Done**. Result: zero additions needed → no re-score required → baseline unchanged at 8 alerts.
4. ~~Re-export Biden 2022 fixtures~~ — **N/A** (no keyword changes).

---

### Sprint 15: First-Year-in-Term Baselines + Cross-Baseline Validation

> **Status: Done.** Scope changed: dropped Obama 2013 (FR-only source coverage), added Trump 2017 (Year 1) + Trump 2018 (Year 2) with uniform FR+GDELT+WH coverage. Built Trump WH archive scraper. Fixed weekly aggregator date mismatch bug. Cross-baseline validation: military 2.5x Y1 severity, civilService highest absolute, rulemaking most coherent cycle pattern. All keyword-only (`--skip-ai`). See `DECISIONS.md` for full retrospective.

**Goal:** Add first-year-in-term baselines. Build cross-baseline comparison to validate keyword dictionaries across different normal governance periods.

**Depends on:** Sprint 14 (Biden 2022 baseline + tuned keywords)

**Actual code work:**

1. ~~Schema migration: cycle metadata on baselines table~~ — **Done** (`cycle_year`, `administration`, `calendar_year`)
2. ~~Extend BaselineConfig with cycle metadata + source availability~~ — **Done** (`WhArchiveConfig` for archive-era WH scrapers)
3. ~~Drop Obama 2013, add Trump 2017/2018 baselines~~ — **Done** (source uniformity over cross-president diversity)
4. ~~Trump WH archive scraper~~ — **Done** (`parseWhArchiveArticles` + `fetchWhArchiveHistorical`)
5. ~~Cross-baseline validation report~~ — **Done** (`lib/seed/baseline-validation.ts`, `pnpm seed:validate`)
6. ~~Tests for validation + cycle metadata~~ — **Done** (baseline-validation.test.ts, baseline-service.test.ts updates)
7. ~~Run all 4 baselines~~ — **Done** (Biden 2021: 76,946 docs; Biden 2022: 58,713; Trump 2017: 76,749; Trump 2018: 75,063)
8. ~~Fix weekly aggregator date mismatch~~ — **Done** (range query instead of exact match)
9. ~~Fix migration workflow~~ — **Done** (schema-first rule documented)

---

### Sprint 15.1: Cycle-Aware Baselines

> **Status: Done.** All 4 baselines re-run with AI (gpt-4o-mini). 11 cycle adjustment factors computed (military 2.5x, rulemaking 1.36x severity Year 1 vs Year 2). Factors integrated into volume thresholds via optional `cycleFactors` parameter. snapshot.ts refactored (extracted snapshotRhetoric/snapshotLegislative). 26 new tests (882 total). See `DECISIONS.md` for full retrospective.

**Goal:** Re-run primary baselines with AI assessment for better severity data, then compute cycle-position adjustment factors and integrate cycle-aware volume thresholds into the assessment pipeline. Prevents false signals from predictable presidential cycle dynamics (e.g., Year 1 transition surges).

**Depends on:** Sprint 15 (4 baselines with cycle-position metadata and cross-baseline validation)

**Actual code work:**

1. ~~AI baseline re-runs~~ — **Done** (all 4 baselines with gpt-4o-mini, ~$2.28)
2. ~~Schema migration: `cycle_adjustment_factors` table~~ — **Done** (migration 0016)
3. ~~`getCurrentCycleYear()` + constants~~ — **Done** (UTC-safe date math in scoring-config.ts)
4. ~~Cycle adjustment service~~ — **Done** (compute, load, store + CLI `pnpm seed:cycle-factors`)
5. ~~Integrate into assessment pipeline~~ — **Done** (assessment-service, ai-assessment-service, assess-week, snapshot)
6. ~~Tests~~ — **Done** (26 new tests: classifyConfidence, computeRatios, getCurrentCycleYear, analyzeContent+factors, loadCycleAdjustmentFactors)

**Note:** UI cycle annotations (V3 Addendum §15.6) land in Sprint 18 (trend chart annotation) and Sprint 22 (Detailed mode cycle-adjusted ratios on category cards).

---

### Sprint 16: UI Design System + Landing Page

> **Status: Done.** All 9 work items shipped. Indigo-scale design tokens, dark mode + reading level contexts, props-driven CategoryCard/Sparkline/StatusPill, landing page rewrite with `/api/categories/summary` endpoint. 38 new tests (920 total). See `DECISIONS.md` for full retrospective.

**Goal:** Build the new UI foundation and a working landing page rendering real seed data.

**Depends on:** Sprint 15 (committed seed fixtures with validated baselines)

**Actual code work:**

1. ~~CSS custom properties in `styles/globals.css`~~ — **Done** (indigo scale, light/dark mode tokens)
2. ~~Extend `tailwind.config.ts` with custom color tokens~~ — **Done** (dm-_ and status-_ colors)
3. ~~New `components/ui/StatusPill.tsx`~~ — **Done** (Unicode icons + indigo scale + WCAG AA)
4. ~~New `components/ui/Sparkline.tsx`~~ — **Done** (SVG 200x40, baseline ±1σ band)
5. ~~New `components/landing/CategoryCard.tsx`~~ — **Done** (props-driven, embed-ready)
6. ~~Reading level context + toggle~~ — **Done** (`ReadingLevelContext` + `ReadingLevelToggle`)
7. ~~Dark/light mode context + toggle~~ — **Done** (`ThemeContext` + `ThemeToggle`, `prefers-color-scheme` listener)
8. ~~Landing page rewrite~~ — **Done** (header, card grid, methodology footer)
9. ~~`GET /api/categories/summary`~~ — **Done** (DISTINCT ON + window functions, DB-optional fallback)

---

### Sprint 17: Source Health Backend + Landing Banners

**Goal:** Source health tracking, confidence degradation, and landing page integration of data integrity banner and source health summary bar.

**Actual:** Delivered as planned. 12 work items, 24 files, 55 new tests (975 total). Signal IDs on 31 signals, 6 canary sources, SourceHealthCheck classification, meta-assessment with 4 integrity levels, confidence degradation (sourceAvailability weight 0.15, critical cap 0.3), feed fetcher metadata wrapper, source_health DB table, 2 API endpoints, DataIntegrityBanner + SourceHealthBar components on landing page.

**Code work (~300 lines new):**

1. Add `sourceId` + health config to signals in `categories.ts` (V3 Addendum Sprint A)
2. Source health service — `checkSourceHealth()`, status classification (V3 Addendum Sprint A)
3. `source_health` Drizzle schema + migration
4. Confidence degradation — extend `calculateDataCoverage()` with source health factor (V3 Addendum Sprint B)
5. Meta-assessment service — `computeMetaAssessment()` (V3 Addendum Sprint C)
6. API endpoints: `/api/health/sources`, `/api/health/meta`
7. Data integrity banner component (UI spec section 4.7) — renders based on meta-assessment level
8. Source health summary bar component (UI spec section 4.8) — dots + counts on landing page

**E2E test:**

- Run snapshot — `source_health` records created for every signal with sourceId
- `GET /api/health/meta` returns valid `dataIntegrity` level
- Landing page shows data integrity banner when meta-assessment is not "high"
- Source health bar shows correct healthy/degraded/unavailable dot counts

---

### Sprint 18: Category Detail Page + Trend Chart

> **Status: Done.** All 8 work items shipped. Single `/api/category/[key]` endpoint (reused existing weekly-scores). ComposedChart with baseline ±1σ band, cycle annotation, AI reviewer notes with constraint label. 4 new components, 5 test files, 24 new tests (999 total). See `DECISIONS.md` for full retrospective.

**Goal:** Full category detail page with trend chart, evidence panel, and assessment summary.

**Actual code work:**

1. ~~API endpoint: `GET /api/category/[key]`~~ — **Done** (combined metadata + assessment + baseline in one response; reused existing `/api/history/weekly-scores` for chart data)
2. ~~Category detail page (`pages/category/[key].tsx`)~~ — **Done** (loading state, 404, back link, header with StatusPill + data coverage + experimental badge)
3. ~~Trend chart~~ — **Done** (recharts ComposedChart with decay-weighted score line, baseline ±1σ Area band, ReferenceLine for avg, ChartTooltip)
4. ~~Assessment summary~~ — **Done** (AssessmentSummary component with reason + "How we could be wrong" bullets)
5. ~~Evidence panel~~ — **Done** (EvidencePanel with tier grouping, reviewed documents, suppressed keywords in Detailed mode)
6. ~~AI reviewer notes~~ — **Done** (AiReviewerNotes with summary/detailed modes, keyword verdicts, constraint note)
7. ~~Cycle annotation~~ — **Done** (CycleAnnotation in TrendChart, hidden when cycle years match, per V3 Addendum §15.6)
8. ~~Tests~~ — **Done** (5 files: TrendChart, AssessmentSummary, EvidencePanel, AiReviewerNotes, category-detail API)

---

### Sprint 19: Week Detail + Document Table + Export

**Goal:** Week drill-down pages, sortable document table, and CSV/JSON export.

**Actual:** Delivered. Reused existing `/api/explain/week` endpoint (no new week/documents API needed). Items 1-2 from spec unnecessary — existing endpoints sufficient. 5 new files, 3 test files, 22 new tests (1021 total). Deferred: DocumentTable on category detail → Sprint 20, per-week AI notes → Sprint 22.

**Code work (~300 lines new):**

1. ~~API endpoint: `GET /api/category/[key]/week/[date]`~~ — used existing `/api/explain/week`
2. ~~API endpoint: `GET /api/category/[key]/documents?from=&to=` (paginated)~~ — used existing endpoint with `top=200`
3. Week detail page (`pages/category/[key]/week/[date].tsx`) — independently loadable via URL
4. Week summary cards (total score, doc count, severity mix, vs. baseline)
5. Top keyword matches section (grouped by tier with document links)
6. Sortable document table component (shared between category detail and week detail)
7. CSV export for document tables
8. Methodology JSON export endpoint

**E2E test:**

- Click trend chart data point — navigates to week detail page
- `/category/courts/week/2025-02-03` loads independently (URL-stable, no prior nav state required)
- Week summary cards show correct values from seed data
- Document table shows scored documents with correct tier counts
- CSV export contains correct data matching DB
- Back link returns to category detail

---

### Sprint 20: Signal Gap Remediation — Display Fix + Signal Queries + Presidential Documents

**Goal:** Fix the most visible dashboard problems: misleading Warning badges for insufficient data, pre-existing AND-instead-of-OR bug in FR signal queries, missing presidential documents, noisy GDELT queries, and broken document linkage.

**Depends on:** Sprint 19 (week detail page complete)

**Reference:** `SIGNAL_GAP_REMEDIATION.md` Phases 16, 17, 20.2, 20.5, and §19.4 prerequisite fix.

**Actual:** Delivered as planned. All 8 work items shipped. 18 FR queries fixed (AND→OR), 5 GDELT queries filtered (sourcecountry:US), 7 PRESDOCU signals added, FR subtype→DocumentClass mapping, InsufficientData "No Data" badge, document_id NULL resolution, oversightGovDown removed. 17 files modified, 1027 tests.

---

### Sprint 21: Signal Gap Remediation — Keyword Expansion + Baseline Regeneration

**Goal:** Add operational-language keywords for Type B erosion detection, create administration-specific keyword overlay, expand FR signal queries, and regenerate all baselines from scratch against the finalized methodology.

**Depends on:** Sprint 20 (signal queries fixed, presidential documents in pipeline, data integrity fixed)

**Reference:** `SIGNAL_GAP_REMEDIATION.md` Phases 18, 20.3, 20.4.

**Code work (~250 lines new/modified):**

1. Add structural operational keywords to `assessment-rules.ts` per category (Phase 18.2 — civilService, fiscal, military, igs, courts)
2. Create `lib/data/admin-specific-keywords.ts` overlay with date-filtered merge logic (Phase 18.3)
3. Add `getEffectiveKeywords()` merge function to `assessment-service.ts` (~20 lines) (Phase 18.3)
4. Create initial suppression rules for anticipated false positives (Phase 18.4)
5. Add new expanded FR signal queries to `categories.ts` (Phase 20.3)
6. Calibrate all new signal queries against Biden 2022 date range (Phase 20.4)

**Run work (external APIs, ~$8–24 AI cost):**

7. Archive existing baseline fixtures as pre-remediation reference
8. Regenerate all four baselines from scratch: fresh FR API fetches with new signals + keywords, AI assessment
9. Run cross-baseline validation, review cycle, tune if needed (same iterative pattern as Sprint 14)
10. Export new baseline fixtures
11. Run Trump 2025 backfill against finalized methodology

**Tests:**

- Unit tests: `getEffectiveKeywords()` merge logic, date filtering at boundaries
- Verify admin-specific keywords produce zero matches for pre-2025 documents
- Verify `assessment-rules.ts` remains `string[]` per tier (no structural changes)
- Cross-baseline validation: regenerated baselines produce comparable or lower alert counts

---

### Sprint 22: Signal Gap Remediation — Rhetoric Cross-Feed

**Goal:** Route rhetoric documents through category keyword assessment with evidence source weighting and news-only status ceilings. Events covered by news but absent from the Federal Register produce Warning-level signals with clear annotation.

**Depends on:** Sprint 21 (keywords and baselines finalized with new methodology)

**Reference:** `SIGNAL_GAP_REMEDIATION.md` Phase 19.

**Code work (~300 lines new/modified):**

1. Add `EvidenceSource` type and `EVIDENCE_WEIGHTS` to type definitions (Phase 19.2)
2. Implement news-only status ceiling in assessment logic (Phase 19.3)
3. Create `lib/services/rhetoric-topic-classifier.ts` — signal-term-based classifier covering all 11 categories (Phase 19.4)
4. Modify backfill/snapshot pipeline to route rhetoric documents through category keyword matching (Phase 19.4)
5. Re-process Trump 2025 rhetoric documents through category assessment (Phase 19.5)
6. Review cycle: verify news-coverage-driven signals are genuine, tune evidence weights if needed
7. Update UI to render `newsOnly` warnings distinctly (Phase 19.3)

**Run work (~$1–2 AI cost):**

- Re-process ~11.5K topic-matched rhetoric documents through keyword matching + AI review

**Tests:**

- Pure function tests: evidence weight application (0.3× for news, 1.0× for FR)
- Unit tests: news-only ceiling enforcement (cannot produce Drift or Capture)
- Unit tests: `classifyRhetoricToCategories()` routes to correct categories, all 11 reachable
- Integration test: rhetoric document → topic classification → keyword match → weighted score → `document_scores` record

---

### Sprint 23: Methodology + Supporting Pages (Summary Mode)

**Goal:** Methodology page plus Infrastructure, Rhetoric, P2025, and Source Health pages — all in Summary mode. Built on the now-stable detection methodology from Sprints 20–22.

**Depends on:** Sprint 22 (detection methodology finalized — methodology page content is stable)

**Code work (~350 lines new):**

1. Methodology page (`pages/methodology.tsx`) — sidebar nav, scoring formula with worked example, interactive keyword explorer
2. Infrastructure convergence page (`pages/infrastructure.tsx`) — convergence status, three theme panels, intensity bars
3. Rhetoric-to-Action page (`pages/rhetoric.tsx`) — Summary table (policy area, what's said, what's done, lag weeks)
4. P2025 page (`pages/p2025.tsx`) — headline percentage bar, by-area breakdown, recent matches
5. Source health page (`pages/health.tsx`) — meta-assessment summary, historical availability chart, per-source detail table
6. Infrastructure convergence banner on landing page (UI spec section 4.3)
7. Document table on category detail page (reuses `DocumentTable` component from Sprint 19)
8. Detection scope statement on methodology page (`SIGNAL_GAP_REMEDIATION.md` §Detection Scope Statement)
9. Playwright e2e test setup + core user journey tests

**E2E test (Playwright):**

- Playwright config, dev server startup, DB seed in `globalSetup`
- Landing page → click category card → category detail loads with trend chart
- Category detail → toggle reading level → AI reviewer notes expand
- Category detail → back to overview → landing page
- Navigate to each supporting page from nav — all render with correct data
- Dark mode toggle persists across navigation
- Visual regression screenshots for landing + category detail (light + dark)

---

### Sprint 24: Admin Auth + Review Queue

**Goal:** Admin authentication and human review queue with feedback fields.

**Depends on:** V3 Addendum Sprint D (Feedback Store)

**Code work (~300 lines new):**

1. Admin auth: login page (`pages/admin/login.tsx`), `POST /api/admin/auth`, admin middleware, cookie management (UI spec section 10A.1)
2. `feedback` Drizzle schema + migration (V3 Addendum Sprint D)
3. `feedback-store.ts` — `recordFeedback()`, `getUnprocessedFeedback()`, `markProcessed()`
4. Review queue page (`pages/admin/reviews.tsx`) — pending reviews list, decision form with feedback fields
5. Extended `resolveReview()` accepting feedback (false positive keywords, missing keywords, tier change suggestions)
6. Admin nav bar with pending count badges (UI spec section 10B.2)
7. Add auth middleware to existing `pages/api/reviews.ts`

**E2E test:**

- `/admin/reviews` without token — redirects to `/admin/login`
- Login with correct `ADMIN_SECRET_TOKEN` — review queue renders
- Submit review decision with feedback fields — `feedback` record created in DB
- Pending count badge updates after resolution
- Logout — cookie cleared, redirect to login

---

### Sprint 25: Detailed Mode + Chart Toggles

**Goal:** Detailed mode features across all existing pages.

**Code work (~300 lines new):**

1. Chart toggle tabs on category detail (decay-weighted, running avg, running sum, high-water, severity mix)
2. AI reviewer notes display (UI spec section 5.4) with ceiling constraint label — includes per-week AI assessment on week detail page (requires storing AI results per-week in snapshot pipeline)
3. Suppression audit panel — "What was suppressed" column with rule explanations
4. Baseline overlay selector — multi-select pills for up to 2 baselines (UI spec section 13.2)
5. Cycle-adjusted ratio display on category cards in Detailed mode — raw and adjusted comparisons shown side by side (V3 Addendum §15.6)
6. Semantic drift placeholder (disabled with tooltip "Requires baseline centroids — coming in Sprint 27")
7. Document class breakdown, full keyword lists, technical details in Detailed mode
8. Detailed mode content on supporting pages (Rhetoric, P2025, Infrastructure)

**E2E test:**

- Switch to Detailed mode — chart toggles appear, suppression panel visible, technical details shown
- Select second baseline — overlay band renders with different color
- AI reviewer notes show ceiling constraint label
- Switch back to Summary — all Detailed content hidden
- Disabled chart toggles show informative tooltip

---

### Sprint 26: Suppression Learning + Proposals Page

**Goal:** Feedback learning pipeline and admin proposal review interface.

**Depends on:** Sprint 24 (feedback store must exist)

**Code work (~300 lines new):**

1. `generateSuppressionProposals()` — learn from accumulated feedback records (V3 Addendum Sprint E)
2. `suppression_proposals` Drizzle schema + migration (with `proposal_source` and `source_submission_id`)
3. Proposal validation against true-positive test fixtures (auto-block proposals that would suppress genuine detections)
4. `generateKeywordHealthReport()` (V3 Addendum Sprint E)
5. Proposal review API: `GET/POST /api/admin/proposals`
6. Keyword health API: `GET /api/methodology/keyword-health`
7. Admin proposals page (`pages/admin/proposals.tsx`) — source filtering, proposal cards with approve/reject (UI spec section 10B)
8. Keyword health section on methodology page (Detailed mode, UI spec section 6.3)

**E2E test:**

- Submit review with false positive feedback — run proposal generation — proposal appears in `/admin/proposals`
- Approve proposal — suppression rule created + regression test fixture appended
- Proposal that would suppress a true positive — approve button disabled with warning
- Keyword health report shows noisy/dormant keywords with recommendations

---

### Sprint 27: Novel Threats + Expert Submissions

**Goal:** Semantic novelty detection and expert keyword contribution system.

**Depends on:** Sprint 26 (proposal pipeline must exist for novelty/expert proposals to flow through)

**Code work (~300 lines new):**

1. Baseline centroid computation + storage in `category_baselines` table (V3 Addendum Sprint F)
2. `detectNovelDocuments()` + `detectNovelDocumentsAllCategories()` with AI triage prompt
3. `MIN_NOVELTY_MULTIPLE` and `NOVELTY_DRIFT_TRIGGER` constants in `scoring-config.ts`
4. Expert submission service + `expert_submissions` Drizzle schema (V3 Addendum Sprint H)
5. Backtest engine for submitted keywords (best-effort)
6. Expert submission form (`pages/admin/submissions.tsx`, UI spec section 10C)
7. Rhetoric-to-keyword pipeline — `rhetoric-keyword-pipeline.ts` (V3 Addendum Sprint G section 13.6)
8. Enable semantic drift visualization on category detail (was placeholder in Sprint 25)

**E2E test:**

- Novel document detection flags semantically unusual documents invisible to keywords
- Submit expert keyword — backtest results shown — proposal created with `proposalSource: 'expert_submission'`
- Rhetoric gap detected — keyword proposal generated with `proposalSource: 'rhetoric_pipeline'`
- Semantic drift chart renders on category detail in Detailed mode

---

### Sprint 28: Onboarding + Responsive Polish + Performance

**Goal:** First-time onboarding, mobile layouts, performance optimizations.

**Code/Run work (~250 lines):**

1. First-time visitor onboarding overlay (UI spec section 4.5)
2. Card ordering toggle — "By concern level" / "By category group" (UI spec section 4.6)
3. Mobile layout refinements per feature visibility table (UI spec section 10.2)
4. Performance: lazy loading for charts, virtual scrolling for large document tables
5. Data integrity banner condensed mode for non-landing pages (UI spec section 4.7)

**E2E test:**

- Onboarding overlay shows on first visit, dismissed, never shows again
- Card ordering toggle reorders grid correctly
- Mobile viewport (< 768px) renders 1-column layout with collapsed sections

---

### Sprint 29: Alternative Sources

**Goal:** Research and implement alternative data sources for resilience when government sources degrade.

**Code work (~300 lines new):**

1. Research spike: CourtListener API authentication, rate limits, data coverage (V3 Addendum Sprint I)
2. Research spike: State AG RSS feed availability and quality
3. Source priority framework — `lib/data/source-tiers.ts` (V3 Addendum Sprint I)
4. Court filing integration — `court-filing-service.ts` + parser (V3 Addendum Sprint J)
5. FOIA litigation tracking via filtered CourtListener query (V3 Addendum Sprint J)
6. Add alternative source signals to relevant categories in `categories.ts`
7. Rhetoric-to-keyword gaps section on `/rhetoric` page (Detailed mode, UI spec section 8.4)

**E2E test:**

- Alternative sources produce data that flows through scoring pipeline
- Source health tracker monitors alternative sources alongside primary sources
- Category assessments incorporate Tier 2+ source data when available
- Rhetoric page shows keyword gap cards in Detailed mode

---

### Future: Immigration Category (R4)

After the remediation pipeline is complete (Sprint 22), a new immigration category can be added following established patterns. This is deferred because the detection pipeline must be correct before adding new categories.

1. Define immigration signal queries for `categories.ts`
2. Build keyword dictionary for `assessment-rules.ts` (capture, drift, warning tiers)
3. Calibrate against all four regenerated baselines
4. Backfill Trump 2025 immigration data
5. Review and tune

Can slot in after Sprint 22 when scheduling allows.

---

## Known Prerequisites for Future Sprints

| Issue | Blocker for                      | Description                                                                                                                                                                                                                              |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #28   | Sprint L (Search Infrastructure) | Normalize `source_type` values in documents table. Three specs disagree on semantics; actual DB has FR document types mixed with content classifications. Search Specification §4.1 filters by origin-based values that don't exist yet. |

---

## Parallel Track Opportunities

Not everything is strictly sequential. Where human review or API runs create wait time:

| While waiting for...                            | Can parallelize...                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Sprint 13-14 keyword tuning + review iterations | Sprint 16 UI design system work (CSS vars, components with placeholder data)          |
| Sprint 15 baseline API runs + validation        | Sprint 15.1 cycle adjustment computation (as categories complete, not all-or-nothing) |
| Sprint 15 baseline API runs + validation        | Sprint 17 source health backend (starts fresh, no historical data dependency)         |
| Sprint 20 signal query audit + testing          | Sprint 20 UI display fix (InsufficientData badge) — no dependency between them        |
| Sprint 21 baseline regeneration runs            | Sprint 22 rhetoric-topic-classifier code (pure functions, no data dependency)         |
| Sprint 21 baseline regeneration runs            | Sprint 23 methodology page layout + static content                                    |
| Sprint 28 onboarding + responsive work          | Sprint 27 novel threat / expert submission code work                                  |

---

## Estimated Seed Data Sizes

| Table                    | Included in fixtures? | Size Estimate          | Notes                                                     |
| ------------------------ | --------------------- | ---------------------- | --------------------------------------------------------- |
| `documents`              | Yes (metadata only)   | ~2.5 MB                | Title, URL, category, dates. Omit content and embeddings. |
| `document_scores`        | Yes                   | ~1.5 MB                | Per-document keyword scores                               |
| `weekly_aggregates`      | Yes                   | ~120 KB                | Primary data source for charts                            |
| `baselines`              | Yes                   | ~7 KB                  | Mean, stddev, doc count per category per baseline         |
| `assessments`            | Yes                   | ~300 KB                | AI Skeptic + keyword snapshots                            |
| `intent_weekly`          | Yes                   | ~55 KB                 | Rhetoric/action scores per policy area per week           |
| `p2025_proposals`        | Already exists        | In `seed-proposals.ts` | 14 proposals                                              |
| `validation_data_points` | Already exists        | In `seed-data.ts`      | 150 external index data points                            |
| Embeddings               | No                    | Too large (~30 MB)     | Computed on-demand post-seed                              |

Total fixture size: ~4-5 MB (reasonable for git).

**Note:** Baseline fixtures will be regenerated in Sprint 21. Post-remediation fixtures will be larger due to expanded signal queries pulling more documents. Pre-remediation fixtures are archived for methodology comparison.
