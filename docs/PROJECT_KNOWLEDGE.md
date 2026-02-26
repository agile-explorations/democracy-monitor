# Project Knowledge

Institutional knowledge for the Democracy Monitor project. Shared across all contributors.

For database connection details and ad-hoc query patterns, see your local `db-operations.md`.

## Architecture decisions

- **Three-layer triangulated detection** (2026-02-22): Replaces keyword-driven detection. Layer 1 = structural anomaly (deterministic, metadata-only), Layer 2 = AI two-pass assessment (every document), Layer 3 = thematic drift (embedding-based, intra-admin rolling window). Convergence synthesis: Stable / Elevated / Divergent / Confirmed Concern. Keywords become annotations only. Full design: `ARCHITECTURE_PROPOSAL.md`
- Sprint sequence: R1 (document corpus fixes) → R2 (Layer 1 + Layer 3) → R3 (Layer 2) → R4 (narrative + dashboard) → R5 (immigration + validation)
- Sprint 21 run work (keyword baseline regen) superseded — keywords are annotations, not detection gates
- Sprint 22 (rhetoric cross-feed) absorbed into Sprint R1
- Sprints 23-29 restructured as R4 + Post-R5
- "Data Coverage" is the correct label (not "Confidence") — metric measures volume/diversity, not judgment quality
- Demo mode API-interception layer removed — `pnpm demo:seed` writes fixtures to DB, app reads them through normal code paths

## Current state (as of 2026-02-26)

### Categories & baselines

- 13 categories (added elections, mediaFreedom, lawEnforcement, civilLiberties; expanded courts, military; `indices` renamed to `executiveActions`)
- 4 baselines: Biden 2022 (Year 2, primary), Biden 2021 (Year 1), Trump 2017 (Year 1), Trump 2018 (Year 2)
- Biden 2022 is primary baseline (replaced biden_2024); 58,713 docs, 8 alerts (3 iterations calibrated it down from 42)
- Biden 2022 exported as light fixtures (~29MB): assessments, baselines, document_scores, weekly_aggregates, intent_weekly + document manifest (raw docs gitignored)
- Cross-baseline validation: `pnpm seed:validate` — compares severity/volume ratios across Year 1 vs Year 2
- Obama 2013 dropped: FR-only source coverage would confound comparisons. All 4 baselines have uniform FR + GDELT + WH coverage.
- All 4 baselines now have AI assessment (gpt-4o-mini); previously keyword-only

### UI pages & APIs

- Landing page = overview page: convergence heatmap (13×16) + status timeline + synchrony chart + status summary + category cards grid
- Overview API: `/api/overview/summary` — convergence heatmap, status timeline, synchrony, status counts from weekly_aggregates
- Category detail page: `/category/[key]` — ConvergenceHeader, StructuralSignaturePanel, AIAssessmentPanel, ThematicDriftPanel, TrendChart, EvidencePanel
- Category API: `/api/category/[key]` returns latest assessment + baseline; `?weekOf=` param for historical; reuses `/api/history/weekly-scores` for chart data
- Week detail page: `/category/[key]/week/[date]` — summary cards, sparkline with highlight, keyword matches, DocumentTable with CSV export
- Narrative API: `/api/narratives/[category]` + `/api/narratives/overview`. On-demand generation if stored narrative missing. `_overview` pseudo-category key for overview narratives
- Health API: `/api/health/meta` (MetaAssessment), `/api/health/sources` (sources + summary); both DB-optional

### UI patterns

- Shared chart colors: `lib/data/chart-colors.ts` — CHART_COLORS, CATEGORY_COLORS, CONVERGENCE_STATUS_COLORS
- Design tokens: indigo-scale, CategoryCard/Sparkline/StatusPill components, /api/categories/summary endpoint
- Dark mode: ThemeContext with `prefers-color-scheme` listener, `localStorage('dm_theme')`, `.dark` class on `<html>`
- Reading level: ReadingLevelContext with `'summary' | 'detailed'`, `localStorage('dm_reading_level')`
- CSS vars in styles/globals.css: `:root` (light) + `.dark` (dark mode), Tailwind tokens reference `var(--color-*)`
- Props-driven UI pattern: components receive all data via props (UI Spec §14), no internal fetching
- Progressive disclosure tabs: Why? | Evidence | Deep Analysis (no Status tab)
- TrendChart: recharts ComposedChart with baseline ±1σ band (Area), score line (Line), avg reference (ReferenceLine), CycleAnnotation. Click-to-navigate uses `ComposedChart.onClick` → `state.activeLabel`
- AiReviewerNotes: constraint label ("AI can confirm or lower, not raise"), summary/detailed modes, keyword verdicts
- EvidencePanel: keyword triggers with tier grouping (capture/drift/warning), reviewed documents, suppressed keywords (Detailed only). `annotationMode` for convergence framing

