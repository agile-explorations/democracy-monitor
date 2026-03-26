# Project Knowledge

Institutional knowledge for the Democracy Monitor project. Shared across all contributors.

For database connection details and ad-hoc query patterns, see your local `db-operations.md`.

## Architecture decisions

- **AI-review-driven detection architecture** (2026-03-22): AI document review (two-pass: P1 screening, P2 detailed review) is the sole active detection mechanism driving concern status via absolute P2 thresholds. Structural anomaly, silence detection, and thematic drift provide descriptive context only. Concern levels: Stable / Elevated / ConfirmedConcern (Divergent retained in type for legacy DB records but no longer produced). Keywords are annotations only. Full design: `ARCHITECTURE.md`
- Sprint sequence: R1 (document corpus fixes) → R2 (structural + thematic) → R3 (AI document review) → R4 (narrative + dashboard) → R5 (immigration + validation)
- Sprint 21 run work (keyword baseline regen) superseded — keywords are annotations, not detection gates
- Sprint 22 (rhetoric cross-feed) absorbed into Sprint R1
- Sprints 23-29 restructured as R4 + Post-R5
- "Data Coverage" is the correct label (not "Confidence") — metric measures volume/diversity, not judgment quality
- Demo mode API-interception layer removed — `pnpm demo:seed` writes fixtures to DB, app reads them through normal code paths

## Standing constraints

Cross-sprint constraints that apply to all future work. Not tied to any single sprint — these are project-level invariants.

### Data sources

- **No RSS feeds or website scraping.** Agency websites (DHS, OPM, DOD, State, Treasury, etc.) are behind WAFs that block automated access. All data sources must be structured government APIs (GovInfo, Federal Register, CourtListener, FEC, LegiScan, DOJ API). Do not propose RSS feeds, web scraping, or direct website access as solutions to data gaps.
- **White House content comes from CPD (GovInfo), not the WH website.** The WH scraper was removed in Sprint R-CPD2. Historical WH data remains in the DB.
- **GDELT is metadata-only.** News/media documents are not ingested. The project uses government documents exclusively for detection.

### Production access

- **Query production DB via `source .env.prod.local && export DATABASE_URL`** in shell commands. Production requires SSL (`ssl: { rejectUnauthorized: false }`). Never read `.env.prod.local` with Read/Grep/Glob tools — only source it in Bash commands.

### Content storage

- **Store full documents with no content caps.** (R-CONTENT, 2026-03-25) All fetchers store complete document text. Truncation for AI assessment happens at assessment time via boilerplate strippers and window slicing, not at storage time. This gives maximum flexibility for future reprocessing without refetching.

### Sprint process

- **Start with production diagnostics before proposing fixes.** (R-CONTENT lesson) Query production data, sample documents, classify root causes with evidence before designing solutions. The diagnostic step prevents wasted sprints optimizing the wrong layer. Add as step 0 before Analysis in the sprint process.

## Sprint tracking

Sprints are tracked via GitHub Milestones (one per sprint) and Issues (one per work item).
The sprint arc is the single source of truth for "what's next." All work goes through the sprint process in CLAUDE.md.
For full retrospectives, see `DECISIONS.md` (recent) and `DECISIONS-ARCHIVE.md` (older).

### Sprint arc

| Sprint          | Release | Goal                                                                                                                          | Status  |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| R-CALIBRATE     | R1      | P1 calibration — reduce NC failures (4/6 → 0/6) without losing 39/39 detection                                                | Planned |
| R-CONTENT       | R1      | Ingest content quality — remove caps, boilerplate strippers, P1/P2 8K windows, routing expansion                              | Done    |
| R-LEGISCAN-TEXT | R1      | Congress.gov API for LegiScan bill text (parallel, non-blocking)                                                              | Planned |
| R-GAP-BACKFILL  | R1      | Gap year backfill — Trump 2019-2020 (impeachment, COVID, Schedule F v1, Jan 6), then Biden 2023-2024                          | Planned |
| R-DATA-PAGE     | R1      | Data page (`/data`) — CSV export, GitHub dump link, top-level nav                                                             | Planned |
| R-API           | R1      | Public REST API — documents, aggregates, search. Rate-limited, filterable. Foundation for R4/R6                               | Planned |
| R-REVIEW-QUEUE  | R1      | Admin review queue for human review of AI assessments                                                                         | Planned |
| R-BOP-A         | R1      | Balance of Powers Phase A — inter-branch check classification, "Checks Activated" panel                                       | Planned |
| R-INFRA         | R2      | Authoritarian infrastructure — USAJobs hiring, SAM.gov surveillance, FOIA degradation, 287(g) networks, detention integration | Planned |
| R-RHETORIC      | R3      | Rhetoric vs. action — Truth Social, APP transcripts, rhetoric routing, gamified expert matching, ring analysis                | Planned |
| R-BOP-B         | R4      | Balance of Powers viz + Democracy Index Evidence Mapping (V-Dem, Freedom House) — deferred pending Phase A data               | Planned |
| R-P2025         | R5      | Project 2025 — import from trackers, documentary evidence linking, EXCEEDS detection (build small, build last)                | Planned |
| R-STATES        | R6      | State-level research corpus — LegiScan state bills, CourtListener state courts, governor EO scrapers (AI self-healing)        | Planned |

### Sprint log

