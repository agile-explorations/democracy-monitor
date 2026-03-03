# Democracy Monitor — Roadmap

This document describes the planned sprint sequence for completing the Democracy Monitor system. It bridges the specification documents (which describe _what_ the system does) and GitHub Issues (which track _who is doing what right now_).

**Specification documents:**

- `ARCHITECTURE_PROPOSAL.md` — **Primary spec for Sprints R1–R5 and R-S1.** Three-layer triangulated detection across 13 democratic threat vector categories (grounded in V-Dem, Freedom House, Levitsky & Ziblatt frameworks). Includes source expansion plan, Dashboard Visualization section, and category framework with framework alignment mapping.
- `CATEGORY_FRAMEWORK_ANALYSIS.md` — Analysis mapping Democracy Monitor categories against established democracy measurement frameworks. Rationale for 13-category architecture, renames (courts → judicialIndependence, igs → executiveOversight), and new categories (lawEnforcement, civilLiberties).
- `SPIKE_FINDINGS.md` — Results from 8 source availability spikes. 7 passed (CourtListener, DOJ API, GovInfo/GAO, IG RSS, LegiScan, FEC, FCC RSS), 1 failed (GDELT diversity metrics). Validates source volumes, API access, historical depth, and metadata quality for Sprint R-S1.
- `TEST_SPECIFICATION.md` — Ship/no-ship gate checklist for Sprint R-S1. Unit tests (routing, structural scoring, convergence logic, status mapping), integration tests (pipeline behavior, coverage health, embedding segregation), calibration assertions (baseline stability, known-events sensitivity, router drift). Derived from ChatGPT architecture review.
- `SYSTEM SPECIFICATION V3 ADDENDUM.md` — Backend features: source health, feedback learning, novel threat detection, expert contributions, cycle-aware baselines (Sprints A-J, Phase 15). Partially superseded by architecture proposal — source health (Sprint 17) and cycle-aware baselines (Sprint 15.1) remain; feedback learning and novel threat detection restructured under Layers 2 and 3.
- `UI DESIGN SPECIFICATION V3.md` — UI redesign: information architecture, visual language, component design, admin interface (Phases 1-5). **Partially superseded** — data model, status system, and visualization content changed by Architecture Proposal. Architecture-independent decisions (visual language, reading level toggle, dark/light mode, responsive design, embed pattern) carry forward. See `UI_V3_DIVERGENCE_MAP.md` for section-by-section mapping. Full V4 rewrite tracked as R-F10 in Post-R5.
- `SIGNAL_GAP_REMEDIATION.md` — Signal detection gap fixes: InsufficientData display, presidential documents, keyword expansion, rhetoric cross-feed, expanded FR queries (Phases 16-20, Sprints 20-22). Sprints 20-21 code work completed; Sprint 22 rhetoric cross-feed absorbed into Sprint R1.

**Prior work:** Sprints 1-10 built the core dashboard, assessment engine, AI skeptic review, progressive disclosure, snapshot/backfill infrastructure, history page, infrastructure overlay, rhetoric tracking, P2025 pipeline, validation indices, and test coverage. Sprints 11-12.1 built seed data framework, baseline backfill, review report, interactive CLI review, and DB-centric review flow. Sprints 13-21 built keyword tuning pipeline, 4 baselines (Biden 2021/2022, Trump 2017/2018), cycle-aware adjustments, UI rebuild (landing page, category detail, week detail), source health monitoring, and signal gap remediation. See `MEMORY.md` sprint log and `DECISIONS.md` for details.

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

> **Legacy (keyword-era pipeline).** This section describes the original keyword-tuning seed pipeline built in Sprints 11–15.1. Under the three-layer architecture (Sprint R2+), keywords are annotations only — they do not affect detection or baselines. The keyword-tuning infrastructure is preserved for regression comparison and UI annotation context, but **baselines are now defined by**: Layer 1 structural distributions (volume, type composition, functional distribution, agency activity, publication tempo per source type), Layer 2 AI flag rates (Pass 1 triage + Pass 2 assessment), and Layer 3 embedding centroids (per-source-type). See `ARCHITECTURE_PROPOSAL.md` §Baseline Recomputation Strategy for the current baseline approach.

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
- `/category/judicialIndependence/week/2025-02-03` loads independently (URL-stable, no prior nav state required)
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

**Actual:** Code work (WI1–WI6) delivered as planned. 56 keywords added across 5 categories, admin overlay with date-filtered merge, 4 new FR signals, 4 suppression rules, pipeline integration. 6 files changed (4 modified, 2 new), 17 new tests (1044 total). ~~Run work (WI7–11: baseline regeneration, validation, export) pending.~~ **Superseded by architecture redesign** — Sprint 21 run work (keyword-based baseline regeneration) is no longer needed. Under the new three-layer architecture, keywords are annotations only and don't affect detection or baselines. Baselines are regenerated differently in Sprints R2 (structural distributions + embeddings) and R3 (AI flag rates). The Sprint 21 code work (keywords, admin overlay, `getEffectiveKeywords()`) remains valuable as annotation metadata.

---

## Architecture Redesign: Sprints R1–R5

> **Decision (2026-02-22):** Replace keyword-driven detection with three-layer triangulated architecture. See `ARCHITECTURE_PROPOSAL.md` for full design. This supersedes the old Sprint 22–29 sequence and Sprint 21 run work. Old sprint plans archived below for reference.

### Sprint R1: Document Corpus Fixes

> **Status: Done.** All 3 work items shipped. Fixed `getEffectiveKeywords()` bug in document-scorer and trend-anomaly-service, captured FR API action/subtype in metadata JSONB via `buildMetadata()`, built rhetoric cross-feed classifier reusing FR signal search terms. 13 files changed, 51 new tests (1095 total). Coverage thresholds lowered to match newly-instrumented files. See `DECISIONS.md` for full retrospective.

**Goal:** Fix the document corpus so all three detection layers have correct, complete input data. These are source infrastructure fixes that any architecture needs.

**Depends on:** Sprint 21 code work (completed) + Sprint 20 (signal queries fixed)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Sprint R1

**Actual code work:**

1. ~~**`document-scorer.ts` bug fix**~~ — **Done.** Fixed both `document-scorer.ts` and `trend-anomaly-service.ts` to use `getEffectiveKeywords()` instead of raw `ASSESSMENT_RULES`. Also fixed `countKeywordsInItems` which had the same bug.
2. ~~**Capture FR API `action` and `subtype` fields**~~ — **Done.** Extracted `buildMetadata()` helper in `document-store.ts`. Added `action` to `ContentItem`, `FrApiDocument`, `FrDocument` types. Threaded through `toContentItem()` and `transformDoc()`.
3. ~~**Rhetoric cross-feed**~~ — **Done.** `rhetoric-crossfeed.ts` parses FR signal URLs from `categories.ts` to extract per-category search terms. `SUPPLEMENTAL_TERMS` added for `executiveActions` (type-based signals). Module-level cache. All 11 categories reachable.

---

### Sprint R2: Layer 1 (Structural Anomaly) + Layer 3 (Thematic Drift)

**Goal:** Build the two deterministic/quasi-deterministic detection layers. Start with layers that don't require AI (except for cluster labeling), allowing validation of structural and thematic detection before adding AI in R3.

**Depends on:** Sprint R1 (correct document corpus with `action` field and rhetoric cross-feed)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Layer 1, §Layer 3

**Estimated scope:** ~250–370 new/modified lines of code. Layer 3 is adaptation of existing semantic drift and clustering services, not greenfield.

**Actual:** Code work delivered. ~580 LOC production, ~716 LOC tests. 19 files changed, 79 new tests (1174 total). Ships 5 of 6 structural dimensions (source convergence deferred), rolling thematic drift with bootstrap awareness, partial convergence synthesis (L1+L3). Run work (embedding backfill, baseline distributions, threshold calibration) deferred to separate session. Key decisions in DECISIONS.md.

**Code work:**