### Assessment pipeline

- `getEffectiveKeywords(category, tier, documentDate?)` — merges core + admin overlay keywords, date-filtered
- `AdminKeywordOverlay` — date-bounded keyword sets in `lib/data/admin-specific-keywords.ts`
- Admin overlay returns core-only when no date provided (safe for baselines)
- Signal tightening: fiscal (budget→executive overreach terms), elections (voter→suppression terms), rulemaking (narrowed)
- Volume thresholds raised: drift 3→5, capture 2→3; keyword hallucination filter added to AI assessment
- `cycle_adjustment_factors` table: stores Year 1 vs Year 2 severity/volume/stddev ratios per category
- `getCurrentCycleYear()` in scoring-config.ts: UTC-safe, returns 1-4 based on Jan 20 term anniversaries
- Cycle factors thread through assessment pipeline: `analyzeContent(items, category, cycleFactors?)` → `assessByVolume` multiplies volume thresholds

### Layer 2 AI assessment

- `ai_document_assessments` table, `aiScore`/`aiDetail` on `weekly_aggregates`, `runLayer2Assessment()` in orchestrator, `pnpm layer2:backfill` CLI
- Pass 1 = gpt-4o-mini (OpenAI), Pass 2 = claude-sonnet-4-5-20250929 (Anthropic) — different providers for epistemic independence
- Thresholds in scoring-config: `AI_FLAG_RATE_THRESHOLD = 1.5` (z-score), `AI_CONCERN_THRESHOLD = 0.2` (20% concern rate), `AUDIT_SAMPLE_RATE = 0.03`
- ConvergenceStatus: Stable / Elevated / Divergent / ConfirmedConcern (R3 added ConfirmedConcern — requires 2+ layers elevated AND high AI concern rate)
- Source convergence: 6th structural dimension, log2((gov+1)/(rhetoric+1)), weight 0.13 in STRUCTURAL_DIMENSION_WEIGHTS
- All 4 Layer 2 baselines complete (2026-02-24): flag rates 0.34-0.64%, Pass 2 non-concerning 98.4-99.9%, audit FN rate 0.07%
- Structural dampening: `DAMPENING_THRESHOLD` and `JSD_Z_SCORE_CAP` in scoring-config.ts — exponential decay for mild z-scores, cap on JSD outliers

### Source health & coverage

- Source health monitoring: `source_health` table, 31 signals with stable IDs, 6 canary sources, SourceHealthCheck classification (healthy/degraded/unavailable/silent)
- Meta-assessment: 4 integrity levels (high/moderate/low/critical) from `INTEGRITY_THRESHOLDS` in scoring-config; canary downgrade from high→moderate when ≥50% canaries critical
- Confidence degradation: `sourceAvailability` factor (weight 0.15) in `DATA_COVERAGE_WEIGHTS`; `CRITICAL_CONFIDENCE_CAP = 0.3` hard cap
- `fetchCategoryFeedsWithMetadata()` wraps feed fetcher with per-signal success/failure, doc count, timing
- Landing page: DataIntegrityBanner (4 levels, hidden at high) + SourceHealthBar (dots per signal)
- Coverage health: `lib/services/coverage-health.ts`, `getSourceCoverage()` SQL, `detectSilenceAlerts()` pure filter, `SOURCE_EXPECTED_CADENCE_DAYS` + `SILENCE_ALERT_MULTIPLIER` in scoring-config

### Source fetchers