| Sprint      | Dates   | Milestone                                                                   | Summary                                                                                |
| ----------- | ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| R-SIG       | 2026-03 | [M67](https://github.com/agile-explorations/democracy-monitor/milestone/67) | FR signal contamination fix — 16 signals scoped with agency restrictions               |
| R-NAR       | 2026-03 | [M69](https://github.com/agile-explorations/democracy-monitor/milestone/69) | Narrative quality — pre-computed summaries, event-driven content, doc links            |
| R-NOISE     | 2026-03 | [M70](https://github.com/agile-explorations/democracy-monitor/milestone/70) | CREC amendment + LegiScan broad-term noise reduction                                   |
| R-CRON      | 2026-03 | [M71](https://github.com/agile-explorations/democracy-monitor/milestone/71) | Cron job resilience — cron_runs table, exit codes, self-healing                        |
| R-SILENCE   | 2026-03 | —                                                                           | L1v2 silence detection — conspicuous silence scoring integrated in concern synthesis   |
| R-L1-DEMOTE | 2026-03 | —                                                                           | L1 structural + L3 thematic demoted to descriptive context (not convergence scoring)   |
| R-CONTENT   | 2026-03 | [M72](https://github.com/agile-explorations/democracy-monitor/milestone/72) | Ingest content quality — 39/39 detection (was 22/39), 4/6 NC failures need calibration |

Older sprints (R-S1a through R-DATA1): see `DECISIONS-ARCHIVE.md`.

## Current state (as of 2026-03-16)

### Categories & baselines

- 14 categories (added elections, mediaFreedom, lawEnforcement, civilLiberties, immigrationEnforcement; expanded courts, military; `indices` renamed to `executiveActions`)
- 4 baselines: Biden 2022 (Year 2, primary), Biden 2021 (Year 1), Trump 2017 (Year 1), Trump 2018 (Year 2)
- Biden 2022 is primary baseline (replaced biden_2024); 58,713 docs, 8 alerts (3 iterations calibrated it down from 42)
- Biden 2022 exported as light fixtures (~29MB): assessments, baselines, document_scores, weekly_aggregates, intent_weekly + document manifest (raw docs gitignored)
- Cross-baseline validation: `pnpm seed:validate` — compares severity/volume ratios across Year 1 vs Year 2
- Obama 2013 dropped: FR-only source coverage would confound comparisons. All 4 baselines have uniform FR + GDELT + WH coverage.
- All 4 baselines now have AI assessment (gpt-4o-mini); previously keyword-only

### UI pages & APIs

- Landing page = overview page: concern heatmap (13×16) + status timeline + synchrony chart + status summary + category cards grid
- Overview API: `/api/overview/summary` — concern heatmap, status timeline, synchrony, status counts from weekly_aggregates
- Category detail page: `/category/[key]` — ConcernHeader, StructuralSignaturePanel, AIAssessmentPanel, ThematicDriftPanel, TrendChart, EvidencePanel
- Category API: `/api/category/[key]` returns latest assessment + baseline; `?weekOf=` param for historical; reuses `/api/history/weekly-scores` for chart data
- Week detail page: `/category/[key]/week/[date]` — summary cards, sparkline with highlight, keyword matches, DocumentTable with CSV export
- Narrative API: `/api/narratives/[category]` + `/api/narratives/overview`. Read-only from stored narratives (no on-demand generation). `?editorial=true` returns drafts + GPT-4o feedback. `_overview` = weekly summary, `_term_summary` = incremental term summary
- Health API: `/api/health/meta` (MetaAssessment), `/api/health/sources` (sources + summary); both DB-optional
- Search page: `/search` — two modes (research + explore). Research = 3-pass RAG synthesis with two-phase loading (docs first, then answer). Explore = keyword + semantic search with filters/pagination.
- Search API: `/api/search` — unified endpoint, `mode=research|explore`. Research supports `docsOnly=true` (fast doc-only response) and `editorial=true` (returns draft/feedback chain). `/api/search/similar/[documentId]` for related docs.
- Research synthesis: `lib/services/research-synthesis-service.ts` — Claude Opus draft → GPT-4o editorial feedback → Claude Opus revision. Same multi-model pattern as narratives. Prompts in `research-prompts.ts`.
- Search service: `lib/services/search-service.ts` — `searchResearch()` (vector + recency re-ranking + URL dedup), `searchExplore()` (keyword + semantic with filters), `findSimilarDocuments()`. SQL helpers in `search-queries.ts`.

### UI patterns

- Shared chart colors: `lib/data/chart-colors.ts` — CHART_COLORS, CATEGORY_COLORS, CONCERN_LEVEL_COLORS
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

### AI document review

- `ai_document_assessments` table, `aiScore`/`aiDetail` on `weekly_aggregates`, `runLayer2Assessment()` in orchestrator, `pnpm review:backfill` CLI
- Pass 1 = gpt-4o-mini (OpenAI), Pass 2 = claude-sonnet-4-5-20250929 (Anthropic) — different providers for epistemic independence
- Thresholds in scoring-config: `AI_FLAG_RATE_THRESHOLD = 1.5` (z-score, event-validation only), `AI_CONCERN_THRESHOLD = 0.2` (20% concern rate), `AUDIT_SAMPLE_RATE = 0.03`
- ConcernLevel: Stable / Elevated / ConfirmedConcern (absolute P2 thresholds: ≥1 clearly_concerning or ≥2 potentially_concerning = Elevated; ≥2 clearly_concerning or ≥3 concerning with ≥20% rate = ConfirmedConcern). Divergent retained in type union for legacy DB records but no longer produced.
- Source convergence: 6th structural dimension, log2((gov+1)/(rhetoric+1)), weight 0.13 in STRUCTURAL_DIMENSION_WEIGHTS
- All 4 AI review baselines complete (2026-02-24): flag rates 0.34-0.64%, Pass 2 non-concerning 98.4-99.9%, audit FN rate 0.07%
- civilLiberties P1 calibrated (2026-03-03): flag rate 73% → 3.1%, P2 confirmation 1.5% → 20.3%, audit FN 0.7% (1/147). Fix: erosion framework in P1 prompt + threat-vector description. Architecture-consistent (no per-category prompt fields)
- Structural dampening: `DAMPENING_THRESHOLD` and `JSD_Z_SCORE_CAP` in scoring-config.ts — exponential decay for mild z-scores, cap on JSD outliers

### Source health & coverage

- Fault-tolerant fetching: `fetchWithRetry()` in `lib/utils/fetch-retry.ts` wraps HTTP calls with 3-attempt exponential backoff (2s, 4s). Retries on 5xx/429, returns immediately on 4xx. Used by API signal fetchers in feed-fetcher.ts. All signals are API-based with per-source incremental dates — failed fetches self-heal on next snapshot run.
- All signal types recorded in `fetch_log` via `recordSnapshotSignalResults()` (SNAPSHOT_LOGGED_TYPES covers federal_register, courtlistener, doj_json, govinfo, fec_json, oig_html)
- Source health monitoring: `source_health` table, 31 signals with stable IDs, 6 canary sources, SourceHealthCheck classification (healthy/degraded/unavailable/silent)
- Meta-assessment: 4 integrity levels (high/moderate/low/critical) from `INTEGRITY_THRESHOLDS` in scoring-config; canary downgrade from high→moderate when ≥50% canaries critical
- Confidence degradation: `sourceAvailability` factor (weight 0.15) in `DATA_COVERAGE_WEIGHTS`; `CRITICAL_CONFIDENCE_CAP = 0.3` hard cap
- `fetchCategoryFeedsWithMetadata()` wraps feed fetcher with per-signal success/failure, doc count, timing
- Landing page: DataIntegrityBanner (4 levels, hidden at high) + SourceHealthBar (dots per signal)
- Coverage health: `lib/services/coverage-health.ts`, `getSourceCoverage()` SQL, `detectSilenceAlerts()` pure filter, `HEALTH_THRESHOLDS.silentCheckCount` in scoring-config

### Source fetchers

- Fetcher module pattern: `parseParams()` + `toContentItem()` (pure, tested) + `fetchRecent()` + `fetchHistorical()` (I/O, excluded from coverage). All gov-doc fetchers throw on HTTP errors (first page throws; subsequent pages return partial). `fetchSignalWithRetry` wraps with 3 retries + exponential backoff and records failures in `fetch_log`.
- CourtListener fetcher: `lib/services/courtlistener-fetcher.ts`, REST API v4, `COURTLISTENER_API_TOKEN` env var, 750ms rate limit, pseudo-URL `courtlistener://recap?nos=440`. `CL_BACKFILL_MAX_PAGES = 45` (900 results) — peak weekly volume is 842 (lawEnforcement, Trump T1)
- DOJ fetcher: `lib/services/doj-fetcher.ts`, `https://www.justice.gov/api/v1/press_releases.json`, open API, pseudo-URL `doj://press?component=criminal-division`
- DOJ frozen taxonomy: `lib/data/doj-taxonomy.ts`, 15 `DojInternalBucket` values, `classifyDojRelease()` first-match-wins, `DOJ_BUCKET_TO_CATEGORIES` maps to DM categories
- GovInfo fetcher: `lib/services/govinfo-fetcher.ts`, REST API, `GOVINFO_API_KEY` env var, pseudo-URL `govinfo://collection?collection=GAOREPORTS`. 3 collection types: GAO_REPORTS, CRPT, PLAW.
- FEC fetcher: `lib/services/fec-fetcher.ts`, OpenFEC API, `FEC_API_KEY` env var (optional), pseudo-URL `fec://advisory-opinions?type=advisory_opinions`. Advisory opinions + MURs.
- Multi-source backfill: `lib/cron/backfill-fetchers.ts` has `fetchWeekItemsFr()`, `fetchWeekItemsCourtListener()`, `fetchWeekItemsDoj()`. backfill.ts groups signals by type.

### Narrative generation

- `lib/services/narrative-generation-service.ts` (status routing), `narrative-multipass.ts` (generation), `narrative-store.ts` (DB), `narrative-pipeline.ts` (orchestration)
- Dual audience: expert (400-800 words, technical) + public (200-500 words, plain language). Tiered: Stable → template, Elevated → single-pass (Claude Opus), Divergent/ConfirmedConcern → 3-pass (Claude draft → GPT-4o feedback → Claude revision).
- `narratives` table: category, weekOf, version ('expert'|'public'), content, model, generatedAt. Unique on (category, weekOf, version).
- Prompt data: `narrative-format-helpers.ts` formats document sections (P2 reasoning with `>>> WHY THIS WAS FLAGGED:` prefix), trajectory summary (pre-computed stats: peak, mean, activations, streaks, transitions — replaces raw week-status table). `narrative-prompts.ts` builds prompts with markdown link instructions and P2 grounding. Content excerpts: 4000 chars (`narrative-queries.ts`).
- Validation: `validate:narratives` checks T-NAR-12 (no raw data sequences, regex catches arrow-separated + comma-separated), T-NAR-16 (document references by title or URL match).

### Rhetoric & crossfeed

- `rhetoric-crossfeed.ts`: `classifyRhetoricToCategories(title, summary?)` routes rhetoric docs to 14 categories using FR signal search terms; `SUPPLEMENTAL_TERMS` for executiveActions + lawEnforcement + immigrationEnforcement (agency-based signals need supplemental terms); module-level cache
- `crossfeedRhetoricToCategories(items)` in rhetoric-crossfeed.ts — classifies rhetoric items by FR signal terms, stores under matched categories. Called in snapshot, backfill, and backfill-rhetoric pipelines.
- `lib/data/category-topics.ts` — PolicyArea→categories many-to-many mapping (bridges 5 rhetoric areas to 13 assessment categories)
- `classifyPolicyAreaWithScore()` exported from intent-data-service.ts — returns {area, score}; score=0 means unclassifiable
- WH scraper removed (Sprint R-CPD2): rhetoric-fetcher.ts is now GDELT-only. Historical WH data remains in DB but no new fetching.

### Modules & patterns

- `buildMetadata(item)` in document-store.ts: pure function returning `{agency?, action?, subtype?}` or null; replaces inline `{agency}` construction
- Extracted services: convergence-service, proxy-parser, tracker-service, intent-orchestrator
- Cron scripts: loadEnvConfig moved to CLI entry blocks for testability; process.exit→throw in exported functions. **loadEnvConfig overwrites shell env** — CLI scripts must preserve/restore DATABASE_URL around `loadEnvConfig(process.cwd())` when sourced against production: `const saved = process.env.DATABASE_URL; loadEnvConfig(cwd); if (saved) process.env.DATABASE_URL = saved;`
- Shared utils: lib/utils/async.ts (sleep, mapConcurrent), lib/utils/collections.ts (deduplicateByUrl), lib/types/category-card.ts (AutoStatus, EnhancedData)
- AIProvider.complete() signature: (prompt: string, options?: AICompletionOptions) → result.content (not result.text)
- ESLint max-lines (300) + max-lines-per-function (50) enforced; data/schema/test/demo/seed/hooks/component/cron files exempt
- OFFSET pagination tiebreaker: always add a unique column (e.g. `documents.id`) to ORDER BY when using OFFSET — without it, rows sharing the same sort value get skipped at batch boundaries (caused 8,583 missing scores before fix in `recompute-scores.ts`)

### Testing & coverage

- 2016 tests across 137 test files
- Coverage thresholds: statements 70%, branches 67%, functions 72%, lines 71%. I/O-heavy modules excluded from coverage: fetchers (courtlistener, doj, fec, govinfo), document-embedder, stores (fetch-log, snapshot, narrative), narrative-pipeline, CLI scripts (backfill-gaps). Pure functions tested; fetch/pagination/DB I/O not unit-testable.
- `pnpm test:coverage` in `.husky/pre-push` — catches coverage threshold regressions before push

### Infrastructure

- `docs/internal/`: Internal spec/research docs (gitignored, kept on disk). Includes V3 specs, spike findings, signal gap analysis, etc.
- DEPLOYMENT.md: deploy guide (Render.com), 3-tier data strategy (git fixtures / GitHub Release pg_dump / Render PostgreSQL), disaster recovery, cron schedule
- render.yaml build command: `pnpm install && pnpm db:migrate && pnpm build` (auto-migrates on deploy)
- Cron schedule: daily-snapshot 06:00 UTC, daily-digest 07:00 UTC (staggered), weekly-clustering Sun 03:00 UTC, hourly-uptime every hour

## Lessons learned

Reusable lessons extracted from sprint retrospectives. See `DECISIONS.md` and `DECISIONS-ARCHIVE.md` for full context.

### Data pipeline

- **Await pipeline-critical writes.** Fire-and-forget `.catch()` silently drops errors when downstream steps depend on the data. If the process crashes right after, writes are lost entirely. Always `try { await } catch` for writes that affect pipeline correctness. (R-CRON)
- **Metadata-driven filtering scales better than keyword tightening.** When keywords match noise (e.g., routing terms inside 8K-char amendment dumps), structural metadata (subGranuleClass, LegiScan subjects) provides a cleaner filter than trying to make keywords less ambiguous. (R-NOISE, R-SIG)
- **Validate API identifiers against the live API before committing.** Agency slugs, endpoint paths, and field names are often undocumented and can't be guessed from display names (e.g., `commission-on-civil-rights` vs `civil-rights-commission`). (R-SIG)
- **Data coverage is the binding constraint, not scoring precision.** 15 of 17 detection misses were caused by truncated content or wrong-category routing, not thresholds. Maximize recall first (fix content + routing), then tune precision (calibrate P1). The reverse order can't work — you can't tune what you can't see. (R-CONTENT)
- **Staged validation prevents expensive mistakes.** Test P1 on a few known-event weeks ($3) before committing to a full L2 re-run ($80). The R-CONTENT event-week test caught a --fresh delete bug that would have produced a full re-run with 100% stale cached results. (R-CONTENT)
- **Removing content caps exposes downstream assumptions.** Embedding batch size, char limits, delete queries — all worked with 8K-capped content but broke with full documents. Budget for cascading fixes when changing data size assumptions. (R-CONTENT)

### AI / LLM prompts

- **Eliminate data rather than constraining LLM behavior.** If the LLM reproduces data verbatim, the fix is to give it less data, not more instructions. Pre-computing summaries and removing raw data from the prompt is a structural fix. (R-NAR)
- **P1 calibration lever is category `description`.** Topic-area framing ("Are X being protected?") over-flags; threat-vector framing ("Government actions that reduce X") filters to erosion-relevant docs. (R-CAL1)
- **Baseline dependencies compound.** Moving from z-score baseline comparison to absolute thresholds eliminates an entire class of contamination problems. (R1-DET)

### Code quality

- **Function extraction fixes max-lines without losing cohesion.** Extract single-purpose functions called from exactly one place — they exist for readability, not reuse. (R-CRON)
- **Rename sprints surface pre-existing lint issues.** Pre-commit hooks lint all staged files, not just changed lines. Budget time for fixing these in rename-heavy sprints. (R1-CLN)
- **`vi.clearAllMocks()` does NOT reset `mockResolvedValue`.** It clears call history but mock implementations persist. Use explicit `beforeEach` blocks that re-establish all mock return values. (R-S1d)

## Database gotchas

- `ai_document_assessments` Pass 1 uses `relevant` (boolean) for flags, Pass 2 uses `assessment` (varchar) for classification. Pass 1 `assessment` column is always NULL. All 192K+ rows have `document_id = NULL` — must join to documents via `url + category`, not `document_id`.
- `source_type` in documents table is inconsistent (#28): FR docs have doc types (`Notice`, `Rule`), WH/GDELT have `'rhetoric'`. **Partially resolved** by `source_origin` column (Sprint R-S1a) — tracks data provenance separately from document type.
- `source_origin` column on documents table: tracks data provenance (federal_register, whitehouse, gdelt, courtlistener, doj, etc.). `SourceOrigin` type in `lib/types/categories.ts`. `inferSourceOrigin()` in document-store.ts for backward compat.
- `documents` table unique constraint: `(url, category)` composite (not `url` alone) — allows same URL under multiple categories for rhetoric cross-feed
- Weekly aggregator date mismatch fixed: range query (gte/lt 7-day window) replaces exact eq() match — document_scores use Monday-based weeks, weekly_aggregates used config-start-date-based weeks
- `intent` category: exists in `documents` and `baselines` tables but is NOT a monitoring category (not in `CATEGORIES` array). It's a special data pipeline for rhetoric docs. Filter it out when displaying monitoring-category counts (e.g., `validate:data` baseline completeness).
- `document_scores` unique constraint: `(url, category)` composite (not `url` alone) — allows per-category score rows for cross-fed documents. Upsert targets `[url, category]`, `resolveDocumentIds` JOINs on both
- `documents.content_type` column: `full_text` (default) or `metadata_only` (GDELT). Metadata-only docs excluded from embedding and Layer 2 pipelines
- `document_scores.document_id` NULL: fixed via post-store `resolveDocumentIds()` UPDATE joining on URL + category

## Known data issues

- **cl_first_amendment noise (civilLiberties)** _(resolved R-S1f)_: Old `q=first+amendment` query was unscoped — fetched any docket mentioning "first amendment" regardless of NOS code. 50,973 noise docs purged via `pnpm cl:purge-noise --confirm`; 50,223 valid docs retained. Scores, aggregates, and baselines recomputed.
- **RSS/HTML/JSON signals removed**: All 8 non-API signals (rss_scotus, rss_dod_news, rss_dod_contracts, rss_gao, rss_fcc_media, rss_fcc_enforcement, html_oversight_gov, json_uptime) dropped — Akamai WAF blocks most, redundant with API sources (CourtListener covers SCOTUS, GovInfo covers GAO). All signals now API-based with incremental date tracking.
- **3 WhiteHouse docs missing scores**: Boundary condition in OFFSET pagination — 3 WH docs at exact batch boundaries (publishedAt ties with batch cutoff). Negligible impact (3 of 337,494). Will self-resolve on next full recompute.
- **~18K documents missing weekly aggregates** _(resolved R-S1e)_: Backfill now always runs score → aggregate → embed even when ingest is skipped.

## Adding new categories

Requires updating:

1. `lib/data/categories.ts` — category + signal definitions. **FR signals MUST use shorthand URL format** `/api/federal-register?agency=X&term=Y` (not raw FR API URLs — `parseSignalParams()` can't parse them)
2. `lib/data/assessment-rules.ts` — keyword dictionaries (capture/drift/warning tiers)
3. `lib/data/category-maturity.ts` — maturity level (usually `'Experimental'` for new categories)
4. `lib/data/chart-colors.ts` — `CATEGORY_COLORS` entry
5. `lib/data/doj-taxonomy.ts` — add to relevant `DOJ_BUCKET_TO_CATEGORIES` buckets if applicable
6. `lib/services/rhetoric-crossfeed.ts` — `SUPPLEMENTAL_TERMS` if no FR term-based signals
7. Hardcoded category counts in tests (search for the old count across test files)
8. Run backfill (see Backfill runbook below)

## Backfill runbook

### Periods

| Period       | Dates                   | Notes             |
| ------------ | ----------------------- | ----------------- |
| Trump Year 1 | 2017-01-20 → 2018-01-19 | Baseline          |
| Trump Year 2 | 2018-01-20 → 2019-01-19 | Baseline          |
| Biden Year 1 | 2021-01-20 → 2022-01-19 | Baseline          |
| Biden Year 2 | 2022-01-20 → 2023-01-19 | Baseline          |
| Trump T2     | 2025-01-20 → present    | Active monitoring |

Gap years (2019–2020, 2023–2024) are intentionally excluded. Pipeline commands default to these periods only via `lib/data/analysis-periods.ts`. Use `--all-dates` to process gap-year documents.

### Backfill commands (R-S1e redesign)

`pnpm backfill` is the single command for loading data. It runs: fetch → score → aggregate → embed. When `fetch_log` marks a week complete, only ingest is skipped — score/aggregate/embed still run on existing docs.

```bash
# All sources, all periods
pnpm backfill --source fr --from 2017-01-20 --to 2019-01-19
pnpm backfill --source fr --from 2021-01-20 --to 2023-01-19
pnpm backfill --source fr --from 2025-01-20

# Compute baseline statistics (from existing aggregates/embeddings)
pnpm baselines:compute

# Verify completeness
pnpm validate:ingest
pnpm validate:data
```

### Non-FR sources (CourtListener, DOJ, GovInfo, FEC)

```bash
pnpm backfill --source courtlistener --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source courtlistener --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source courtlistener --from 2025-01-20

pnpm backfill --source doj --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source doj --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source doj --from 2025-01-20
```

### New category: full backfill checklist

1. FR all periods: `pnpm backfill --category <key> --source fr --from 2017-01-20 --to 2019-01-19` (repeat for all periods)
2. Compute baselines: `pnpm baselines:compute`
3. Verify: `pnpm validate:ingest --category <key>` and `pnpm validate:data --category <key>`
4. Non-FR sources backfill automatically for all categories

### Repairing incomplete data

All pipeline commands are idempotent — safe to re-run on existing data:

- `pnpm backfill`: skips completed ingest via `fetch_log`, always re-scores/aggregates, skips already-embedded docs. Use `--force` to bypass `fetch_log` and re-fetch all weeks (needed after pagination cap changes)
- `pnpm review:backfill`: skips weeks where Pass 1 count >= document count
- `pnpm scores:recompute`: re-scores from `documents` table and re-aggregates (no API calls)
- `pnpm baselines:compute`: recomputes from existing aggregates/embeddings

Full repair workflow (re-fetch + reprocess from scratch):

```bash
pnpm backfill --from 2017-01-20 --to 2019-01-19
pnpm backfill --from 2021-01-20 --to 2023-01-19
pnpm backfill --from 2025-01-20
pnpm review:backfill          # L2 Pass 1/Pass 2 AI assessment
pnpm baselines:compute        # recompute baseline statistics
pnpm scores:enrich            # populate L1/L2/L3 layer scores + concern synthesis
pnpm validate:ingest
pnpm validate:data
```

### Recomputation pipeline (after purge, content backfill, or classification changes)

When data has changed but doesn't need re-fetching (e.g., after a purge, content backfill, or routing/classification change), run this sequence:

```bash
# 1. Re-score documents + rebuild weekly aggregates
pnpm scores:recompute

# 2. These three can run in parallel (independent of each other):
pnpm embeddings:backfill      # embed docs missing embeddings
pnpm review:backfill          # L2 Pass 1/Pass 2 AI assessment
pnpm backfill:content --source fr  # (only if content gaps exist)

# 3. After steps 1-2 complete:
pnpm baselines:compute        # recompute baseline statistics from aggregates/embeddings

# 4. After step 3:
pnpm scores:enrich            # populate L1/L2/L3 layer scores + concern synthesis + narratives

# 5. Validate
pnpm validate:ingest
pnpm validate:data
pnpm validate:detection
```

**Step dependencies:** Steps 2a/2b/2c are independent and can run in parallel. Step 3 depends on 1+2. Step 4 depends on 3. Skipping `scores:enrich` leaves all layer scores as zero and concern status unpopulated.

**What each step does:**

- `scores:recompute` — re-scores from `documents` table, rebuilds `weekly_aggregates` (no API calls)
- `embeddings:backfill` — generates OpenAI embeddings for docs with null `embedded_at`
- `review:backfill` — runs L2 Pass 1 (gpt-4o-mini) + Pass 2 (Claude Sonnet) on unreviewed docs
- `baselines:compute` — computes mean/stddev/centroid statistics from aggregates and embeddings
- `scores:enrich` — computes L1 structural z-scores, L2 AI review scores, L3 thematic drift scores, runs concern synthesis, generates narratives for elevated categories

All commands default to analysis periods only (see Periods table above). Use `--all-dates` to include gap years.

### Troubleshooting

- **"Skipped N weeks (already complete)"**: Stale `fetch_log` entries from a previous run. Delete them: `DELETE FROM fetch_log WHERE category = '<key>'`, then re-run.
- **Suspiciously high doc counts**: Check signal URLs. FR signals must use shorthand format (`/api/federal-register?agency=X&term=Y`). Raw FR API URLs bypass `parseSignalParams()` and fetch ALL documents unfiltered.
- **Rate limits**: FR API tolerates 2 concurrent category backfills. More than that risks 429s. Chain runs sequentially within a terminal, parallelize across terminals by source or category.

## Signal gap findings (resolved in Sprint 20)

- FR API boolean search: pipe `|` for OR, space for AND, `""` for phrases. All 18 affected queries fixed.
- GDELT DOC 2.0 API: `sourcecountry:US` filter added to all 5 queries. Historical data is accessible via `startdatetime`/`enddatetime` parameters (DB contains GDELT data from 2017 onward).
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

See `CLAUDE.md` for sprint process, project management workflow, and labels. Additional notes:

- DECISIONS.md = sprint retrospectives (planned vs built, spec deviations, key decisions, lessons learned) — **read before every sprint**
- Spec documents in `docs/internal/` (gitignored, local-only) = requirements (V3 Addendum, UI Design Spec) — specs are NOT updated inline; deviations tracked in DECISIONS.md
- `ASSESSMENT_METHODOLOGY.md` = public-facing methodology doc (3-layer detection, convergence, data sources, limitations)

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
- Sprint R-S1c: Fault-tolerant RSS/HTML/JSON signal fetching — fetchWithRetry() wrapper (3 attempts, exponential backoff), retry cron (11am UTC), recordSnapshotSignalResults() for fetch_log integration, buildSignalLookup() helper. 115 new tests (1526 total).
- Sprint R-S1d: Backfill verification fixes — cl_first_amendment query rewrite (unquoted→quoted + qualifying terms), CourtListener NOS maxPages 10→15, immigrationEnforcement category (2 FR signals + SUPPLEMENTAL_TERMS), FEC pagination fix (offset-based), DOJ binary search off-by-one fix, OpenGrep blocking enforcement, dead code removal (246 lines from 4 services). FR backfills complete for 4 new categories. cl_first_amendment purge + FCC RSS verification deferred to pipeline redesign. Pipeline redesign proposal (BACKFILL_PIPELINE_REDESIGN.md). 1 new test (1527 total).
- Sprint R-S1e: Backfill pipeline redesign Phase 1 — fix skip logic (score/aggregate/embed always run even when ingest skipped), incremental snapshot (API signals use historical fetchers from last stored date), compute-baseline-stats command, backfill:verify completeness check (9 checks). Removed: build-baseline command, assess-week.ts, --ingest-only/--skip-ai/--model/--no-rhetoric flags, backfillGdelt/fetchWhDocs/backfillRhetoric dead functions. recompute-scores always re-aggregates. ~580 lines removed, 4 new files, 3 new test files. Issues #184-#190. 5 new tests (1532 total). Post-sprint: added FR period coverage + GDELT cross-feed checks to backfill:verify, fixed OFFSET pagination tiebreaker in recompute-scores (59K→3 missing scores), 22 additional tests for verify/service, ran full data repair (recompute-scores + backfill embedding).
- Sprint R-S1f: Backfill pipeline redesign Phase 2 — unified WH/GDELT/LegiScan as `--source` options, cron overlap protection (PostgreSQL advisory locks via cron_locks table), `snapshot --from/--to` for retroactive assessment, `cl:purge-noise` command for CL noise document cleanup. Removed dead fetchWhArchiveHistorical (~94 lines). Issues #191-#195. 8 new tests (1561 total across 126 files).
- Sprint R-S1g: CourtListener pagination fix — CL maxPages 15→45 (cap 300→900), `--force` backfill flag, re-backfill all CL periods (155K docs), recomputed civilLiberties + lawEnforcement baselines. `backfill:verify` document coverage subtotals. LegiScan Pass 1 sensitivity gap documented in ARCHITECTURE.md. `pnpm format:check` added to pre-push hook. Issues #196-#199. 1526 tests across 124 files.
- Sprint R-OPS1: Source Health detail + Layer 2 performance — per-source detail panel in Source Fetch Health timeline (click-to-reveal with status badges, category labels, error indicators). `mapConcurrent()` bounded-concurrency utility in lib/utils/async.ts. Layer 2 backfill parallelized (Pass 1: 5, Pass 2: 3, Retry: 3). Null-content retry skip in `retryMissingPass2()`. `formatWeekLabelWithYear()` date utility. Code review: FetchStatus type narrowing, fire-and-forget DB write elimination, mapConcurrent test suite. 5 new tests (1544 total across 127 files).
- Sprint R-CB1: Content backfill (Presidential Documents + Congressional Reports) — `pnpm backfill:content` CLI (--source fr|govinfo, --dry-run, --limit N), FR `fetchFrRawText()` + `raw_text_url` in metadata, GovInfo `fetchGovInfoText()`, forward pipeline content fill in backfill-fetchers.ts, `backfill:verify` content completeness check. CL opinion ingestion documented in ROADMAP. Issues #200-#205. 2 new tests (1546 total across 127 files).
- Sprint R-CAL1: Layer 2 P1 calibration for civilLiberties — erosion type framework added to P1 prompt (global), civilLiberties description tightened from topic-area to threat-vector framing. P1 flag rate 73% → 3.1%, P2 confirmation rate 1.5% → 20.3%, audit FN rate 0.7% (1/147). 22 weeks backfilled (4,947 docs, 154 flagged). 7 new tests (1553 total across 128 files).
- Sprint R-CL1: CourtListener opinion ingestion — `case_id` column + migration (0028), `fetchOpinionText` (two-step clusters→opinions API, concatenates all substantive sub_opinions with type labels), `buildOpinionContentItem`, `extractDocketId`, `backfill:opinions` CLI, forward pipeline auto-ingestion via `fillClOpinions`, Layer 1 volume dedup by case_id, `backfill:verify` CL opinion coverage. 164K existing rows backfilled with case_id. Issues #206-#215. 16 new tests (1569 total across 129 files).
- Sprint R-P2: Phase 2 data reprocessing prep — `document_scores` composite unique `(url, category)` (migration 0029), `content_type` column (`full_text`/`metadata_only`) for GDELT discrimination, embedding + Layer 2 pipelines exclude `metadata_only`, WH content backfill source (`pnpm backfill:content --source wh`), `--fresh --confirm` flag for full L2 rerun, verification reporting for metadata-only counts + origin-based content completeness. Extracted `backfill-verification-layer2.ts` (fixed pre-existing lint warnings). Issues #216-#222. 18 new tests (1587 total across 132 files).
- Sprint R-AP1: Analysis period safeguards — `lib/data/analysis-periods.ts` single source of truth (BASELINE_CONFIGS + T2). Pipeline commands (`scores:recompute`, `embeddings:backfill`, `scores:enrich`, `review:backfill`) default to analysis periods only; `--all-dates` override for gap years. `backfill.ts` embed step filtered. 12 new tests (1683 total across 135 files).
- Sprint R-VAL1: Validation command refactor — replaced `backfill:verify` + `validate:events` with three non-overlapping commands: `validate:ingest` (source coverage, content completeness, pagination fitness), `validate:data` (scores, embeddings, baselines, L2 coverage, layer scores, metadata_only classification), `validate:detection` (known events, negative controls, layer attribution). New checks: `getLayerScorePopulation`, `getMetadataOnlyClassification`. Service/query/CLI separation. Issues #234-#238. 1678 tests across 135 files.
- Sprint R-CPD1: CPD source swap — GovInfo CPD fetcher with NARA subject-based category routing (164 mapped terms, 13 categories). `ACTIVE_SOURCES` filter excludes whitehouse/gdelt from scoring/embedding/backfill. Backfilled 5 analysis periods. Pre-gate (#239-#242) complete; gate (#243) + post-gate cleanup (#244-#246) pending. 11 files, 1102 lines added, 1694 tests.
- Sprint R-CPD2: Validated document database — non-Monday week_of fix (getWeekRanges Monday-alignment + DB cleanup: 2,825 deletes, 143 updates), WH scraper removal (rhetoric-fetcher, backfill-rhetoric, backfill-content, baselines, intent-data-service), fetcher error handling (all 8 gov-doc fetchers throw on HTTP errors for retry/logging), pre-existing TS fixes (oig_html SignalType, domhandler Element), SNAPSHOT_LOGGED_TYPES expansion, event expectation adjustments (T2-1/T2-9/T2-11 thin signals, NC-2 threshold 10%→8%). NC-3 calibration diagnosed (L1 thin-category sensitivity + L2 high-volume over-flagging) and deferred to #267. Issues #261-#267. 1722 tests across 139 files.
- Sprint R-CAL2: NC-3 convergence calibration — L2 P2-corroboration (`isAIElevated` requires `concernRate > 0` or z-score > 3.0), L3 reinforcement-only mode (thematic drift can upgrade but not independently trigger Elevated; 44% baseline FP rate, zero independent detections), NC-3 tiered thresholds (5% for ≥20 docs/week, 10% for thin categories). L1 dampening abandoned after analysis showed detection losses. Retired GDELT/WH source noise removed from `validate:ingest`. Issues #267-#269. 1727 tests across 139 files.
- Sprint R-NAR1: Multi-pass narrative architecture — 3-pass category narratives (Opus draft → GPT-4o feedback → Opus revision), weekly cross-category summaries (`_overview`), incremental term summaries (`_term_summary`), narrative_failures table + CLI retry, editorial transparency (drafts/feedback stored + UI toggle), validate:data expanded (category/weekly/term coverage). Dead code cleanup (8 unused exports). DRY fixes (shared constants, test fixtures, API helpers, enrichCategoryData extraction, transactional storage). 32 new tests (1724 total across 141 files).
- Sprint R-COV1: Branch coverage improvement — 306 new tests across 21 test files (1724→2030), global branch coverage 62.62%→68.24%, thresholds raised (branches 63%→68%, statements 68%→71%). Targeted 18 files with >10 missing branches. Issues #279-#285.
- Sprint R-UI1: UI catch-up — left nav sidebar, system pages (Health, Architecture, Methodology), site-wide OSS footer, category page chart fixes (convergence score, status bars, brush/week defaults), Tailwind opacity fix (CSS var hex→RGB), api.govinfo.gov URL rewrite (42K rows across 3 tables), methodology accuracy audit (14 categories, source list, functional buckets, baselines, L2 audit results), doc reorganization. 49 files changed. Issues #286-#292.
- Sprint Search: Document search — DB migration (tsvector + HNSW vector index), search service (semantic + keyword + filters), research synthesis (3-pass Opus→GPT-4o→Opus for dual-audience RAG answers), explore mode API, search page UI (research + explore modes with editorial transparency), similar documents endpoint, nav integration. Issues #293-#300.
- Sprint R-RESP: Responsive layout — viewport meta tag in \_document.tsx, SiteHeader mobile layout (logo/tagline/settings stack on small screens), CategoryTable mobile card fallback, chart margin/legend responsive fixes, detail panel grid breakpoints. Issues #301-#305.
- Sprint R-NAR2: Narrative quality & context enrichment — evidence-proportional length, weighted counter-arguments, source health injection (fetch_log), thematic drift document grounding (pgvector nearest/furthest), GPT-4o evidence sufficiency criterion, format helper extraction. Follow-up: weekly/term summary prompt improvements (synthesis framing, zero-doc flagging, compression guidelines, critical evaluation). 6 narrative example files. Issues #316-#323.
- Sprint R-SEARCH1: Research pipeline enhancements — embedding-based corpus stats with adaptive similarity threshold, P2 AI assessment integration in retrieval/prompts, keyword soft-boost in ranking, citation link fix (#cite-N anchors), styled markdown rendering, corpus-wide document counts in UI. Issues #324-#329.
- Sprint R-SEO1: SEO foundation — robots.txt, dynamic selective sitemap, category slug mapping (camelCase→kebab-case), SEOHead component, 301 redirects. Issues #330-#336.
- Sprint R-SEO2: SSR narrative pages — getServerSideProps for category-week and weekly hub pages, noindex on query-param category pages, sitemap date-type-cast bug fix, Playwright E2E test suite (19 tests), landing page term summary week-tracking fix. Issues #337-#341.
- Sprint R-SEO3: Internal linking + structured data — prev/next narrative week navigation, category week archive section, JSON-LD (Article, CollectionPage, BreadcrumbList, WebSite), static OG image, article publication metadata, weekly hub→category landing links, category intro text. Issues #342-#346.
- Sprint R-NAR3: Narrative prompt compliance — 9 spec gap fixes (counter-argument limits, "why this might matter" reinforcement, small-sample caveats, L2-empty transparency, weekly/term structural requirements), 3-pass safety net criteria, validate:narratives script, layer assessment refactor. Issues #347-#348, #355-#361.
- Sprint R-DQ1: Data quality safeguards — Fixed Mar 2 production data (re-scored 811 docs across 13 categories, regenerated narratives). Normalized fetch_log source_origin naming (snapshot signal IDs → canonical source types matching backfill). Added narrative pipeline safety net: `checkAggregateCompleteness()` aborts generation when weekly_aggregates covers <50% of document categories. Issues #362-#364.
- Sprint R1-P0: Content enrichment + tiered narratives — FR full-text enrichment expanded to all document types (not just Presidential Documents), DOJ fetcher fixed to prefer body over teaser (8K limit), DOJ backfill CLI added. Tiered narrative generation: Elevated → single-pass, Divergent/ConfirmedConcern → 3-pass. Issues #365-#367.
- Sprint R1-A2A3: Per-category L1 thresholds + event retrospective — `CATEGORY_STRUCTURAL_THRESHOLDS` map + `getStructuralThreshold()` lookup in scoring-config.ts, convergence synthesis category-aware, `structural:distributions` diagnostic, `retrospective` CLI harness. `buildAISummaryFromDB` extracted to shared `layer2-summary.ts`. judicialIndependence threshold 3.8, executiveOversight 2.8. Issues #368-#378.
- Production remediation: Full pipeline recomputation after content enrichment (scores → L2 re-assessment → baselines → layers → backtest). loadEnvConfig bug fixed in 5 CLI scripts. l1:distributions NC-3 display improved (FAIL(L2) + Elev column). Regression analysis documented. Post-remediation: 50% T1 detection (7/14), 7 false alarms.
- Sprint R1-CAL2: Detection calibration + backtest redesign — P1 calibration for 5 categories (lawEnforcement, executiveOversight, elections, infoAvailability, judicialIndependence), high-significance position lookup, backtest metric redesign. Issues #382-#389, Milestone 57.
- Sprint R1-CRON: Weekly cron job fixes — LegiScan OOM (free base64 after decode + NODE_OPTIONS heap limit), weekly-dump.sh DELETE made non-fatal + upload retry. Issues #390-#392, Milestone 58.
- Sprint R1-F14: Cycle-year baseline matching — L1 selects Biden baseline by cycle year (Year 1 → biden_2021, Year 2 → biden_2022). Fixed L2 baseline contamination (`getBaselineAIFlagRate` ignored `baselineId`). Detection: 24/39 (62%), NC-3: 5/6 passing. Issues #393-#397, Milestone 59.
- Sprint R1-F15: Detection calibration closure — Fix l2Fired() display bug (expose raw + converged columns), add missReason classification to validation harness, freeze T1 backtest reference after L2 backfill. Issues #398-#400, Milestone 60.
- Sprint R1-SX1: Source expansion — Congressional Record (CREC) integration via GovInfo Granules API, contextual P2 prompt enhancement with empirical variant testing. DOJ speeches descoped (no API exists). Architecture decisions in `docs/internal/CREC_ARCHITECTURE_QUESTIONS.md`. Issues #401-#409, Milestone 61.
- Sprint R1-DET: Detection architecture transition — L2-only convergence (L1/L1v2/L3 demoted to descriptive context), absolute P2 thresholds (no baseline z-score comparison), Divergent retired, P2 reasoning enhancements. Threshold tuning deferred to #419. Issues #410-#418, Milestone 62.
- Sprint R1-CLN: Layer & convergence terminology cleanup — Remove "layer" and "convergence" naming from code and UI. Rename to domain-specific terms: ConcernLevel, ConcernAssessment, document-review-_, concern-_. Remove Divergent from charts, delete ConvergenceIndicator, simplify ConcernHeader. Issues #420-#431, Milestone 63.
- Sprint R-DATA1: Researcher data access — Data page with CSV/database downloads and API docs, time-series toggle on category detail for structural/AI/thematic metrics, CSV flattening for jsonb columns. Issues #434-#439, Milestone 64.
- Sprint R-SIG: FR signal contamination fix — Multi-agency support in FR fetcher, 16 signals scoped with agency restrictions, 1 signal terms tightened, validate:fr-signals and fr:purge-noise CLIs, OpenGrep guardrail rule. Issues #451-#455, Milestone 67.
- Sprint R-NAR: Narrative quality — Pre-computed trajectory summary (replaces raw week-status table), P2 reasoning prominence (`>>> WHY THIS WAS FLAGGED:`), document markdown links across all narrative levels, content excerpts 2000→4000 chars, T-NAR-12/T-NAR-16 validation. Issues #460-#464, Milestone 69.
- Sprint R-NOISE: CREC & LegiScan noise reduction — 3 amendment subGranuleClass values added to PROCEDURAL_SUBCLASSES (eliminating ~10K CREC noise docs), CREC purge script, LegiScan subject co-requirement for broad routing terms (LEGISCAN_SUBJECT_MAP + LEGISCAN_BROAD_TERMS), validate:legiscan column fix. Issues #465-#469, Milestone 70.
- Sprint R-CRON: Cron job resilience — cron_runs table + store service, snapshot exit codes + error collection + content gap counting + aggregate retry + inline narrative retry, LegiScan per-session error handling + cron lock, weekly-dump size validation + cron_run recording, /api/health/cron endpoint. Issues #470-#475, Milestone 71.