1. **Functional classifier** — Deterministic tiered approach: `source_type` (Tier 1, ~63%) → title prefix heuristics (Tier 2, ~17%) → `action` field (Tier 3, ~20% when available). Priority-ordered `ClassificationRule[]` pattern. Pure function, zero dependencies, trivially testable. (~80–120 LOC)
2. **Structural anomaly scoring** — Pure functions computing deviation scores per dimension from baseline metadata distributions. Ships with 5 dimensions: volume, type composition, functional distribution, agency activity, publication tempo. Source convergence activates when rhetoric cross-feed is complete — if still in progress, composite score redistributes weight across the other 5 dimensions. (~50–70 LOC)
3. **Baseline structural distributions** — Compute from existing 4 baselines. SQL queries against existing metadata: volume mean/stddev, type composition distribution, functional distribution, agency activity patterns. (~40–60 LOC)
4. **Long-horizon drift** — Fixed-baseline comparison + cumulative deviation (trailing 12-week window). Stored in `structural_detail` JSONB column.
5. **FR document embedding backfill** — Extend `embedUnprocessedDocuments()` to cover FR documents (currently only rhetoric docs embedded). One-time batch: ~75K docs × text-embedding-3-small = ~$1.50, ~10–15 min.
6. **Adapt semantic drift service** — Switch `semantic-drift-service.ts` from cross-administration baseline comparison to intra-administration rolling window (4–8 weeks). Core centroid computation and cosine similarity functions already exist.
7. **Novel document detection** — Documents far from all established cluster centroids. Rolling variance tracking.
8. **Initial cluster labeling** — Run existing `semantic-clustering-service.ts` k-means + AI labeling on baseline embeddings. Monthly cadence, not weekly. (~$2–5)
9. **Convergence synthesis (partial)** — Status determination combining Layer 1 + Layer 3 only. Layer 2 added in R3. (~40–60 LOC)
10. **Schema extension** — Add nullable columns to `weekly_aggregates`: `structural_score`, `structural_detail` (jsonb), `thematic_score`, `thematic_detail` (jsonb), `convergence_score`, `convergence_detail` (jsonb). Preserves existing data.
11. **Threshold calibration** — Run against all 4 baselines. Set thresholds so baselines produce >95% Stable, never Confirmed Concern.

**Run work (~$4–7 total):**

- Compute baseline structural distributions (SQL, free)
- Embed FR documents (~$1.50, ~15 min)
- Run clustering + AI labels (~$2–5, ~30 min)
- Run against Trump 2025 data and compare to current keyword-based results

**Validation:**

- Confirm Layer 1 detects spike findings: Presidential Document surge in civilService (3.5% → 10.4%), Excepted Service notice disappearance (18 → 0), Proposed Rule decline in fiscal (11.6% → 8.5%)
- Layer 3 rolling window produces meaningful centroid distances for Trump 2025 data

**Tests:**

- Unit: functional classifier covers all tiers, edge cases (SES `includes()`, "Submission for OMB Review" specificity)
- Unit: structural anomaly scoring as pure functions (given distributions → deviation scores)
- Unit: convergence synthesis status determination logic
- Unit: long-horizon drift cumulative deviation computation
- Integration: weekly aggregator stores structural/thematic/convergence scores

---

### Sprint R3: Layer 2 (AI Two-Pass Assessment) + Source Convergence + Reproducibility

**Goal:** Implement AI-based assessment that runs on every document, independently of keywords and structural signals. Establish baseline AI flag rates.

**Depends on:** Sprint R2 (Layers 1 and 3 operational — convergence synthesis needs all three layers)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Layer 2

**Actual:** Code work delivered. ~750 LOC production, ~450 LOC tests. 27 files changed (14 modified, 13 new), 47 new tests (1221 total). Ships Layer 2 (two-pass AI assessment with epistemic independence), source convergence (6th structural dimension), reproducibility audit script, backfill CLI, and ConfirmedConcern convergence status. Run work (baseline AI runs, ~$47-97) deferred to separate session. Key decisions in DECISIONS.md.

**Code work:**

1. ~~**Pass 1 — Signal Finder**~~ — **Done.** Zod schema + prompt + assessPass1() pure function. gpt-4o-mini default, temperature 0, structured JSON output. (~50 LOC)
2. ~~**Pass 2 — Skeptical Analyst**~~ — **Done.** Zod schema + prompt + assessPass2(). Claude Sonnet 4.5 default. Different provider for epistemic independence. (~50 LOC)
3. ~~**Pass 1 False-Negative Audit**~~ — **Done.** selectAuditSample() deterministic selection + audit tracking in computeAIAssessmentSummary(). (~30 LOC)
4. **Baseline AI flag rates** — Deferred to run work (~$6-12).
5. **Pass 2 baseline assessments** — Deferred to run work (~$28-60).
6. ~~**Update convergence synthesis**~~ — **Done.** 3-layer synthesis with ConfirmedConcern status. Bootstrap-aware AI integration. (~80 LOC rewrite)
7. ~~**Source convergence dimension**~~ — **Done.** log2-smoothed gov/rhetoric ratio, integrated into structural scoring with 0.13 weight. (~65 LOC)
8. ~~**AI reproducibility strategy**~~ — **Done.** Model versions recorded in ai_document_assessments table. Reproducibility audit script compares stored vs re-run results. (~170 LOC)
9. **Full three-layer validation** — Deferred to run work (~$9-18).

**Additional items delivered:**

- **Layer 2 orchestrator** — Coordinates Pass 1 → Pass 2 → audit flow with rate limiting. (~80 LOC)
- **Layer 2 storage adapter** — DB adapter for ai_document_assessments table. (~70 LOC)
- **Backfill CLI** — `pnpm layer2:backfill` with --baseline/--from/--to/--category/--pass/--dry-run. (~80 LOC)
- **Schema migration** — ai_document_assessments table (22 columns), aiScore/aiDetail on weekly_aggregates. (migration 0019)
- **Pipeline integration** — Layer 2 wired into snapshot.ts and enrichWithLayerScores(). (~25 LOC)

**Run work (~$47–97 total for baseline regeneration):**

- Pass 1 on 4 baselines (~$6–12)
- Pass 2 on flagged baseline docs (~$28–60)
- Full system on Trump 2025 (~$9–18)

> **Run work status: Done (2026-02-24/25).** Completed Phases 0–6: Pass 1 on all 4 baselines, Pass 2 on flagged docs, Trump 2025 full backfill (221 flags / 14,480 docs = 1.5% flag rate). Layer score enrichment across all 2,896 category-weeks. Calibration findings: STRUCTURAL_ANOMALY_THRESHOLD raised to 2.5, THEMATIC_DRIFT_ELEVATED raised to 3.5, STRUCTURAL_MIN_DOC_COUNT = 10 dampening introduced. Final results: Biden 2022 97.7% Stable, Biden 2021 95.3%, Trump 2017 92.0%, Trump 2018 89.2%, Trump 2025 84.0%. Both Biden baselines exceed >95% Stable target. AI layer fires only in Trump 2025 (8 Elevated). See `ARCHITECTURE_PROPOSAL.md` §Calibration findings for full details.

---

### Sprint R3.1: Deployment Strategy + Data Management

> **Status: Done.** render.yaml fixes (db:migrate in build, cron stagger, digest API key), DEPLOYMENT.md (deploy guide + data strategy + disaster recovery), CONTRIBUTING.md data setup tiers, README.md architecture refresh (11 categories, three-layer detection), ai_document_assessments in seed pipeline. 9 files changed. See `DECISIONS.md` for retrospective.

---

### Sprint R3.2: Snapshot Source Parity (Launch Blocker) ✅

**Goal:** Ensure the daily cron snapshot produces the same source mix per category as the backfill, so live monitoring data is directly comparable to baselines.

**Depends on:** Sprint R1 (rhetoric cross-feed classifier ✅)

**Actual:** Completed. Key finding during planning: neither backfill nor snapshot was cross-feeding rhetoric to assessment categories. The `classifyRhetoricToCategories()` function (Sprint R1) was never integrated into any pipeline. All three pipelines stored rhetoric as `category='intent'` only. Baselines and live data were already in parity (both FR-only per assessment category), but source convergence was a no-op. Fix: schema migration to `(url, category)` composite unique + `crossfeedRhetoricToCategories()` helper wired into all 3 pipelines. 10 files changed, 5 new tests. Milestone #21, Issues #127-#130.

**Risk if skipped:** Every week of live monitoring after launch will be structurally incomparable to baselines. This is not a "nice to have" — it invalidates the baseline calibration that Sprints R2–R3 spent ~$50–100 establishing.

---

### Sprint R3.3: Category Renames ✅

> **Status: Done.** Database migration script renamed all category values across 11 tables. Codebase-wide rename: 7 data files, 2 service files, 1 UI component, 2 demo files, 2 comment examples, 34 test files. Seed fixtures regenerated via `pnpm seed:export`. 1240 tests pass. Milestone #22, Issues #131-#137.

**Goal:** Rename `courts` → `judicialIndependence` and `igs` → `executiveOversight` across the entire codebase before new code accumulates under old names.

**Depends on:** Nothing (can run anytime, but best done before Sprint R4 starts building new UI against category keys)

**Actual code work:**

1. ~~**Database migration**~~ — **Done.** `scripts/rename-categories.ts` renamed category values in `documents`, `ai_document_assessments`, `weekly_aggregates`, `document_scores`, `baselines`, `source_health`, `assessments`, `alerts`, `debates`, `keyword_trends`, `cycle_adjustment_factors`, `p2025_proposals` (dashboard_category). Also handles JSONB arrays in `legal_documents` and `semantic_clusters`.
2. ~~**Codebase rename**~~ — **Done.** 7 data definition files, 2 service files, 1 UI component, 2 demo files, 2 comment examples, 34 test files.
3. ~~**Seed data + fixtures**~~ — **Done.** Regenerated all 7 fixture JSONs via `pnpm seed:export`.
4. ~~**Single atomic commit**~~ — **Done.**