- Fetcher module pattern: `parseParams()` + `toContentItem()` (pure, tested) + `fetchRecent()` + `fetchHistorical()` (I/O, excluded from coverage). All 4 source fetchers follow this.
- CourtListener fetcher: `lib/services/courtlistener-fetcher.ts`, REST API v4, `COURTLISTENER_API_TOKEN` env var, 750ms rate limit, pseudo-URL `courtlistener://recap?nos=440`
- DOJ fetcher: `lib/services/doj-fetcher.ts`, `https://www.justice.gov/api/v1/press_releases.json`, open API, pseudo-URL `doj://press?component=criminal-division`
- DOJ frozen taxonomy: `lib/data/doj-taxonomy.ts`, 15 `DojInternalBucket` values, `classifyDojRelease()` first-match-wins, `DOJ_BUCKET_TO_CATEGORIES` maps to DM categories
- GovInfo fetcher: `lib/services/govinfo-fetcher.ts`, REST API, `GOVINFO_API_KEY` env var, pseudo-URL `govinfo://collection?collection=GAOREPORTS`. 3 collection types: GAO_REPORTS, CRPT, PLAW.
- FEC fetcher: `lib/services/fec-fetcher.ts`, OpenFEC API, `FEC_API_KEY` env var (optional), pseudo-URL `fec://advisory-opinions?type=advisory_opinions`. Advisory opinions + MURs.
- Multi-source backfill: `lib/cron/backfill-fetchers.ts` has `fetchWeekItemsFr()`, `fetchWeekItemsCourtListener()`, `fetchWeekItemsDoj()`. backfill.ts groups signals by type.

### Narrative generation

- `lib/services/narrative-generation-service.ts` (Opus 4.6), `narrative-store.ts` (DB), `narrative-pipeline.ts` (orchestration)
- Dual audience: expert (400-800 words, technical) + public (200-500 words, plain language). Stable → template, Elevated+ → AI.
- `narratives` table: category, weekOf, version ('expert'|'public'), content, model, generatedAt. Unique on (category, weekOf, version).

### Rhetoric & crossfeed

- `rhetoric-crossfeed.ts`: `classifyRhetoricToCategories(title, summary?)` routes rhetoric docs to 13 categories using FR signal search terms; `SUPPLEMENTAL_TERMS` for executiveActions + lawEnforcement (type-based signals have no search terms); module-level cache
- `crossfeedRhetoricToCategories(items)` in rhetoric-crossfeed.ts — classifies rhetoric items by FR signal terms, stores under matched categories. Called in snapshot, backfill, and backfill-rhetoric pipelines.
- `lib/data/category-topics.ts` — PolicyArea→categories many-to-many mapping (bridges 5 rhetoric areas to 13 assessment categories)
- `classifyPolicyAreaWithScore()` exported from intent-data-service.ts — returns {area, score}; score=0 means unclassifiable
- Trump WH archive scraper: `trumpwhitehouse.archives.gov` WordPress parser in rhetoric-fetcher.ts (WhArchiveConfig in baselines.ts)

### Modules & patterns

- `buildMetadata(item)` in document-store.ts: pure function returning `{agency?, action?, subtype?}` or null; replaces inline `{agency}` construction
- Extracted services: convergence-service, proxy-parser, tracker-service, intent-orchestrator
- Cron scripts: loadEnvConfig moved to CLI entry blocks for testability; process.exit→throw in exported functions
- Shared utils: lib/utils/async.ts (sleep), lib/utils/collections.ts (deduplicateByUrl), lib/types/category-card.ts (AutoStatus, EnhancedData)
- AIProvider.complete() signature: (prompt: string, options?: AICompletionOptions) → result.content (not result.text)
- ESLint max-lines (300) + max-lines-per-function (50) enforced; data/schema/test/demo/seed/hooks/component files exempt

### Testing & coverage

- 1454 tests across 117 test files
- Coverage thresholds: statements 71.22%, branches 68.33%, functions 74.02%, lines 71.6%. I/O-heavy fetcher files excluded from coverage (courtlistener, doj, fec, govinfo fetchers — pure functions tested, fetch/pagination not unit-testable). `autoUpdate: true` only ratchets UP thresholds.
- `pnpm test:coverage` in `.husky/pre-push` — catches coverage threshold regressions before push

### Infrastructure

- `docs/internal/`: 16 internal spec/research docs (gitignored, kept on disk). Includes ROADMAP, V3 specs, spike findings, signal gap analysis, etc.
- DEPLOYMENT.md: deploy guide (Render.com), 3-tier data strategy (git fixtures / GitHub Release pg_dump / Render PostgreSQL), disaster recovery, cron schedule
- render.yaml build command: `pnpm install && pnpm db:migrate && pnpm build` (auto-migrates on deploy)
- Cron schedule: daily-snapshot 06:00 UTC, daily-digest 07:00 UTC (staggered), weekly-clustering Sun 03:00 UTC, hourly-uptime every hour

