# Democracy Monitor — Roadmap

This document describes the planned sprint sequence for completing the Democracy Monitor system. It bridges the specification documents (which describe _what_ the system does) and GitHub Issues (which track _who is doing what right now_).

**Specification documents:**

- `ARCHITECTURE_PROPOSAL.md` — **Primary spec for Sprints R1–R5.** Three-layer triangulated detection: structural anomaly (Layer 1), AI two-pass assessment (Layer 2), thematic drift (Layer 3). Convergence synthesis replaces keyword-severity scoring. Keywords become annotations only.
- `SYSTEM SPECIFICATION V3 ADDENDUM.md` — Backend features: source health, feedback learning, novel threat detection, expert contributions, cycle-aware baselines (Sprints A-J, Phase 15). Partially superseded by architecture proposal — source health (Sprint 17) and cycle-aware baselines (Sprint 15.1) remain; feedback learning and novel threat detection restructured under Layers 2 and 3.
- `UI DESIGN SPECIFICATION V3.md` — UI redesign: information architecture, visual language, component design, admin interface (Phases 1-5). Dashboard visualization restructured around three-layer display in Sprint R4.
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

### Sprint R3: Layer 2 (AI Two-Pass Assessment)

**Goal:** Implement AI-based assessment that runs on every document, independently of keywords and structural signals. Establish baseline AI flag rates.

**Depends on:** Sprint R2 (Layers 1 and 3 operational — convergence synthesis needs all three layers)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Layer 2

**Code work (~300–400 lines new):**

1. **Pass 1 — Signal Finder** — Structured prompt, gpt-4o-mini/Haiku, runs on every document. Returns `{relevant, confidence, signals, erosionType}`. Temperature 0, no keyword references in prompt. (~100 LOC)
2. **Pass 2 — Skeptical Analyst** — Structured prompt, Claude Sonnet/gpt-4o, runs only on Pass 1 flags + 2–5% audit sample. Different model than Pass 1 for epistemic independence. Returns `{assessment, confidence, reasoning, comparativeContext, citedPassages, erosionType, counterArguments}`. (~100 LOC)
3. **Pass 1 False-Negative Audit** — Weekly 2–5% sample of unflagged docs through Pass 2. Track `pass1_false_negative_estimate` per week.
4. **Baseline AI flag rates** — Run Pass 1 against all 4 baselines (~60K docs, ~$6–12). Record flag rate per category per week.
5. **Pass 2 baseline assessments** — Run on flagged baseline docs (~3K–6K docs, ~$28–60). Establish baseline concern rate.
6. **Update convergence synthesis** — Add Layer 2 signals (flag rate z-score, concern rate) to status determination.
7. **Source convergence dimension (deferred from R2)** — 6th structural dimension: ratio of FR/PRESDOCU to GDELT to WH per category. Requires per-category rhetoric volume aggregation. Wire into `computeStructuralScore()` and update baseline distributions.
8. **AI reproducibility strategy** — Pin model versions, record in assessments, structured output enforcement.
9. **Full three-layer validation** — Run complete system against Trump 2025 data.

**Implementation note:** Pass 2 is greenfield code, NOT an adaptation of existing AI Skeptic. The current AI Skeptic was designed to "confirm or lower" keyword assessments. Pass 2 independently assesses documents that Pass 1 flagged, with no reference to keyword results. The existing `enhancedAssessment()` function, prompts, and output schema do not carry over.

**Run work (~$47–97 total for baseline regeneration):**

- Pass 1 on 4 baselines (~$6–12)
- Pass 2 on flagged baseline docs (~$28–60)
- Full system on Trump 2025 (~$9–18)

**Validation:**

- Does the system detect DOGE, USAID closure, IG firings, court order defiance?
- Compare three-layer results vs. current keyword-based results — document what new system catches that old missed, and vice versa

**Tests:**