**Rationale:** Doing this now (before R4 builds the dashboard UI) avoids a larger rename diff later. Every component built after this point uses the correct threat-vector-oriented names.

---

### Source Availability Spikes (pre-R-S1, parallelizes with R3.2/R3.3/R4)

> **Status: Done (2026-02-25).** All 8 spikes complete. 7 passed, 1 failed (GDELT diversity metrics — wire syndication inflates domain counts). 13 categories confirmed viable for launch. Key discoveries: DOJ has open JSON API (360-400 enforcement docs/week), CourtListener serves 3 categories (selective prosecution claims up 663% in 2025), LegiScan Strong Pass at free tier with Bulk API included (1,826 bills already backfilled). See `SPIKE_FINDINGS.md` for full results.

**Reference:** `SOURCE_AVAILABILITY_SPIKES.md` (spike specs), `SPIKE_FINDINGS.md` (results)

**Results summary:**

| Spike | Source          | Verdict                  | Key Finding                                                                                                                    |
| ----- | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | LegiScan        | **Strong pass**          | Free tier includes Bulk API (30K queries/month, ~60× headroom). ~20 election bills/week nationally. 1,826 bills already in DB. |
| 2     | CourtListener   | **Strong pass**          | Free API, 15-20/wk (judicial) + 50-70/wk (law) + 67-123/wk (civil liberties).                                                  |
| 3     | DOJ API         | **Strong pass**          | Open JSON API — 360-400 enforcement docs/week. Major discovery.                                                                |
| 4     | civilLiberties  | **Strong pass**          | CourtListener NOS 440 alone gives 67-123/week.                                                                                 |
| 5     | FCC RSS         | **Pass**                 | ~5-10 media-relevant docs/week (meets ≥5 bar).                                                                                 |
| 6     | GDELT diversity | **Failed**               | Wire syndication noise. Keep existing rhetoric pipeline only.                                                                  |
| 7     | FEC             | **Pass (supplementary)** | ~5-8/week. Unique institutional signal: deadlock rate + 2025 quorum collapse.                                                  |
| 8     | GAO/CIGIE       | **Strong pass**          | GovInfo API excellent. Combined with IG RSS = 15-30/week.                                                                      |

**Decision:** 13 categories viable. lawEnforcement and civilLiberties are launch candidates (not fast-follows). Sprint R-S1 scope determined — see below.

---

### Sprint R4: Narrative Generation + Dashboard Redesign

**Goal:** AI-generated weekly narratives for elevated categories + dashboard visualization for three-layer architecture. Administration Overview as primary entry point. Keywords demoted to annotation role.

**Depends on:** Sprint R3 (all three layers operational + validated) + Sprint R3.2 (snapshot source parity) + Sprint R3.3 (category renames)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §AI Narrative Generation, §Dashboard Visualization, §Role of Keywords

**Split into three incremental sub-sprints (R4a → R4b → R4c) to ship working slices and avoid a monolithic UI sprint.**

#### Sprint R4a: API Layer + Narrative Generation (Backend) ✅

> **Status: Done.** `narratives` table + migration, narrative-generation-service.ts (dual-audience prompts, Opus 4.6), narrative-store.ts (DB CRUD), narrative-pipeline.ts (orchestration), `/api/narratives/[category]` + `/api/narratives/overview` endpoints with on-demand generation, snapshot pipeline integration as final step. 15 files changed, 51 new tests (1411 total). See `DECISIONS.md` for retrospective.

**Goal:** Build narrative generation service and API endpoints. No UI changes.

**Code work (~300 lines new, ~100 lines tests):**

1. ~~**`narratives` table**~~ ✅ — Schema: `category`, `weekOf`, `version` ('expert'|'public'), `content` (text), `model` (varchar), `generatedAt` (timestamp). Composite unique on `(category, weekOf, version)`.
2. ~~**Narrative generation service**~~ ✅ (`lib/services/narrative-generation-service.ts`) — `generateCategoryNarrative(category, weekOf, layerData)` → expert + public versions. Uses Opus 4.6. Elevated+ categories get live generation; Stable categories get template summary.
3. **Overview API endpoint** (`pages/api/overview/summary.ts`) — Returns all categories with current status, sparkline data, narrative summaries, synchrony counts, status timeline. Aggregates from `weekly_aggregates` + `narratives`. _Note: narrative data served via separate `/api/narratives/overview` route instead._
4. ~~**Narrative API endpoint**~~ ✅ (`pages/api/narratives/[category].ts`) — Returns expert + public narratives for a category. Triggers generation if missing and category is Elevated+.
5. ~~**Snapshot integration**~~ ✅ — Wire narrative generation into `snapshot.ts` for Elevated+ categories.
6. ~~**Tests**~~ ✅ — Unit tests for narrative service (mock AI provider), API endpoint tests.

#### Sprint R4b: Administration Overview Page ✅

**Goal:** Build the primary entry point page that gets linked and shared.

**Code work (~400 lines new components, ~150 lines tests):**

1. **`pages/overview.tsx`** — Overall status summary (AI narrative from overview API), category drift heatmap, status timeline, synchrony chart, cross-cutting patterns, category cards sorted by long-horizon drift, methodology footer.
2. **New components:** `CategoryDriftHeatmap` (categories × weeks, color = structural deviation), `StatusTimeline` (convergence status change history), `SynchronyChart` (Elevated+ count per week), `ConvergenceMatrix` (3-column Layer 1/2/3 indicator).
3. **Landing page update** — Prominent link to `/overview` from `pages/index.tsx`.
4. **Tests** — Component tests for new overview components.

**Actual:** Delivered as rewrite of `pages/index.tsx` (not separate route). R4a was deferred at time of R4b (narrative generation required source expansion) — now completed as Sprint R4a. Built: overview-service.ts, `/api/overview/summary`, CategoryDriftHeatmap, StatusTimeline, SynchronyChart, OverviewStatusSummary, ConvergenceIndicator (simplified from ConvergenceMatrix). Shared chart-colors.ts extracted from TrendChart/TrajectoryChart. 28 new tests (1273 total). Bug fix: TrajectoryChart stale `indices` key.

#### Sprint R4c: Category Detail Redesign + Keyword Demotion

**Goal:** Three-panel category detail page with convergence matrix. Demote keywords to annotation role.

**Code work (~350 lines new/modified, ~200 lines tests):**

1. **Category detail page update** — Convergence matrix at top. Panel 1: Structural signature (volume + type composition + functional distribution). Panel 2: AI assessment distribution (stacked bar). Panel 3: Thematic drift (centroid distance + clusters). Narrative with reading level toggle.
2. **Landing page CategoryCard update** — Convergence indicator (3 dots), AI summary line, long-horizon context ("X% above baseline").
3. **Keyword demotion** — Label keywords as "annotations for context (not scoring)". Show Pass 1/Pass 2 results alongside keyword annotations. No code removal.
4. **Methodology page** — Updated for three-layer architecture.
5. **Tests** — Component tests, Playwright e2e for core journeys.

**Run work (~$1–5/week ongoing for narrative generation):**

- Opus 4.6 Extended on ~1–3 elevated categories per week
- Cross-category synthesis: ~$0.50–2.00/week additional