## Database gotchas

- `ai_document_assessments` Pass 1 uses `relevant` (boolean) for flags, Pass 2 uses `assessment` (varchar) for classification. Pass 1 `assessment` column is always NULL.
- `source_type` in documents table is inconsistent (#28): FR docs have doc types (`Notice`, `Rule`), WH/GDELT have `'rhetoric'`. **Partially resolved** by `source_origin` column (Sprint R-S1a) — tracks data provenance separately from document type.
- `source_origin` column on documents table: tracks data provenance (federal_register, whitehouse, gdelt, courtlistener, doj, etc.). `SourceOrigin` type in `lib/types/categories.ts`. `inferSourceOrigin()` in document-store.ts for backward compat.
- `documents` table unique constraint: `(url, category)` composite (not `url` alone) — allows same URL under multiple categories for rhetoric cross-feed
- Weekly aggregator date mismatch fixed: range query (gte/lt 7-day window) replaces exact eq() match — document_scores use Monday-based weeks, weekly_aggregates used config-start-date-based weeks
- `document_scores.document_id` NULL: fixed via post-store `resolveDocumentIds()` UPDATE joining on URL

## Adding new categories

Requires updating:

1. `lib/data/categories.ts` — category + signal definitions
2. `lib/data/assessment-rules.ts` — keyword dictionaries
3. `lib/data/category-maturity.ts` — maturity level
4. `lib/services/rhetoric-crossfeed.ts` — `SUPPLEMENTAL_TERMS` if no FR term-based signals
5. Hardcoded category counts in tests

## Signal gap findings (resolved in Sprint 20)

- FR API boolean search: pipe `|` for OR, space for AND, `""` for phrases. All 18 affected queries fixed.
- GDELT DOC 2.0 API: `sourcecountry:US` filter added to all 5 queries. 3-month rolling window means old data can't be re-fetched.
- `oversightGovDown` dead config removed; oversight.gov signal name restored
- FR `subtype` now threaded through ContentItem → document-classifier for presidential document classification
- `docs/internal/SIGNAL_GAP_REMEDIATION.md` = peer spec for Sprints 20-22 (erosion types A/B/C framework)

## Key Sprint 13-14 additions

- AI Skeptic prompt now asks for `suggestedAction` (keep/remove/move*to*\*) and `suppressionContext` per keyword
- `extractAiFeedback(alert)` → ReviewFeedback from AI verdicts (pure function in interactive-review.ts)
- `pnpm seed:review --aggregate` → post-session aggregate report (aggregate-feedback.ts)
- `pnpm seed:apply [--dry-run]` → writes keyword changes to assessment-rules.ts (apply-decisions.ts)
- apply-decisions.ts supports 3 actions: remove, move, add (add requires explicit category)
- Regression fixtures: known-true-positives.ts, known-false-positives.ts (initially empty)

## Project management

- GitHub Issues + Milestones for tracking (not Jira/Linear)
- Milestones = sprints (one per sprint, close when shipped)
- Issues = individual work items within a sprint
- `docs/internal/ROADMAP.md` = strategic plan (forward-looking; completed sprints get "Actual:" annotations)
- DECISIONS.md = sprint retrospectives (planned vs built, spec deviations, key decisions, lessons learned) — **read before every sprint**
- Spec documents in `docs/internal/` (gitignored, local-only) = requirements (V3 Addendum, UI Design Spec) — specs are NOT updated inline; deviations tracked in DECISIONS.md
- `ASSESSMENT_METHODOLOGY.md` = public-facing methodology doc (3-layer detection, convergence, data sources, limitations)
- Labels: stream:{data-pipeline,backend,ui,infra}, type:{feature,bug,research,review-gate}, priority:{p0,p1,p2}

## Sprint log

- Sprint 1: Core dashboard, categories, signals, proxy, keyword assessment
- Sprint 2: AI skeptic review, evidence balance, progressive disclosure, snapshot store
- Sprint 3: Document scoring, suppression rules, weekly aggregation, backfill
- Sprint 4: History page, trajectory chart, infrastructure overlay, rhetoric fetcher
- Sprint 5: OSS launch prep, transparency layer, export, methodology docs
- Sprint 6: Rhetoric lag analysis, P2025 pipeline, intent weekly, expanded keywords
- Sprint 7: Dual summaries, legislative tracking, validation indices, keyword expansion
- Sprint 8: Code review + refactoring + test coverage (DRY, file/function length, shared utils)
- Sprint 9a: DRY + naming — API helpers, cache config, date/math/AI utils, named constants
- Sprint 9b: Function length refactoring (34 functions → ≤50 lines) + 8 pure-function test files (102 tests)
- Sprint 9c: Extract business logic from 4 API routes → service modules + unblock cron testing + 5 new test files (41 tests)
- Sprint 10: Test coverage for untested pure functions (trend-anomaly, validation-index, p2025-matcher, document-scorer, rate-limit)
- Sprint 11: Seed data framework (export/import), AI Skeptic + --model/--skip-ai in backfill/baseline, WH+GDELT in baseline, shared assess-week module, 3 test files (20 tests)
- Sprint 12: AI Skeptic review report + decisions template (`pnpm seed:review`), Zod schemas for decisions JSON, 2 test files (21 tests)
- Sprint 12.1: Review flow alignment + baseline coverage — DB-centric review, interactive CLI, FR signals for igs/infoAvailability, reviewedDocuments field, 3 test files (rewritten + new)
- Sprint 13: AI Skeptic structured feedback (suggestedAction, suppressionContext), extractAiFeedback(), aggregate report, apply-decisions.ts, 3 test files (63 new tests, 772 total)
- Sprint 14: Biden 2022 baseline calibration — 3 iterations (42→8 alerts), signal tightening (fiscal/elections/rulemaking), volume threshold tuning, keyword hallucination filter, light fixture export with document manifest, coverage tests (16 new, 799 total)
- Sprint 14.1: Rhetoric gap analysis + refinement cycle — PolicyArea→category mapping, bigram gap analysis (412 gaps, 6 categories), human review: zero additions (dictionaries well-calibrated), pre-push coverage hook, 1 test file (9 tests, 808 total)
- Sprint 15: First-year-in-term baselines (Biden 2021, Trump 2017, Trump 2018) + cross-baseline validation + weekly aggregator date-mismatch fix, 1 test file (48 new tests, 856 total)
- Sprint 15.1: Cycle-aware baselines — AI re-runs (all 4, gpt-4o-mini), cycle_adjustment_factors table, getCurrentCycleYear(), cycle-adjustment-service, volume threshold integration, 1 test file (26 tests, 882 total)
- Sprint 16: UI design system + landing page — indigo-scale tokens, dark mode + reading level contexts, Sparkline/StatusPill/CategoryCard, /api/categories/summary endpoint, 4 test files (38 new tests, 920 total)
- Sprint 17: Source health backend + landing banners — signal IDs (31), canary sources (6), SourceHealthCheck, meta-assessment, confidence degradation (sourceAvailability 0.15), feed fetcher metadata, source_health table, health API endpoints, DataIntegrityBanner + SourceHealthBar, 5 test files (55 new tests, 975 total)
- Sprint 18: Category detail page + trend chart — /api/category/[key], /category/[key].tsx, TrendChart (ComposedChart + baseline ±1σ + cycle annotation), AssessmentSummary, EvidencePanel (tier grouping + suppressed), AiReviewerNotes (constraint label), 5 test files (24 new tests, 999 total)
- Sprint 19: Week detail page + document table + export — click-to-navigate TrendChart, week detail page, summary cards, DocumentTable with CSV export, keyword matches section, methodology JSON endpoint, 3 test files (22 new tests, 1021 total)
- Sprint 20: Signal gap remediation (R1) — 18 FR queries AND→OR fix, 5 GDELT sourcecountry:US, 7 PRESDOCU signals, FR subtype→DocumentClass, InsufficientData "No Data" badge, document_id NULL resolution, oversightGovDown cleanup, 8 new tests (1027 total)
- Sprint 21: Keyword expansion + admin overlay (code work) — 56 operational keywords (5 categories), admin-specific-keywords.ts overlay with date-filtered merge, 4 new FR signals, 4 suppression rules, getEffectiveKeywords() pipeline integration, 17 new tests (1044 total). Run work superseded by architecture redesign.
- Sprint R1: Document corpus fixes — getEffectiveKeywords() bug fix in document-scorer + trend-anomaly-service, FR action/subtype in metadata JSONB via buildMetadata(), rhetoric cross-feed classifier (reuses FR signal URLs), 51 new tests (1095 total)
- Sprint R2: Layer 1 (structural anomaly) + Layer 3 (thematic drift) + convergence synthesis — functional classifier (9 buckets, 4 tiers), structural scoring (5 dimensions, JSD + z-score), rolling thematic drift (8-week intra-admin), convergence synthesis (Stable/Elevated/Divergent), pipeline integration (6 new weekly_aggregates columns), 79 new tests (1174 total). Run work deferred.
- Sprint R3: Layer 2 (AI two-pass assessment) + source convergence + reproducibility — Pass 1 (gpt-4o-mini) + Pass 2 (Claude Sonnet 4.5) with epistemic independence, ConfirmedConcern status, source convergence (6th structural dimension), reproducibility audit script, backfill CLI, 47 new tests (1221 total). Run work (~$47-97) deferred.
- Sprint R3.1: Deployment strategy + data management — render.yaml fixes (db:migrate in build, cron stagger, digest API key), DEPLOYMENT.md, CONTRIBUTING.md data setup tiers, README.md architecture refresh, ai_document_assessments in seed pipeline. Infra/docs only.
- Sprint R3-RUN: Threshold calibration + Layer 2 backfill + layer score recomputation — structural dampening (exponential decay, JSD cap), T2 backfill (14,480 docs, 221 flagged), recompute 2,896 category-weeks, logo/favicon, seed fixture export (78,576 AI assessments). Baseline L2 deferred (no rhetoric cross-feed). 36 new tests (1240 total).
- Sprint R3.2: Snapshot source parity (WI-15) — documents(url,category) composite unique, crossfeedRhetoricToCategories() helper, wired into snapshot+backfill+backfill-rhetoric. 5 new tests (1245 total).
- Sprint R3.3: Category renames — `courts` → `judicialIndependence`, `igs` → `executiveOversight` across DB (11 tables) + codebase (48 files). scripts/rename-categories.ts for DB migration. R4 sub-sprint breakdown added to ROADMAP.md. 1240 tests (unchanged count).
- Sprint R4b: Administration overview page — replaced landing page with cross-category overview: convergence heatmap (11×16), status timeline, synchrony chart, status summary. overview-service.ts + /api/overview/summary endpoint. Shared chart-colors.ts extracted. TrajectoryChart `indices` bug fix. R4a deferred (narratives need source expansion). 28 new tests (1273 total).
- Sprint R4c: Category detail redesign + keyword demotion + methodology rewrite — ConvergenceHeader, StructuralSignaturePanel, AIAssessmentPanel, ThematicDriftPanel on category detail + week detail pages. CategoryCard convergence indicator. EvidencePanel annotationMode, AiReviewerNotes legacy framing. Click-to-navigate on overview heatmap/timeline. Methodology page rewrite (9 sections). /api/category/[key] ?weekOf= param. 32 new tests (1305 total).
- Sprint R-S1a: Foundation + CourtListener + DOJ integration — source_origin column + migration, CourtListener REST API v4 fetcher, DOJ Press Release JSON fetcher, DOJ frozen taxonomy (15 internal buckets), 2 new categories (lawEnforcement, civilLiberties — 13 total), coverage health monitoring, multi-source backfill pipeline, source-origin backfill (132,260 rows). 61 new tests (1366 total).
- Sprint R-S1b: GovInfo/GAO + FEC + IG RSS + FCC RSS source integrations — govinfo-fetcher.ts (GAO Reports, Congressional Reports, Public Laws), fec-fetcher.ts (Advisory Opinions, MURs), 8 new signals across 4 categories, backfill pipeline extensions, functional classifier extensions. IG + FCC as standard RSS signals (no custom fetcher). 36 new tests (1405 total).
- Sprint R4a: AI narrative generation service — narratives table + migration, narrative-generation-service.ts (dual-audience prompts, Opus 4.6), narrative-store.ts, narrative-pipeline.ts, /api/narratives/[category] + /api/narratives/overview endpoints, snapshot pipeline integration. Stable → template, Elevated+ → AI generation. 51 new tests (1411 total).
- Sprints remaining: R-S1 Phase 2-4 (historical backfill + per-source baselines + validation), LegiScan (pending subscription), R5 = cross-architecture validation + launch prep. See `docs/internal/ROADMAP.md`.