- Unit: Pass 1 structured output parsing
- Unit: Pass 2 structured output parsing
- Unit: flag rate z-score computation
- Unit: false-negative audit sampling logic
- Integration: full convergence synthesis with all 3 layers

---

### Sprint R4: Narrative Generation + Dashboard Redesign

**Goal:** AI-generated weekly narratives for elevated categories + dashboard visualization for three-layer architecture. Keywords demoted to annotation role.

**Depends on:** Sprint R3 (all three layers operational + validated)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §AI Narrative Generation, §Dashboard Visualization, §Role of Keywords

**Code work (~400–500 lines new/modified):**

1. **Narrative generation** — Opus 4.6 Extended Thinking for Elevated+ categories. Expert version (~800–1500 words) + public version (~300–500 words). Input: all 3 layer outputs + driving documents + labeled cluster shifts.
2. **Dashboard redesign — category card** — Status pill (Stable/Elevated/Divergent/Confirmed Concern/No Data), convergence indicator (3 dots for layer status), sparkline (composite structural deviation), brief summary.
3. **Category detail — three-panel visualization**:
   - Panel 1: Structural signature (volume + type composition + functional distribution + source convergence)
   - Panel 2: AI assessment distribution (stacked bar per week: routine/novel/concerning/clearly concerning)
   - Panel 3: Thematic drift (rolling centroid distance + cluster annotations)
4. **Convergence matrix** — 3-column indicator showing Layer 1/2/3 status + pattern label.
5. **Keywords → annotation role** — Remove keywords from status determination. Keep for UI display (highlighted terms in evidence panel). Update EvidencePanel to show Pass 1/Pass 2 results alongside keyword annotations.
6. **Methodology page** — Updated for three-layer architecture. Detection scope statement.
7. **Reading level toggle** — Expert vs. public narrative versions.
8. **Playwright e2e tests** — Core user journeys through new dashboard.

**Run work (~$1–5/week ongoing for narrative generation):**

- Opus 4.6 Extended on ~1–3 elevated categories per week

---

### Sprint R5: Immigration Category + Cross-Architecture Validation

**Goal:** Add immigration category using the new architecture. Validate by running both old and new systems in parallel.

**Depends on:** Sprint R4 (dashboard shows three-layer results)

**Reference:** `ARCHITECTURE_PROPOSAL.md` §Sprint R5

**Code work (~200 lines new):**

1. **Immigration category** — Define signal queries for `categories.ts`, compute baselines across all 4 baseline periods, calibrate Layer 1 thresholds.
2. **Cross-architecture validation** — Run both old (keyword) and new (three-layer) systems in parallel for 4 weeks.
3. **Publish comparison report** — Document detection differences between architectures.
4. **Decommission keyword-based status determination** — After validation period confirms three-layer system catches everything keywords caught plus more.
5. **Methodology documentation** — Updated public methodology docs for three-layer architecture.

---

## Post-R5: Remaining Features

These items from the original Sprint 23–29 plan survive but are restructured for the three-layer architecture. They can be scheduled after the architecture is validated and operational.

### Admin Auth + Review Queue (was Sprint 24)

- Admin auth, feedback store, review queue page, feedback fields
- Review queue now reviews Pass 2 assessments instead of keyword-based alerts
- See original Sprint 24 plan and V3 Addendum Sprint D

### Suppression Learning + Proposals (was Sprint 26)

- Feedback learning pipeline using Pass 2 assessment patterns
- Admin proposal review for prompt adjustments and threshold changes
- See original Sprint 26 plan and V3 Addendum Sprint E

### Onboarding + Responsive Polish + Performance (was Sprint 28)

- First-time visitor onboarding, mobile layouts, performance optimization
- See original Sprint 28 plan and UI spec section 4.5, 4.6, 10.2

### Alternative Sources (was Sprint 29)

- CourtListener, State AG feeds, source priority framework
- See original Sprint 29 plan and V3 Addendum Sprints I, J

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