**Actual:** Delivered. ConvergenceHeader (reuses R4b ConvergenceIndicator), StructuralSignaturePanel, AIAssessmentPanel, ThematicDriftPanel on category detail + week detail pages. CategoryCard convergence indicator. EvidencePanel annotationMode, AiReviewerNotes legacy framing. Methodology page full rewrite (9 sections). Added: click-to-navigate on overview heatmap/timeline (#156), three-layer data on week detail page (#157). Deferred: narratives (R4a), Playwright e2e, long-horizon CategoryCard metric. 6 new components, 32 new tests (1305 total).

---

### Sprint R5: Cross-Architecture Validation + Launch Prep

**Goal:** Validate the three-layer system against old architecture. Prepare for public launch.

**Depends on:** Sprint R4 (dashboard shows three-layer results), Sprint R-S1 (source expansion complete)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Sprint R5

**Code work:**

1. **Cross-architecture validation** — Run both old (keyword) and new (three-layer) systems in parallel for 4 weeks.
2. **Publish comparison report** — Document detection differences between architectures.
3. **Decommission keyword-based status determination** — After validation period confirms three-layer system catches everything keywords caught plus more.
4. **Methodology documentation** — Updated public methodology docs for three-layer architecture, citing V-Dem/Freedom House/Levitsky & Ziblatt framework alignment.

### Sprint R-S1: Source Expansion (parallelizes with R4/R5)

**Goal:** Expand document sources to achieve meaningful signal across all 13 categories. Build ingestion pipelines, run historical backfills, compute per-source-type baselines. Includes elevated items: coverage health monitoring, Pass 2 mechanism extraction.

**Depends on:** Sprint R3.3 (category renames ✅). Source availability spikes complete (✅). Can run in parallel with R4 and R5.

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Source Expansion, §Cross-Source Document Deduplication, §Layer 1 Multi-Source Structural Analysis, §Sprint R-S1. `SPIKE_FINDINGS.md` for source details. `TEST_SPECIFICATION.md` for ship/no-ship gates.

#### Sprint R-S1a: Foundation + CourtListener + DOJ Integration ✅

> **Status: Done.** Schema foundation (`source_origin` column + migration), CourtListener REST API v4 fetcher, DOJ Press Release JSON fetcher, DOJ frozen taxonomy (15 internal buckets), 2 new categories (lawEnforcement, civilLiberties — 13 total), coverage health monitoring with silence detection, multi-source backfill pipeline extensions, source-origin backfill of 132,260 existing documents. 37 files changed, 61 new tests (1366 total). See `DECISIONS.md` for retrospective.

**Phase 1 — P0 Ingestion pipelines + coverage health (~2 weeks, parallelizable):**

Build in order of category coverage breadth and implementation simplicity:

1. **CourtListener REST API** ✅ (Sprint R-S1a) — Serves 3 categories (judicialIndependence, lawEnforcement, civilLiberties). Free, well-structured API. RECAP docket search with NOS-code-based category routing. Establishes source integration pattern for subsequent APIs.
2. **GovInfo/GAO REST API** ✅ (Sprint R-S1b) — Fixes executiveOversight thinness (5-15 → 15-30 docs/wk). Free key, MODS XML metadata, 36K req/hr. `lib/services/govinfo-fetcher.ts` — GAO Reports, Congressional Reports, Public Laws.
3. **DOJ Press Release JSON API** ✅ (Sprint R-S1a) — Enriches lawEnforcement (360-400/wk). Open JSON API. **Prerequisite:** ~~freeze stable internal taxonomy mapping (10-20 durable buckets) before integration~~ Done: `lib/data/doj-taxonomy.ts` — 15 durable internal buckets.
4. **LegiScan pipeline wiring** → Sprint R-S1e. Fetcher (`legiscan-fetcher.ts`, 207 lines), bulk import (`legiscan-bulk.ts`, 278 lines), and 1,826 classified bills already exist in DB (T1: 627, Biden: 515, T2: 676). Free tier operational (API key in `.env.local`). Needs signal definitions, snapshot integration, and re-classification for new categories.
5. **Coverage health monitoring** ✅ (Sprint R-S1a) — Per-source-type document count per day with alerting when a source goes silent for >2× expected cadence. Ships alongside first source integration, not after. Minimum viable: daily ingestion counts + "source silent" alerts + DOJ taxonomy change tracking. _(Elevated from R-F4 — pipeline break vs. real silence is critical with 7+ source types.)_
6. **Cross-source document deduplication** — Add `canonical_id` column to documents table (nullable, partial unique constraint). Each fetcher extracts source-native document identifiers; normalization handles cross-source ID matching (e.g., GovInfo packageId → GAO report number). Ships with first multi-source category overlap (GovInfo + IG RSS for executiveOversight). See `ARCHITECTURE_PROPOSAL.md` §Cross-Source Document Deduplication.

**Phase 1b — P1 Enrichment sources (fast-follow or tail of Phase 1):**

> **Status: Done (Sprint R-S1b).** All 3 items delivered. IG + FCC as RSS signals (no custom fetcher needed), FEC as full fetcher module. 8 new signals across 4 categories. 17 files changed, 36 new tests. See `DECISIONS.md` for retrospective.

7. **IG RSS feeds** ✅ (Sprint R-S1b) (DOD, HHS, DOJ OIG) — Supplements GovInfo for executiveOversight. Added as standard RSS signals. 3 signals: `ig_dod_rss`, `ig_hhs_rss`, `ig_doj_rss`.
8. **FCC RSS feeds** ✅ (Sprint R-S1b) — Supplementary enrichment for mediaFreedom (~5-10/wk). 2 signals: `fcc_news_rss`, `fcc_actions_rss`.
9. **FEC OpenFEC API** ✅ (Sprint R-S1b) — `lib/services/fec-fetcher.ts` — Advisory opinions + MURs/enforcement. 2 signals: `fec_advisory_opinions`, `fec_enforcement`. Optional API key for higher rate limits.

#### Sprint R-S1c: Fault-Tolerant RSS/HTML/JSON Signal Fetching ✅

> **Status: Done.** `fetchWithRetry()` HTTP retry wrapper (3 attempts, exponential backoff), wired into 4 feed-fetcher signal handlers (RSS, HTML, JSON, Federal Register). `recordSnapshotSignalResults()` for fetch_log integration. `retry-failed-signals` cron at 11am UTC for extended outages. `buildSignalLookup()` helper. 8 files changed, 1526 tests total. See `DECISIONS.md` for retrospective.

#### Sprint R-S1d: Backfill Verification Fixes ✅

**Actual:** All 4 fixes complete. Code fixes (#178-181) delivered. FR backfills complete for 4 new categories across all baseline periods. FEC pagination (offset-based) and DOJ binary search (off-by-one) fixed, OpenGrep made blocking, 246 lines dead code removed. cl_first_amendment query rewritten to scoped variant + `purge:cl-noise` tool built (R-S1f). FR backfills for lawEnforcement, civilLiberties, mediaFreedom completed. NOS maxPages bumped 10→15→45 (R-S1g). immigrationEnforcement category added with 2 FR signals + GDELT cross-feed. FCC RSS (#183) deferred — gov shutdown. Pipeline redesign proposal drafted (BACKFILL_PIPELINE_REDESIGN.md).

**Source:** Backfill verification audit (2026-02-28). API-vs-DB count comparison across all source types and baseline periods. FEC perfect match, GovInfo near-perfect, DOJ structurally verified.

**Fix 1 — `cl_first_amendment` query rewrite + re-backfill (HIGH PRIORITY)**

The current unquoted `first+amendment` text search matches any docket containing both words separately anywhere — ~234K results in Trump T1 vs. ~19K captured (~8%). The pagination cap (maxPages=10, 200 results) samples randomly from a noise-dominated result set. This isn't a cap problem; it's a query precision problem.

Recommended query: `"first amendment" AND (violation OR injunction OR challenge OR retaliation OR "free speech" OR "free press")`. Verification: Trump T2 drops from 55,838 → 5,742 results, peak weekly ~125 (fits 200-result cap with margin). Captures active litigation, retaliation claims, and press freedom cases while excluding tangential mentions.

**This changes the signal's character, not just its volume.** Existing cl_first_amendment data is a random ~8-14% sample of mostly-irrelevant dockets. All civilLiberties baselines that included this data require full recomputation after re-backfill.

Work items:

1. Update `cl_first_amendment` query to quoted + scoped variant
2. Purge existing cl_first_amendment documents (they're a biased sample, not salvageable)
3. Re-backfill cl_first_amendment for all 4 baseline periods + Trump T2
4. Verify post-backfill counts against API: peak weekly ≤200 (fits pagination cap)

**Fix 2 — FR backfill for 3 missing categories + mediaFreedom RSS verification**

Three categories have FR signals that were added after the original FR backfill ran, so they have zero FR documents:

- `lawEnforcement`: `fr_doj` (agency=justice-department) — added in R-S1a
- `civilLiberties`: `fr_civil_rights` (civil rights/due process) — added in R-S1a
- `mediaFreedom`: `fr_press_foia`, `fr_foia_compliance` — added earlier but FR backfill not re-run

**mediaFreedom is the worst case:** it currently has zero documents of any type — no FR, no RSS, no GDELT. It's the only non-intent category that is completely empty. The FCC RSS signals (`rss_fcc_media`, `rss_fcc_enforcement`) were configured in R-S1b but have never produced documents, and there are zero fetch_log entries for them. FR backfill will add FR documents, but RSS signals need explicit verification.

Work items:

1. Run FR backfill for these 3 categories across all baseline periods + Trump T2
2. Verify documents appear with correct source_origin tagging
3. **mediaFreedom RSS verification:** Manually trigger FCC RSS signal fetch and confirm documents are produced and stored. If the signals fail, diagnose before Phase 2 (broken RSS signals would leave mediaFreedom with FR-only data, undermining multi-source convergence for this category).

**Fix 3 — CourtListener NOS maxPages bump**

NOS-based signals (440, 530, 890) lose ~2.6% of documents in Trump T1 peak weeks when weekly filings exceed 200 per NOS code (sample peaks: NOS 440=204, NOS 530=220, NOS 890=200). One-line fix: bump maxPages from 10 to 15. Bundle with Fix 1 re-backfill.

**Fix 4 — Add `immigrationEnforcement` category (FR-only initial)**

The architecture proposal lists immigrationEnforcement as "Operational" but the category does not exist in the codebase — no entry in `categories.ts`, no signals, no documents. This is the only category in the 13-category framework that isn't implemented at all.

**Why a separate category (not absorbed into lawEnforcement or civilLiberties):** Immigration enforcement is historically where executive power expansions and due process erosions are _tested first_ — weakest legal protections, lowest political resistance. The travel ban, family separation, and current mass deportation operations all involved institutional mechanisms (emergency authority invocations, military-civilian enforcement blurring, due process shortcuts) that set precedents beyond immigration. The category tracks the _enforcement apparatus pattern_, not individual cases. The unique signal that no other category captures is operational enforcement tempo: detention expansion, removal acceleration, border wall waivers, asylum restrictions. lawEnforcement and civilLiberties capture the _legal contestation_ of these actions; immigrationEnforcement captures the _operational rulemaking_ that enables them.

**FR signal verification (2026-02-28):** The FR API nests sub-agency documents (ICE, CBP) under the parent DHS agency. This means a pure ICE agency filter is 100% redundant with a DHS + immigration terms filter — all ICE docs match both. Verified counts:

| Signal                                         | Trump T1 | Biden    | Trump T2 | Unique contribution                                   |
| ---------------------------------------------- | -------- | -------- | -------- | ----------------------------------------------------- |
| `fr_dhs_immigration` (DHS + immigration terms) | 638      | 570      | 193      | 98.5% of all docs                                     |
| `fr_cbp_enforcement` (CBP + enforcement terms) | 56       | 50       | 47       | ~9 unique (border wall, apprehension authority)       |
| ~~`fr_ice`~~ (all ICE docs)                    | 32       | 38       | 21       | **0 unique — 100% redundant with fr_dhs_immigration** |
| **Unique total**                               | **~647** | **~579** | **~202** |                                                       |

Weekly rates: ~6.2/wk (T1), ~5.5/wk (Biden), ~3.3/wk (T2). Thin — comparable to hatch — but viable. Structural dampening will reduce noise on thin weeks. T2 is below STRUCTURAL_MIN_DOC_COUNT=10 most weeks, making GDELT rhetoric cross-feed essential for this category's convergence scoring.

**Signals (2, not 3):**

1. `fr_dhs_immigration` — agency=`homeland-security-department`, terms: `asylum OR "temporary protected status" OR deportation OR detention OR removal OR immigration OR "public charge"`. Workhorse signal — captures DHS parent agency immigration rulemaking plus all nested ICE/USCIS sub-agency documents matching immigration terms. 19.5% precision filter (excludes 80% of non-immigration DHS docs like Coast Guard, FEMA, TSA).
2. `fr_cbp_enforcement` — agency=`u-s-customs-and-border-protection`, terms: `detention OR removal OR deportation OR "expedited removal" OR "border wall" OR apprehension OR enforcement`. Adds ~9 unique border enforcement docs per period that use enforcement terms not in the DHS immigration term list. 16.2% precision filter (excludes trade/customs).

Dropped: `fr_ice` — 100% redundant. If ICE publication monitoring is needed later, inspect the `agencies` metadata field on DHS-captured documents rather than maintaining a separate signal.

**GDELT is critical for this category.** At 5-6 docs/week FR-only, immigrationEnforcement is too thin for meaningful convergence scoring alone. Immigration enforcement generates substantial GDELT volume. Once the rhetoric cross-feed routes those articles here, the category gets multi-source convergence (FR rulemaking + GDELT coverage). The FR↔GDELT dependency pair receives 0.75× convergence weight per §Source Dependency Map, but even dampened, this is far stronger than FR-only.

**Future enrichment (not in R-S1d):** DHS/ICE/CBP monthly statistical tables (encounters, detention bed counts, removals) as quarterly batch downloads — similar to FEC monthly aggregation pattern. This is the unique operational tempo signal that makes the category fully distinct. Deferred to Phase 5 since no structured API exists (Excel/PDF downloads only).

Work items:

1. Add `immigrationEnforcement` to `categories.ts` with 2 FR signal definitions (fr_dhs_immigration, fr_cbp_enforcement)
2. Add `SUPPLEMENTAL_TERMS` entry for immigrationEnforcement in `rhetoric-crossfeed.ts` — the fr_dhs_immigration signal uses agency-level filtering, and the cross-feed parser may not extract usable terms from agency-only URL patterns. Verify that lawEnforcement's fr_doj signal (also agency-only) has the same coverage. Terms: `immigration`, `deportation`, `detention`, `asylum`, `border`, `ICE`, `CBP`, `removal`, `enforcement`.
3. Run FR backfill for all 4 baseline periods + Trump T2
4. Verify document counts match verification (T1 ~647, Biden ~579, T2 ~202 unique)
5. Confirm the "all 13 categories" gate now passes

**Not a fix — GovInfo Trump T2 delta (-7):** Self-corrects on next backfill run. No action needed.

#### Sprint R-S1e: Backfill Pipeline Redesign (Phase 1) ✅

> **Actual:** Phase 1 delivered (7 issues, #184-#190). Fixed backfill skip logic (score/aggregate/embed always run), removed dead CLI flags + 3 deleted files (~580 lines removed), added `compute-baseline-stats` and `backfill:verify` commands, incremental snapshot for API signals. Phase 2 items (LegiScan, cron locks, `snapshot --from/--to`, cl_first_amendment purge, WH/GDELT `--source` options) deferred to R-S1f. Net: +425 lines (1174 added, 749 removed), 1532 tests across 124 files.
>
> **Post-sprint follow-up (2026-02-28):**
>
> - Fixed `embedUnprocessedDocuments()` to loop until done and filter by category (was single-batch, no filter)
> - Added FR period coverage check to `backfill:verify` (per-category × 5 baseline periods)
> - Added GDELT cross-feed coverage check to `backfill:verify` (per-category doc counts)
> - Fixed CL pagination cap from 20 → 300 (actual `maxPages=15 × pageSize=20`)
> - Added 22 tests for backfill-verify (12) and verification service (10)
> - Fixed `recompute-scores` OFFSET pagination skip: added `documents.id` tiebreaker (reduced missing scores from 8,583 → 3 out of 337,494)
> - Ran `recompute-scores` across all categories: 337,491/337,494 scored, 3,665 weekly aggregates
> - Final verify state: 3 missing scores, 0 missing aggregates, baselines 4/4 × 14/14 complete

#### Sprint R-S1f: Backfill Pipeline Redesign (Phase 2) ✅

> **Actual:** Phase 2 delivered (5 issues, #191-#195). Unified WH/GDELT/LegiScan as `--source` options in backfill, added cron overlap protection (PostgreSQL advisory locks), added `snapshot --from/--to` for retroactive assessment, created `purge:cl-noise` command for CL noise document cleanup, removed dead `fetchWhArchiveHistorical` (~94 lines). 1561 tests across 126 files.

**Absorbed:** Original R-S1e scope (incremental snapshot, LegiScan integration, cron locks) folded into the pipeline redesign. See `docs/internal/BACKFILL_PIPELINE_REDESIGN.md` for the complete proposal.

**Source:** Pipeline redesign proposal (2026-02-28). The existing backfill/snapshot/build-baseline commands have overlapping responsibilities, inconsistent stage execution, and CLI flags that bypass methodology. The redesign unifies everything into a 9-stage pipeline with clean commands.

**Goal:** Replace the current patchwork of `pnpm backfill`, `pnpm build-baseline`, `pnpm snapshot` with a unified pipeline: `pnpm backfill` (stages 1-4: ingest/score/aggregate/embed), `pnpm compute-baseline-stats` (stage 5), `pnpm snapshot --from/--to` (stages 6-9: L1/L2/L3/convergence), plus `pnpm backfill:verify` and `pnpm recompute-scores`. Also includes cl_first_amendment data purge (deferred from R-S1d), incremental snapshot (replacing 20-item cap), LegiScan as `--source legiscan`, WH/GDELT as `--source` options, and cron overlap protection.

**Depends on:** Sprint R-S1d ✅. Must land before Phase 2 baseline computation.

_The original R-S1e analysis below is preserved as context. The implementation plan is in `BACKFILL_PIPELINE_REDESIGN.md`._

**Finding: 20-item cap silent data loss**

All API-based snapshot fetchers use a fixed "fetch latest 20" strategy with no awareness of what's already in the DB:

| Source           | What it fetches              | Daily avg           | Peak                   | % captured on peak days |
| ---------------- | ---------------------------- | ------------------- | ---------------------- | ----------------------- |
| Federal Register | `per_page=20`, newest        | varies by signal    | 159 (infoAvailability) | ~13%                    |
| CourtListener    | `.slice(0, 20)` first page   | 38 (civilLiberties) | 105                    | ~19%                    |
| DOJ              | `.slice(0, 20)` first page   | varies              | varies                 | ~20 items max           |
| GovInfo          | Last 7 days, `.slice(0, 20)` | low                 | low                    | OK (7-day window helps) |
| FEC              | `.slice(0, 20)` default sort | low                 | low                    | OK (monthly cadence)    |

The backfill pipeline uses `fetchHistorical` with date-range pagination and captures everything. The daily snapshot is best-effort — documents that fall off the first page before the next snapshot are lost until the next backfill run.

**Design: Incremental backfill since last run**

The snapshot/backfill distinction collapses. The daily cron becomes "fetch everything since last stored date, paginated" — effectively an incremental backfill with a dynamic start date. A normal day fetches 1-2 pages per source. A catch-up day after an outage fetches more. The pipeline doesn't care.

For each API source in each category signal:

1. Query `getLastPublishedAt(sourceOrigin, category)` from documents table
2. Fetch from `lastDate - 2 days` to today using existing `fetchHistorical` variants (all 5 API sources already have these)
3. Paginate fully (no artificial cap) with per-source rate limiting
4. Upsert via `storeDocuments` (handles overlap from 2-day buffer)
5. If no prior data, fall back to current `fetchRecent` behavior

The 2-day overlap buffer (not 1-day) accounts for FR's publication_date lag and CourtListener's date_filed vs date_created boundary issues. Upsert dedup makes the overlap cost-free.

RSS/HTML/JSON feeds cannot benefit — you get whatever's currently in the feed. The retry-failed-signals cron (R-S1c) remains the fault-tolerance mechanism for these.

**Design: DB-based cron lock**

Prevents overlapping cron runs (relevant after outage catch-up, not on normal days):

- `cron_locks` table: `(job_name, acquired_at, pid)`. `INSERT ... ON CONFLICT DO NOTHING` for atomic acquisition.
- Staleness check: if lock is older than 6 hours, consider it stale and steal it with a warning log.
- Per-job locking: `job_name` column supports multiple cron jobs (snapshot, LegiScan weekly, retry-failed-signals).
- Release on completion or crash (process exit handler).

**Design: LegiScan weekly cron (Option A)**

LegiScan's session-based ZIP download model (`getDatasetList` → `getDataset`) doesn't fit the signal/feed-fetcher pattern. Instead of forcing it through `fetchSignalInner()`, LegiScan runs as a separate weekly cron:

1. `legiscan-bulk.ts` runs weekly (not daily — datasets update weekly). Acquires DB lock (`job_name = 'legiscan_weekly'`).
2. Checks `dataset_hash` against `legiscan_datasets.datasetHash` — only downloads changed sessions.
3. Stores bills in documents table with correct `source_origin = 'legiscan'` and category tags.
4. Runs Layer 2 assessment on newly stored bills (same `assessPass1`/`assessPass2` pipeline).
5. Records source health in `source_health` table.
6. Records fetch results in `fetch_log` for pipeline monitoring.
7. `render.yaml` cron entry (weekly, e.g., Sunday 4am UTC — before Monday's daily snapshot).

LegiScan is inherently fault-tolerant: each ZIP contains the complete legislative session. A missed week causes zero data loss — next week's download still includes everything. `fetchWithRetry` wrapping needed for transient HTTP failures during ZIP download.

**No LegiScan signals in categories.ts.** Bills are already in the documents table with category tags. The daily snapshot's `computeWeeklyAggregate()` and Layer 1/2/3 scoring see them via standard `(category, weekOf)` queries. Source health monitoring uses the `fetch_log` entries from the weekly cron.

**Design: fetch_log enhancement**

Record both `fetchedCount` (items returned by API) and `storedCount` (items newly stored after dedup) in `fetch_log`. This distinguishes:

| Scenario                 | HTTP | fetchedCount | storedCount                       |
| ------------------------ | ---- | ------------ | --------------------------------- |
| Normal operation         | 200  | 15           | 15                                |
| Caught up (ran recently) | 200  | 3            | 0 (all dupes from overlap buffer) |
| Source quiet             | 200  | 0            | 0                                 |
| Source down              | 503  | —            | —                                 |

Source silence detection (>2× expected cadence) uses `fetchedCount` — a source returning 0 results is genuinely quiet. `storedCount` is a pipeline health metric (fetching but failing to store = bug).

**Code work (~150-250 lines new/modified + migration):**

1. `getLastPublishedAt(sourceOrigin, category)` in `document-store.ts` (~15 lines)
2. Route API fetchers through `fetchHistorical` with dynamic date range in `feed-fetcher.ts` (~50-80 lines modifying existing fetch dispatch)
3. `cron_locks` table migration + `acquireLock`/`releaseLock`/`isStale` functions (~60-80 lines)
4. Wire lock acquisition into `snapshot.ts` and `legiscan-bulk.ts` (~15 lines each)
5. LegiScan weekly cron: `render.yaml` entry + post-download Layer 2 assessment + source health recording + fetch_log integration (~40-60 lines)
6. LegiScan re-classification for immigrationEnforcement + mediaFreedom (~10 lines in classification rules)
7. `fetch_log` schema update: add `stored_count` column alongside existing `document_count` (~migration + 10 lines in recording functions)
8. Wrap `legiscan-fetcher.ts` API calls with `fetchWithRetry` (~5 lines)

**Tests:**

- Unit: `getLastPublishedAt` returns correct date per source/category, null for empty
- Unit: incremental fetch date range computation (lastDate - 2 days, fallback to fetchRecent)
- Unit: cron lock acquisition, staleness detection, release
- Unit: fetch_log records both fetchedCount and storedCount
- Integration: snapshot with incremental fetch stores all documents (not just first 20)
- Integration: LegiScan weekly cron stores bills + runs Layer 2 + records source health

**Phase 2 — Historical backfill (~1 week, mostly compute time):**

_Depends on: (a) R-S1d data quality fixes landed (cl_first_amendment query scoped, FR gaps filled, immigrationEnforcement added, NOS maxPages bumped), (b) R-S1e incremental snapshot deployed and running (no more silent data loss from 20-item cap), and (c) fetch_log-based verification passes — API-vs-DB counts within tolerance per source type per baseline period. All three conditions must be met before baseline computation begins. Computing baselines against incomplete data invalidates all downstream detection._

- Pull documents from all new sources across all 4 baseline periods + Trump 2025 monitoring period
- All validated sources have 2017+ archives
- Route documents through category assignment logic with source-type tagging
- **Re-cross-feed existing GDELT rhetoric corpus to 13 categories.** The Sprint R1/R3.2 cross-feed was built and validated against 11 categories. Three new categories (lawEnforcement, civilLiberties, immigrationEnforcement) have no GDELT cross-feed rows. Re-run `crossfeedRhetoricToCategories()` against the existing ~57K rhetoric documents with the updated `categories.ts` (which now includes all 13 categories and their signals). One-time batch operation. This is required before baseline computation — without it, the 3 new categories have FR-only baselines and source convergence is a no-op for them. For immigrationEnforcement specifically, GDELT is essential (FR volume is only ~5-6/wk).

**Phase 3 — Per-source-type baseline computation + Layer 2 enhancement:**

- Compute source-type-specific Layer 1 structural baselines (start with volume + 1-2 source-specific dimensions per source type; expand after calibration validates cross-source aggregation)
- **Pass 2 mechanism extraction** — Update Pass 2 prompt to require structured mechanism identification fields. Prompt change only. _(Elevated from R-F5 — makes narratives defensible rather than vibes-based.)_
- Run Layer 2 Pass 1 + Pass 2 for new documents in affected categories
- Compute Layer 3 per-source-type embeddings and baseline centroids
- Source-type-specific cycle-aware normalization (legislative sessions for LegiScan, judicial calendar for CourtListener, fiscal year for GovInfo)
- Validate asymmetric dampening bypass (volume collapse → dampeningFactor = 1.0)
- Existing FR source-type baselines preserved unchanged — source expansion is additive

**Phase 4 — Validation (per `TEST_SPECIFICATION.md` ship/no-ship gates):**

- Category-level baselines still meet >95% Stable for Biden periods
- Trump 2025 signal quality with enriched multi-source corpus
- Cross-source convergence scoring with source influence cap (≤ 40% per source type)
- Source dependency map: DOJ↔CourtListener and FR↔GDELT pairs receive 0.75× convergence weight
- Pass 2 mechanism extraction produces structured, verifiable output
- Coverage health monitoring fires correctly (simulate source silence)
- Cross-source dedup: canonical_id normalization catches GovInfo↔GAO and GovInfo↔IG overlaps; duplicate-rejection rate tracked per source pair
- FEC monthly aggregation: null on non-batch weeks, meaningful institutional capacity signal
- LegiScan Layer 1 structural signals work without AI classification
- Backfill completeness: API count vs. DB count per source type per baseline period within acceptable tolerance (FEC: exact match; GovInfo: ≤1% delta; CourtListener NOS signals: ≤3% delta; cl_first_amendment: peak weekly ≤200, no pagination cap loss; FR: all 13 categories have documents; GDELT cross-feed: all 13 categories have rhetoric documents)

**Phase 5 — P2 Deferred sources (post-launch):**

- Oversight.gov scraping (all 75 IGs — no API)
- VRL partnership (calibration dataset for LegiScan AI accuracy)
- CBO reports pipeline (fiscal — low-volume supplementary signal)
- DHS/ICE/CBP monthly statistical tables for immigrationEnforcement (encounters, detention, removals — Excel/PDF download, quarterly batch, no API)

#### Sprint R-S1g: CourtListener Pagination Fix ✅

**Source:** `backfill:verify` pagination fitness warnings (2026-03-01). Analysis of weekly CL volume distributions revealed systemic truncation across civilLiberties and lawEnforcement.

**Actual:** maxPages bumped 15→45 (CL_BACKFILL_MAX_PAGES named constant), verification cap 300→900, `--force` flag added to backfill for re-fetching completed weeks. Re-backfilled all CL baseline periods + T2. Baselines recomputed for civilLiberties and lawEnforcement. Deduplication (NOS 440 shared between categories) deferred as future optimization — daily double-fetch is negligible (~4 extra 1-page API calls/day) and restructuring backfill from category-major to week-major is a larger change.

**Problem:** civilLiberties and lawEnforcement CourtListener signals both query NOS 440 (civil rights). With `maxPages=15` (300 results), 37% of all weeks exceed the cap (101/272 for civilLiberties, 102/272 for lawEnforcement). Trump T1 (2017–2018) averages 430–530 docs/week — every week is truncated. 51,774 URLs (72% of civilLiberties CL corpus) are shared between the two categories, meaning the same documents are fetched twice via separate queries.

**Key constraint:** Baselines and monitoring must use the same pagination cap. Current baselines are computed from truncated data. Fixing forward monitoring without re-backfilling baselines would create false volume anomalies (500 docs/week vs baseline computed from 300 docs/week).

**Volume profile (weekly docs, courtlistener):**

| Period             | civilLiberties avg | lawEnforcement avg | Cap status                    |
| ------------------ | -----------------: | -----------------: | ----------------------------- |
| Trump T1 (2017–18) |            430–448 |            464–531 | Permanently exceeded          |
| Biden (2021–22)    |            131–135 |            123–126 | Under cap                     |
| Trump T2 (2025–26) |            182–187 |            159–195 | Borderline, some weeks exceed |

**Depends on:** No blockers. Should land before Phase 2 baseline computation (R2).

---

## Post-R5: Remaining Features & Validated Improvements

These items are validated but not yet scoped for specific sprints. They come from two sources: (1) features from the original Sprint 23–29 plan that survive under the new architecture, and (2) improvements identified during the architecture review process (2026-02-22 through 2026-02-24) by ChatGPT, Claude Code, and design discussion.

When starting sprint planning, review this list for items relevant to current work. When new ideas emerge during implementation, add them to the "Added During Implementation" section at the bottom.

---

### Architecture Improvements (from review)

#### R-F1: Pass 1 Pre-filtering with Functional Classifier

**Source**: Claude Code review #4 · **Layer**: 2 · **Effort**: Small (~20 LOC)
**Prerequisite**: Layer 1 functional classifier operational (Sprint R2 ✅)

Documents classified by Layer 1 as `financial_regulatory` or `cultural_ceremonial` are formulaic and extremely unlikely to be relevant. Skipping Pass 1 for these saves ~15–20% AI costs with zero false-negative risk. Add a `PASS1_SKIP_BUCKETS` constant — documents in those buckets still get embedded (Layer 3) and counted (Layer 1) but skip AI assessment.

#### R-F2: Sprint 21 Preservation vs. Deprecation

**Source**: Claude Code review #7 · **Layer**: Keywords/annotations · **Effort**: Medium (~2–4 hours)
**Prerequisite**: Sprint R4 (keywords demoted to annotation role)

Sprint 21 added 56 operational keywords, admin overlay system, `getEffectiveKeywords()`. Under the new architecture:

- **Preserve**: Admin overlay data as annotation metadata, keyword dictionaries as research artifact
- **Simplify**: Date-filtering complexity → simpler "highlight for this administration?" logic
- **Deprecate**: `getEffectiveKeywords()` pipeline integration, `document-scorer.ts` scoring pathway

#### R-F3: Cross-Category Synchrony Detection

**Source**: ChatGPT red team analysis #4 · **Layer**: Convergence synthesis · **Effort**: Medium (~50–80 LOC)
**Prerequisite**: Convergence synthesis operational (Sprint R2+ ✅)

Count how many categories are simultaneously at Elevated or above per week. If N > threshold (e.g., 5 of 13), flag as cross-category synchrony event. UI element: dashboard-level indicator with historical sparkline. Already feeds the Administration Overview page's synchrony chart.

#### R-F4: Coverage Health Monitoring — **Elevated to Sprint R-S1**

**Source**: ChatGPT red team analysis #5, elevated per ChatGPT/Claude Code source expansion review · **Layer**: Infrastructure · **Effort**: Medium (~100–150 LOC + dashboard)
**Prerequisite**: None (independent). Complements existing Sprint 17 source health.

_Minimum viable scope ships in Sprint R-S1 Phase 1 (item 5):_ per-source-type document count per day, "source silent" alerts when a source goes silent for >2× expected cadence, DOJ taxonomy change tracking. Full operational dashboard with schema change detection and seasonal dip classification deferred to this R-F item.

#### R-F5: Pass 2 Mechanism Extraction Fields — **Elevated to Sprint R-S1**

**Source**: ChatGPT red team analysis #3, elevated per ChatGPT architecture review · **Layer**: 2 (Pass 2) · **Effort**: Small (prompt + schema change)
**Prerequisite**: Pass 2 operational (Sprint R3 ✅)

_Ships in Sprint R-S1 Phase 3:_ Add structured mechanism fields to Pass 2 output: `powerCreatedOrExpanded`, `oversightReduced`, `enforcementLeverChanged`, `dueProcessChanged`, `accessToSystemsChanged`. Prompt change to Pass 2's structured output schema — not infrastructure. Ships with source expansion so the enriched document corpus gets mechanism-tagged from the start. Without this, the most shareable output (AI narrative) can drift into persuasive prose without a mechanically checkable backbone.

#### R-F6: Semantic Escalation Within Functional Buckets

**Source**: ChatGPT red team analysis #2 · **Layer**: 3 · **Effort**: Medium–Large
**Prerequisite**: Layer 1 functional classifier + Layer 3 operational

Track embedding drift _within_ each functional bucket, not just at category level. Catches the most sophisticated evasion: keeping structure, function, and volume identical while changing substance within a functional category. Sub-cluster Layer 3's embeddings by functional bucket, compute per-bucket centroid distance.

#### R-F7: AI Model Challenge Set

**Source**: ChatGPT red team analysis #3 · **Layer**: 2 · **Effort**: Medium (initial) + Small (ongoing)
**Prerequisite**: Pass 1 + Pass 2 operational (Sprint R3 ✅)

~50–100 curated documents (routine governance, known erosion events, edge cases) as a fixed test suite. Run against Pass 1/Pass 2 on model updates or prompt revisions. Detect classification drift and regression before production deployment.

#### R-F8: Semantic Variance Decomposition

**Source**: ChatGPT final review · **Layer**: 3 · **Effort**: Medium (~80–120 LOC)
**Prerequisite**: Layer 3 operational with clustering (Sprint R2 ✅)

Decompose Layer 3 centroid drift into within-cluster variance (stylistic change) vs. between-cluster variance (substantive institutional change). Standard ANOVA on embedding vectors. A shift in the ratio is more specific than raw centroid distance. UI: "variance type: structural" vs. "variance type: stylistic" annotation on thematic drift panel.

#### R-F9: Event Retrospective Harness

**Source**: ChatGPT red team validation · **Layer**: All / validation · **Effort**: Large (~200–300 LOC)
**Prerequisite**: Full three-layer system operational (Sprint R3 ✅)

Run DOGE establishment, USAID closure, and IG firings through the complete pipeline retrospectively. Report per week: which layers fired, signal strength, top driver documents, detection ordering. Expected patterns: DOGE (Layer 2 first → Layer 1 corroborates), USAID (Layer 1 convergence gap or Layer 2 news), IG firings (Layer 2 first). Produces: public methodology chapter, calibration reference, credibility artifact for OSS release.

#### R-F10: UI Design Specification V4

**Source**: Architecture review process (2026-02-24) · **Layer**: All (UI) · **Effort**: Large (~2–3 days)
**Prerequisite**: Sprint R3 complete

UI Spec V3 was written against the old keyword-severity architecture. V4 rewrites all data-model-dependent sections while preserving architecture-independent decisions (visual language, reading level toggle, dark/light mode, responsive design, embed pattern). A divergence map (`UI_V3_DIVERGENCE_MAP.md`) documents every V3 section that needs updating. The Architecture Proposal's Dashboard Visualization section serves as the interim UI specification for Sprint R4.

#### R-F11: Pass 2 Infrastructure Theme Tagging

**Source**: Architecture design discussion (2026-02-24) · **Layer**: 2 (Pass 2) · **Effort**: Small (prompt + schema)
**Prerequisite**: Next baseline re-run (AI model version update)
**Trigger**: Add to Pass 2 schema _before_ next baseline re-run so theme tags ride the re-run at zero additional cost.

Add boolean fields to Pass 2 output: `detentionIncarceration`, `surveillanceApparatus`, `criminalizationOfOpposition`. Enables structured cross-category infrastructure convergence detection (replaces V3 keyword-based infrastructure convergence). Until then, Opus cross-category narrative synthesis provides interpretive coverage. Deferred because all four baselines already ran through Pass 2 — adding now would cost ~$28–60 for re-runs.

---

### Surviving Features (from original Sprint 23–29 plan)

#### Admin Auth + Review Queue (was Sprint 24)

- Admin auth, feedback store, review queue page, feedback fields
- Review queue now reviews Pass 2 assessments instead of keyword-based alerts
- See original Sprint 24 plan and V3 Addendum Sprint D

#### Suppression Learning + Proposals (was Sprint 26)

- Feedback learning pipeline using Pass 2 assessment patterns
- Admin proposal review for prompt adjustments and threshold changes
- See original Sprint 26 plan and V3 Addendum Sprint E

#### Onboarding + Responsive Polish + Performance (was Sprint 28)

- First-time visitor onboarding, mobile layouts, performance optimization
- See original Sprint 28 plan and UI spec section 4.5, 4.6, 10.2

#### Alternative Sources (was Sprint 29) — **Absorbed into Sprint R-S1**

- ~~CourtListener, State AG feeds, source priority framework~~ — Superseded by Sprint R-S1 source expansion, validated by availability spikes. P0: CourtListener + GovInfo/GAO + DOJ API + LegiScan. P1: IG RSS + FCC RSS + FEC. P2 (deferred): Oversight.gov + VRL + CBO. See `ARCHITECTURE_PROPOSAL.md` §Source Expansion and `SPIKE_FINDINGS.md` for validated source details.

---

### Added During Implementation

#### `document_scores` unique constraint mismatch (2026-03-01)

**Source**: GDELT re-cross-feed implementation · **Layer**: Schema · **Effort**: Medium (migration + recompute)

`document_scores` has a unique constraint on `url` alone, while `documents` uses `(url, category)`. This means cross-fed documents (same URL under multiple categories) share a single score row — whichever category is scored last overwrites the others. Consequences:

- `backfill:verify` can't detect unscored cross-fed documents (the LEFT JOIN on `url` always finds the original score row)
- Weekly aggregates may pull scores computed under a different category's rules
- `recompute-scores` upserts on `url`, so only one category "wins" per URL

**Fix**: Migrate `document_scores` unique constraint from `(url)` to `(url, category)`, update the upsert in `document-scorer.ts`, update the `getStageCompleteness` JOIN in `backfill-verification-service.ts` to match on both `url` and `category`, then run `pnpm recompute-scores` to populate per-category score rows.

#### CourtListener opinion ingestion (2026-03-03)

**Source**: Sprint R-CB1 content backfill analysis · **Layer**: Data pipeline · **Effort**: Large (new document type + fetcher + data model)

Current CL documents are RECAP docket entries (case filings). "Content" is NOS codes (~30 chars) even for the 160K that have it. ~23% of dockets have linked opinion clusters with full text (~149KB via `plain_text`). The correct fix is ingesting opinions as _new documents_ via the CL opinions search API (`type=o`) — separate rows, separate embeddings, separate AI assessments. Bolting opinion text onto docket entries conflates two document types.

**Scope**: New `opinion` document type, CL opinions search API integration (`/api/rest/v4/search/?type=o`), opinion-to-docket linking via metadata, new signals for `judicialIndependence` and `civilLiberties` categories. Implications for document counts, category baselines, and structural analyzers — needs its own sprint and spec. Docket entries remain valuable for Layer 1 (structural metadata: NOS codes, filing counts, court levels).

---

### Completed

- **Layer 2 P1 civilLiberties calibration** (Sprint R-CAL1): Erosion type framework added to P1 prompt, civilLiberties description tightened to threat-vector framing. P1 flag rate 73% → 3.1%, P2 confirmation 1.5% → 20.3%, audit FN 0.7%. 22 weeks backfilled. Architecture-consistent approach (no per-category prompt fields).

---

## Known Prerequisites for Future Sprints

| Issue | Blocker for                      | Description                                                                                                                                                                                                                              |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #28   | Sprint L (Search Infrastructure) | Normalize `source_type` values in documents table. Three specs disagree on semantics; actual DB has FR document types mixed with content classifications. Search Specification §4.1 filters by origin-based values that don't exist yet. |

---

## Parallel Track Opportunities

| While waiting for...                              | Can parallelize...                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Sprint R1 rhetoric cross-feed implementation      | Sprint R2 functional classifier code (pure functions, no data dependency) |
| Sprint R2 embedding backfill (~15 min)            | Sprint R2 structural anomaly scoring code (pure functions)                |
| Sprint R2 baseline structural distributions (SQL) | Sprint R2 Layer 3 semantic drift adaptation                               |
| Sprint R3 baseline AI runs (~$47–97, ~8–11 hours) | Sprint R4 dashboard component scaffolding                                 |
| Sprint R3 baseline AI runs                        | Sprint R3.2 snapshot source parity (~30–50 LOC, no data dependency)       |

---

## Archived Sprint Plans (Sprints 22–29)

The following sprint plans were replaced by the architecture redesign (Sprints R1–R5). Preserved for reference.

<details>
<summary>Click to expand archived plans</summary>

### Sprint 22: Signal Gap Remediation — Rhetoric Cross-Feed (absorbed into Sprint R1)

**Goal:** Route rhetoric documents through category keyword assessment with evidence source weighting and news-only status ceilings.

**Reference:** `SIGNAL_GAP_REMEDIATION.md` Phase 19.

1. Add `EvidenceSource` type and `EVIDENCE_WEIGHTS` to type definitions
2. Implement news-only status ceiling in assessment logic
3. Create `lib/services/rhetoric-topic-classifier.ts`
4. Modify backfill/snapshot pipeline to route rhetoric documents through category keyword matching
5. Re-process Trump 2025 rhetoric documents through category assessment
6. Review cycle: verify news-coverage-driven signals are genuine
7. Update UI to render `newsOnly` warnings distinctly

### Sprints 23–29 (restructured into R4 + Post-R5)

Original plans for: methodology pages, admin auth, detailed mode, suppression learning, novel threats, onboarding, alternative sources. The detection methodology changed fundamentally — keyword-severity scoring replaced by three-layer convergence. Dashboard visualization, admin review, and supporting pages all depend on the new architecture's output format. Core features preserved in Post-R5 section above.

</details>

---

## Cost Summary

### One-Time Setup (Sprints R1–R3)

| Task                                         | Cost        | Duration   |
| -------------------------------------------- | ----------- | ---------- |
| Sprint R1: Re-fetch with corrected queries   | $0          | ~2–4 hours |
| Sprint R2: Embed FR documents (~75K)         | ~$1.50      | ~15 min    |
| Sprint R2: Cluster labeling                  | ~$2–5       | ~30 min    |
| Sprint R3: Pass 1 on 4 baselines (~60K docs) | ~$6–12      | ~2–3 hours |
| Sprint R3: Pass 2 on flagged baseline docs   | ~$28–60     | ~3–5 hours |
| Sprint R3: Full system on Trump 2025         | ~$9–18      | ~2–3 hours |
| **Total setup**                              | **~$47–97** |            |

### Ongoing Costs

| Component            | Weekly        | Notes                          |
| -------------------- | ------------- | ------------------------------ |
| Layer 1 (Structural) | ~$0           | CPU computation                |
| Layer 2 Pass 1       | ~$0.10–0.30   | mini/Haiku on all docs         |
| Layer 2 Pass 2       | ~$0.50–3.00   | Sonnet/4o on flagged docs      |
| Layer 2 Audit        | ~$0.50–2.00   | 2–5% unflagged sample          |
| Layer 3 (Thematic)   | ~$0.02        | Embeddings + CPU               |
| Narrative Generation | ~$1–5         | Opus 4.6 Extended on Elevated+ |
| **Weekly total**     | **~$2.50–10** |                                |

### What Does NOT Require Re-Running

- Keyword additions/removals: $0 (annotations only)
- Convergence/structural threshold adjustments: $0 (change constants)
- Narrative prompt changes: $0 (future-only)
- Dashboard/UI changes: $0 (display-only)
