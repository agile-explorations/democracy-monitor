# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-S1f: Backfill Pipeline Redesign (Phase 2) ✅

**Status: Done.** Unified WH/GDELT/LegiScan as `--source` options in backfill, added cron overlap protection (PostgreSQL locks), added `snapshot --from/--to` for retroactive assessment, created `purge:cl-noise` command for CL noise document cleanup, removed dead `fetchWhArchiveHistorical` (~94 lines). 1561 tests across 126 files.

**Scope vs. Actual:**

- Planned (5 issues): WH/GDELT as `--source` options (#191), CL noise purge (#192), cron locks (#193), LegiScan integration (#194), `snapshot --from/--to` (#195)
- Actual: All 5 issues delivered. No scope changes.

**Key Decisions:**

1. **Special source routing**: WH/GDELT/LegiScan are "special sources" — they don't map to per-category signal types. `SPECIAL_SOURCES` set bypasses `SOURCE_TO_SIGNAL_TYPE` resolution. Category-based signal loop skips entirely when `--source` is special. Rhetoric sources fetch globally then classify to categories; LegiScan downloads bulk ZIPs per session then filters by date range.
2. **`fetchWhiteHouseHistorical` over `fetchWhArchiveHistorical`**: The monitoring-period fetcher (`fetchWhiteHouseHistorical`) scrapes the current `whitehouse.gov/briefing-room` archive pages. The archive fetcher (`fetchWhArchiveHistorical`) targeted `trumpwhitehouse.archives.gov` with WordPress-specific selectors. Since WH `--source` only needs the monitoring period, the archive function was removed as dead code.
3. **Cron lock via `INSERT ON CONFLICT DO NOTHING`**: Atomic lock acquisition using PostgreSQL's conflict resolution. Returns 0 rows when lock exists (held), 1 row when acquired. Stale locks (>6hr) cleared before acquisition. `withCronLock()` wrapper handles acquire/release lifecycle. No-ops when DB unavailable (dev mode).
4. **`snapshot --from/--to` loads from DB, not fetch**: Historical snapshot mode calls `getDocumentsForWeek()` to load already-stored documents, then runs stages 2-3 (score/aggregate) + 6-9 (L2/assessment/deep-analysis/snapshot). No external fetching — designed for retroactive assessment of backfilled data.
5. **NOS-based purge for CL noise**: `VALID_NOS_PATTERNS` match Civil Rights (440-448), Habeas (530+), Prisoner (540-550), and explicit First Amendment suits. Everything else under `source_origin='courtlistener' AND category='civilLiberties'` is noise from the old unscoped `q=first+amendment` query. Cascade deletes: `ai_document_assessments` → `document_scores` → `documents` → `fetch_log`.

**Lessons Learned:**

- **Mock chain implementations persist across tests**: `vi.clearAllMocks()` clears call history but NOT mock implementations. When one test overrides `mockFn.mockResolvedValue(x)`, subsequent tests inherit that override. Fix: create a `setupMockChain()` function called from `beforeEach` that re-establishes all mock implementations.
- **Thenable mock pattern for Drizzle chains**: Some Drizzle methods (e.g., `db.delete(...).where(...)`) are awaited directly (no `.returning()`), while others chain `.returning()`. A mock supporting both must return an object with both a `returning` method and be thenable: `{ returning: mockFn, then: (resolve) => Promise.resolve(undefined).then(resolve) }`.

**Spec Deviations:**

- None. All 5 Phase 2 items from the pipeline redesign proposal delivered.

---

## Sprint R-S1e: Backfill Pipeline Redesign (Phase 1) ✅

**Status: Done.** Fixed backfill skip logic (score/aggregate/embed always run even when ingest is skipped), removed dead CLI flags and 3 files (~580 lines), added `compute-baseline-stats` and `backfill:verify` commands, incremental snapshot for API signals. 1532 tests across 124 files. Phase 2 deferred to R-S1f.

**Scope vs. Actual:**

- Planned (7 issues): Fix backfill skip logic (#184), remove dead CLI flags (#185), recompute-scores always re-aggregate (#186), compute-baseline-stats command (#187), remove build-baseline command (#188), backfill:verify completeness check (#189), incremental snapshot (#190)
- Actual: All 7 issues delivered. No scope changes. Issues 1 and 2 implemented together (combined commit) since removing flags depended on the backfill rewrite.

**Key Decisions:**

1. **`skipIngest` flag instead of separate `ingestWeek()`/`processWeek()`**: Merged the two functions into a single `processWeek()` with a `skipIngest` boolean. When `fetch_log` marks a week complete, `skipIngest=true` — the function loads docs from DB via `getDocumentsForWeek()` and still runs score+aggregate. Simpler control flow than two separate functions.
2. **Embedding at category level, not week level**: `embedUnprocessedDocuments()` runs once per category after all weeks are processed (not per-week). This batches the embedding work and avoids repeated model loading.
3. **Incremental fetch: API vs RSS split**: API signals (FR, CL, DOJ, GovInfo, FEC) use historical fetchers with `dateFrom=lastStoredDate`. RSS/HTML/JSON signals keep existing latest-N behavior (no historical API available). The `groupSignals()` function routes signals to the correct path.
4. **`getLastDocumentDate()` fallback**: When no stored documents exist for a category, the snapshot falls back to the existing `fetchCategoryFeedsWithMetadata()` (latest-N). This handles fresh deployments and new categories.
5. **backfill:verify exit codes**: Returns exit code 1 when warnings exist, 0 when all checks pass. Enables CI integration (future sprint).
6. ~~**`fetchWhArchiveHistorical` export kept**~~: Removed in R-S1f — WH `--source` uses `fetchWhiteHouseHistorical` instead.

**Lessons Learned:**

- **Mock return values must be valid for always-on code paths**: After making `recompute-scores` always aggregate (removing the `if (options.aggregate)` guard), the mock for `computeAllWeeklyAggregates` needed to return `{}` instead of `undefined`. `Object.entries(undefined)` throws — the guard was masking the invalid mock.
- **OpenGrep `no-mock-call-assertions` applies consistently**: New test files can't use `toHaveBeenCalledWith()` assertions. Testing output values instead (e.g., checking `result.items` contains expected documents) produces better tests that survive refactoring.

**Spec Deviations:**

- Phase 2 items deferred to R-S1f: LegiScan integration, cron locks, `snapshot --from/--to`, cl_first_amendment purge, WH/GDELT as `--source` options. All delivered in R-S1f.

---

## Sprint R-S1d: Backfill Verification Fixes ✅

**Status: Done.** Fixed FEC pagination, DOJ binary search, cl_first_amendment query, CourtListener maxPages, and added immigrationEnforcement category. Removed 246 lines of dead code from 4 service files. Made OpenGrep checks blocking. FR backfills completed for 4 new categories across all baseline periods. cl_first_amendment data purge and FCC RSS verification deferred to pipeline redesign sprint.

**Scope vs. Actual:**

- Planned (6 issues): cl_first_amendment query rewrite (#178), CourtListener maxPages bump (#179), immigrationEnforcement category (#180), FR backfill for 4 categories (#181), cl_first_amendment purge + re-backfill (#182), FCC RSS verification (#183)
- Actual: #178-181 delivered. #182 deferred — investigation revealed ~41K noise docs from old unscoped query, but purge/re-backfill requires downstream recomputation (aggregates, baselines) best handled by pipeline redesign tooling. #183 deferred — FCC website down due to Feb 2026 government shutdown (not a config bug). Also fixed FEC pagination and DOJ binary search bugs discovered during verification, plus 26 OpenGrep findings.

**Key Decisions:**

1. **cl_first_amendment purge deferred to pipeline redesign**: The old `q=first+amendment` query produced ~41K noise docs (insurance, patent, fraud) mixed with ~56K valid docs (NOS 440/530). Since documents don't track which signal produced them, purging requires NOS-based filtering. Downstream data (scores, aggregates, baselines) also needs recomputation. The pipeline redesign sprint provides proper `pnpm backfill --stage` tooling for this.
2. **FCC RSS treated as external outage, not bug**: Both `rss_fcc_media` and `rss_fcc_enforcement` time out because the FCC website is down during the government shutdown. The fault-tolerant retry infrastructure (R-S1c) handles this gracefully — marks as `unavailable`, retry cron attempts recovery.
3. **FEC pagination: offset-based, not per_page**: FEC API ignores `per_page` parameter and returns exactly 20 results. Fixed to use `from_hit` offset with `PAGE_SIZE = 20` constant.
4. **DOJ binary search: -1 adjustment**: `findStartPage` could miss boundary items when a page's newest item exactly equaled toDate. Fixed with `Math.max(0, rawStart - 1)`.
5. **OpenGrep made blocking**: Added `--error` flag to `opengrep scan` in pre-commit hook. All 26 existing findings (mostly `no-mock-call-assertions`) resolved with either code fixes or justified `nosemgrep` annotations.
6. **Pipeline redesign proposal drafted**: `docs/internal/BACKFILL_PIPELINE_REDESIGN.md` — 9-stage pipeline, 6 commands, source integration plan. Reviewed by Claude Online with 6 refinements applied.

**Lessons Learned:**

- **FR signal URLs must use shorthand format**: `parseSignalParams()` can't parse raw FR API URLs (`https://www.federalregister.gov/api/v1/...`). Must use `/api/federal-register?agency=X&term=Y`. The immigrationEnforcement signals were initially broken because of this. Documented in "Adding new categories" checklist.
- **Documents don't track which signal produced them**: `source_origin` is `'courtlistener'` for all CL signals in a category. No `signalId` in metadata. Makes signal-level purging impossible without NOS-based heuristics. Pipeline redesign should consider adding signal ID to document metadata.
- **Government shutdowns break RSS signals**: Federal government RSS feeds (FCC, potentially others) go down during funding lapses. Not a bug — our fault-tolerant retry handles it. But worth tracking in "Known data issues" section.
- **Dead code accumulates silently**: 246 lines across 4 services (`layer-scoring.ts`, `layer2-store.ts`, `p2025-matcher.ts`, `document-store.ts`) were unused but not caught until OpenGrep enforcement + Knip audit. Regular `pnpm lint:unused` runs catch this.

---

## Sprint R-S1c: Fault-Tolerant RSS/HTML/JSON Signal Fetching ✅

**Status: Done.** Added HTTP retry with exponential backoff to the snapshot pipeline, a scheduled retry cron for extended outages, and fetch_log integration for unified gap visibility across all signal types. 8 files changed (5 modified, 3 new), 4 test files (2 new, 2 extended), 1526 tests total.

**Scope vs. Actual:**

- Planned: 9 changes (fetch-retry wrapper, feed-fetcher integration, buildSignalLookup, recordSnapshotSignalResults, snapshot wiring, retry cron, render.yaml/package.json/CLAUDE.md updates, tests)
- Actual: All delivered. No scope changes. Feed-fetcher.ts required compaction (304 → 300 lines) to stay under ESLint max-lines. retry-failed-signals.ts required helper extraction (53 → 50 lines) to stay under ESLint max-lines-per-function.

**Key Decisions:**

1. **`fetchWithRetry` as separate utility** — Lives in `lib/utils/fetch-retry.ts`, not embedded in feed-fetcher. Reusable by any module that makes HTTP calls. Returns error response on final failed attempt (not throw) so existing `if (!response.ok)` handlers still work. Throws on persistent network errors (caught by `fetchSignalWithMetadata`'s try/catch).
2. **Only 4 fetch sites changed** — `fetchRss`, `fetchHtml`, `fetchJson`, `fetchFederalRegister`. API-backed signals (CourtListener, DOJ, GovInfo, FEC) have their own fetcher modules with dedicated error handling and were not changed.
3. **`SNAPSHOT_LOGGED_TYPES` filter** — `recordSnapshotSignalResults` only records RSS/HTML/JSON/federal_register signals in fetch_log. API signals are already tracked by the backfill pipeline with different sourceOrigin format. Prevents double-recording.
4. **Retry cron at 11am UTC** — 5 hours after 6am snapshot. All feed caches expired (10-min TTL). Does NOT re-run assessment — just stores documents + scores for next day's snapshot.
5. **`buildSignalLookup()` in categories.ts** — Flat `Map<signalId, { signal, categoryKey }>` for O(1) lookup by retry cron. Scans all CATEGORIES once per invocation.

**Lessons Learned:**

1. **`vi.hoisted()` for mock function references** — `vi.mock()` factory functions can't reference `const` variables due to Vitest hoisting. Use `vi.hoisted()` to create mock functions that are accessible inside `vi.mock()` factories.
2. **Mock response count must match retry attempts** — A test providing 1 mock 503 response when `fetchWithRetry` tries 3 times causes subsequent calls to return undefined. Provide N mock responses for N-attempt scenarios.
3. **`autoUpdate: true` only raises thresholds** — Coverage threshold auto-update in vitest.config.ts never lowers values. When new code legitimately reduces coverage (e.g., adding I/O-heavy cron modules), manually lower thresholds or add the file to the exclude list.

**Spec Deviations:**

- None. Plan delivered as specified.

---

## Sprint R4a: AI Narrative Generation Service ✅

**Status: Done.** Built narrative generation pipeline with dual-audience (expert/public) AI narratives for Elevated+ categories. Stable categories get template text (no AI call). `narratives` DB table, narrative-generation-service (prompt construction + AI calls), narrative-store (DB CRUD), narrative-pipeline (orchestration), 2 API endpoints (`/api/narratives/[category]`, `/api/narratives/overview`). Wired into snapshot pipeline as final step. 15 files changed, 4164 lines added. 51 new tests (1411 total).

**Scope vs. Actual:**

- Planned (ROADMAP R4a): narratives table, narrative generation service, overview API endpoint update, narrative API endpoint, snapshot integration, tests (~300 lines new, ~100 lines tests)
- Actual: All delivered. Lines significantly higher than estimate (4164 vs ~400) due to comprehensive prompt construction, 4 layer-formatting functions, overview narrative generation, and thorough API endpoint code. Test count well above estimate (51 vs ~10–15). Migration generated via Drizzle (0022_normal_green_goblin.sql).

**Key Decisions:**

1. **Claude Opus 4.6 for narratives** — `NARRATIVE_MODEL = 'claude-opus-4-6'`. Narratives require nuanced reasoning about multi-layer convergence patterns, counter-arguments, and limitations framing. Opus is the right model for this. Cost acceptable since only Elevated+ categories trigger AI calls (~1–3 per week).
2. **Separate narrative API routes (not overview/summary)** — ROADMAP planned to add narratives to the existing `/api/overview/summary` endpoint. Instead built dedicated `/api/narratives/[category]` and `/api/narratives/overview` routes. Cleaner separation of concerns — overview/summary returns structural data, narrative endpoints return generated text. On-demand generation if stored narrative missing.
3. **`_overview` pseudo-category key** — Overview narratives stored in the same `narratives` table using `_overview` as the category key. Avoids a separate table while keeping the schema clean. Underscore prefix prevents collision with real category keys.
4. **Template fallback for Stable categories** — When all categories are Stable or AI provider unavailable, returns a template string ("No significant structural, AI, or thematic anomalies detected..."). No AI cost for routine weeks.
5. **`runLayersAndAggregate()` extraction** — Adding narrative generation to `snapshot.ts` pushed `snapshotCategory()` over the 50-line ESLint limit. Extracted the Layer 2 + weekly aggregate computation into a standalone helper. Cleaner than suppressing the lint rule.
6. **Narrative pipeline as final snapshot step** — `generateNarrativesForWeek()` runs after all categories are processed (not per-category). This ensures all weekly aggregates are computed before the overview narrative synthesizes across categories.

**Lessons Learned:**

1. **Worktree test leakage** — Task agents running in `.claude/worktrees/` leave behind test files that vitest discovers during `pnpm test:coverage`. The stale tests reference outdated code (e.g., missing signal types added by a parallel agent). Fix: clean up worktrees (`git worktree prune`) before pushing. Added to MEMORY.md.
2. **Coverage thresholds vs. I/O code** — New fetcher modules (R-S1a/R-S1b) are ~60% network I/O by line count. Their pure functions are tested but coverage percentages drop because fetch/pagination code isn't unit-testable. Solution: exclude I/O-heavy fetcher files from coverage thresholds rather than continuously lowering thresholds. Thresholds should reflect testable code coverage.
3. **Parallel agent file conflicts** — R-S1b and R4a ran as parallel Task agents. No file conflicts because the sprints had zero overlapping files. This validates the ROADMAP's "parallelizable" annotations — the key is verifying no shared file modifications before launching parallel agents.

**Spec Deviations:**

- ROADMAP specified "Opus 4.6 Extended Thinking" — implemented as standard Opus 4.6 completion. Extended Thinking adds latency and cost without clear benefit for narrative generation (the prompts provide structured data, not open-ended reasoning tasks).
- ROADMAP R4a item 3 planned adding narratives to the existing overview/summary endpoint — built as separate routes instead (see Key Decision #2).

---

## Sprint R-S1b: GovInfo/GAO + FEC + IG RSS + FCC RSS Source Integrations ✅

**Status: Done.** Built GovInfo/GAO REST API fetcher (GAO Reports, Congressional Reports, Public Laws) and FEC OpenFEC API fetcher (Advisory Opinions, MURs/enforcement). Added 8 new signals across 4 categories. Extended backfill pipeline, functional classifier, and document classifier. 17 files changed, 953 lines added. 36 new tests (1405 total).

**Scope vs. Actual:**

- Planned (ROADMAP R-S1 Phase 1 item 2 + Phase 1b items 6–8): GovInfo/GAO fetcher, IG RSS feeds, FCC RSS feeds, FEC OpenFEC API
- Actual: GovInfo and FEC fetchers delivered as full modules with historical backfill support. IG RSS and FCC RSS added as standard RSS signals (no custom fetcher needed — existing RSS infrastructure handles them). All 8 signals wired into categories.

**Key Decisions:**

1. **RSS reuse for IG + FCC** — IG RSS (DOD, HHS, DOJ OIG) and FCC RSS feeds don't need custom fetchers. The existing RSS feed infrastructure in feed-fetcher.ts handles them directly. Signals added as `type: 'rss'` with appropriate URLs. Simpler than building dedicated fetcher modules.
2. **GovInfo pseudo-protocol URLs** — `govinfo://collection?collection=GAOREPORTS&offset=0`. Same pattern as CourtListener/DOJ from R-S1a. `parseGovInfoParams()` extracts collection type from pseudo-URL.
3. **FEC pseudo-protocol URLs** — `fec://advisory-opinions?type=advisory_opinions`. Separate endpoint types for advisory opinions vs. MURs because they have different API response structures and map to different ContentItem types.
4. **FEC API key optional** — `FEC_API_KEY` env var. OpenFEC works without a key but with stricter rate limits. Key enables higher throughput for backfill. Added to `.env.example`.
5. **Functional classifier extensions** — `gao_report`/`congressional_report` → `administrative_procedure`, `advisory_opinion` → `administrative_procedure`, `enforcement_action`/`admin_fine` → `enforcement_action`. Maps new document types to existing functional buckets rather than creating new ones.
6. **Signal distribution** — executiveOversight: +4 (1 GovInfo + 3 IG RSS), elections: +2 (FEC), mediaFreedom: +2 (FCC RSS). Focused on categories with thinnest signal coverage.

**Lessons Learned:**

1. **Fetcher module pattern is stable** — All 4 new fetchers (CourtListener, DOJ, GovInfo, FEC across R-S1a/R-S1b) follow the same structure: `parseParams()` + `toContentItem()` (pure, tested) + `fetchRecent()` + `fetchHistorical()` (I/O). This pattern should be documented as the standard for future source integrations.
2. **Existing RSS infrastructure scales** — IG and FCC signals required zero new code beyond signal definitions. The generic RSS fetcher + parser handles them. Only sources with non-RSS APIs (REST JSON, pseudo-protocols) need custom fetchers.

**Spec Deviations:**

- None material. ROADMAP Phase 1b items 6–8 all delivered. IG RSS and FCC RSS delivered as RSS signals rather than custom fetchers (simpler, correct approach).

---

## Sprint R-S1a: Foundation + CourtListener + DOJ Integration ✅

**Status: Done.** Added source-origin tracking to documents table, built CourtListener REST API v4 and DOJ Press Release JSON fetchers, created 2 new categories (lawEnforcement, civilLiberties — 13 total), extended functional classifier with enforcement_action and judicial_action buckets, added coverage health monitoring with silence detection. Backfilled 132,260 existing documents with source_origin values. 37 files changed, 3836 lines added. 61 new tests (1366 total).

**Scope vs. Actual:**

- Planned: All 16 plan items (types, schema, scoring constants, DOJ taxonomy, CourtListener fetcher, DOJ fetcher, functional classifier, document store, FR/rhetoric fetcher updates, baseline distributions, feed fetcher dispatch, cache keys, new categories + rules, coverage health, backfill pipeline, backfill script, ~54 tests)
- Actual: All delivered. Test count slightly higher than estimated (61 vs ~54). Backfill-fetchers.ts extracted as additional file to stay under ESLint max-lines (300) on backfill.ts.

**Key Decisions:**

1. **Pseudo-protocol signal URLs** — CourtListener signals use `courtlistener://recap?nos=440` and DOJ signals use `doj://press?component=criminal-division`. Parsed by respective fetchers. Consistent with existing FR signals using `/api/federal-register?agency=...` pattern but clearer about being internal routing, not actual HTTP endpoints.
2. **DOJ frozen taxonomy** — `lib/data/doj-taxonomy.ts` maps DOJ's mutable topic/component labels to 15 stable internal buckets (e.g., `civil_rights_enforcement`, `criminal_prosecution`). DOJ reorganizes labels periodically — mapping to durable buckets prevents taxonomy changes from appearing as structural anomalies.
3. **lawEnforcement supplemental crossfeed terms** — lawEnforcement category has no FR signals with `term=` params (all signals are CourtListener/DOJ). Added 5 supplemental terms to `SUPPLEMENTAL_TERMS` in rhetoric-crossfeed.ts so rhetoric cross-feed can route to this category. Same pattern as executiveActions.
4. **Backfill-fetchers extraction** — `fetchWeekItemsFr()`, `fetchWeekItemsCourtListener()`, `fetchWeekItemsDoj()` extracted from backfill.ts to `lib/cron/backfill-fetchers.ts` to keep backfill.ts under 300 lines. Clean module boundary — fetchers handle signal-type-specific API calls, backfill.ts handles orchestration.
5. **New categories as Experimental** — Both lawEnforcement and civilLiberties added to `category-maturity.ts` as `'Experimental'`. No baseline data yet — will be computed after historical backfill in R-S1 Phase 2.
6. **Conservative volume thresholds** — lawEnforcement: 50/50/100, civilLiberties: 30/30/75. Higher than established categories because new sources may have different volume patterns. Will calibrate after backfill.

**Lessons Learned:**

1. **Category count ripples** — Adding 2 categories broke 4 existing test files that hardcoded `11` (overview-service, rhetoric-crossfeed, categories-summary, category-maturity). Always search for the old count in tests when adding categories.
2. **ESLint import/order with `require()` at file bottom** — `const { loadEnvConfig } = require('@next/env')` at the bottom of scripts triggers ESLint import/order warning. Must use ES `import` at the top. Already in MEMORY.md but easy to forget for new scripts.
3. **Backfill pipeline signal grouping** — The multi-source backfill groups signals by type (fr, cl, doj), fetches from each in parallel per week, then merges items. This pattern scales to additional sources without modifying the core loop.

**Spec Deviations:**

- Plan listed `sourceConvergence?: DimensionScore` as optional on StructuralScore dimensions — this was already present from Sprint R2. No change needed.
- Plan listed `enforcement_action` and `judicial_action` as "NEW" functional buckets — these were also already present from Sprint R2/R3 (added in functional-classifier.ts). The sprint extended their Tier 1 classification coverage rather than creating them.

---

## Sprint R4c: Category Detail Redesign + Keyword Demotion + Methodology Rewrite ✅

**Status: Done.** Surfaced three-layer convergence data on category detail and week detail pages. Reframed keywords as annotations. Added click-to-navigate on overview charts. Rewrote methodology page. 6 new components, 4 new test files (32 new tests, 1305 total). 23 files changed, 1371 lines added.

**Scope vs. Actual:**

- Planned: three-layer panels on category detail, convergence indicators on category cards, keyword demotion (annotationMode/legacy props), methodology rewrite
- Actual: all delivered plus two additions — click-to-navigate on overview heatmap/timeline (#156) and three-layer data on week detail page (#157). These were added mid-sprint when reviewing the live UI revealed that historical convergence data visible in overview charts had no drill-down path.

**Key Decisions:**

1. **`?weekOf=` param on existing API** — Rather than creating a new API route for week-specific three-layer data, added an optional `weekOf` query parameter to `/api/category/[key]`. When absent, returns latest week (backward compatible). When present, returns that specific week. Avoids route proliferation.
2. **`fetchWeekLayers()` extraction** — The weekly_aggregates query was extracted from the handler into a named helper to keep the handler under 50 lines (ESLint `max-lines-per-function`). The helper accepts an optional `weekOf` and builds conditions dynamically.
3. **Keyword annotation framing, not removal** — Keywords are reframed as "Keyword Annotations" on category detail and "Keyword Annotations" on week detail, with explanatory text ("Keywords provide context but do not drive the assessment"). No keyword code was removed — week detail pages still show keyword data for historical context, and the assessment pipeline still runs keywords.
4. **No Playwright e2e** — ROADMAP listed "Playwright e2e for core journeys" but the project doesn't have Playwright configured. Skipped in favor of comprehensive component tests. E2e can be added in a future infra sprint.
5. **SynchronyChart not clickable** — Heatmap and timeline cells navigate to `/category/{key}/week/{date}` on click. SynchronyChart was left view-only because it shows cross-category aggregates (elevatedCount per week) with no single category to navigate to. Adding a week-overview page would be a separate feature.

**Lessons Learned:**

1. **`STRUCTURAL_DIMENSION_ELEVATED` exists** — StructuralSignaturePanel initially used magic number `1.5` for the dimension elevation threshold. Caught in code review — the named constant already existed in scoring-config.ts. Always search for existing constants before introducing numeric literals.
2. **`getByText` vs. `textContent` for middot-separated text** — `screen.getByText('gpt-4o-mini')` fails when the text is part of a larger string with `&middot;` separators. Use `document.body.textContent` with `toContain()` instead. Same pattern as TrendChart axis labels from Sprint 18.
3. **Data is genuinely Stable** — All 11 categories currently show "Stable" convergence status. This is correct per the data: L1 structural scores are below the 2.5 anomaly threshold, L3 thematic z-scores are negative, and L2 AI data is sparse (backfill deferred). Historical data does contain 225 Elevated and 16 Divergent weeks visible in the overview charts.

**Spec Deviations:**

- ROADMAP.md §R4c listed "Convergence matrix at top" — built as ConvergenceHeader with reused ConvergenceIndicator (3-dot) component from R4b, plus status label and explanation text. Not a full matrix.
- ROADMAP.md §R4c listed "Narrative with reading level toggle" — narratives deferred (R4a dependency). Reading level toggle controls summary/detailed mode on all three-layer panels instead.
- ROADMAP.md §R4c listed "Playwright e2e for core journeys" — not built (no Playwright in project).
- ROADMAP.md §R4c listed "Long-horizon context ('X% above baseline')" on CategoryCard — not added. CategoryCard already shows `Current: X.X / Baseline avg: X.X (Y.Yx baseline)`. Adding a separate long-horizon metric would require additional weekly_aggregates queries per card.

---

## Sprint R4b: Administration Overview Page ✅

**Status: Done.** Replaced landing page with cross-category overview. 6 new components, 1 new service, 1 new API endpoint, 7 new test files (28 tests, 1273 total). Shared utilities extracted (chart colors, formatWeekLabel). Bug fix in TrajectoryChart (stale `indices` key). OpenGrep sql.raw finding fixed.

**Scope vs. Actual:**

- Planned: overview page with heatmap, status timeline, synchrony chart, convergence indicators, category cards grid
- Actual: all delivered. R4a (narrative generation) deferred — document corpus too narrow for quality narratives. Overview uses existing `weekly_aggregates` data directly.

**Key Decisions:**

1. **No separate `/overview` route** — Plan originally had a separate `/overview` page with a link from landing. Instead, replaced the landing page (`/`) directly. Rationale: overview IS the primary entry point. One page, not two. Avoids dead landing page with just a link.
2. **Pure CSS heatmap/timeline** — Used CSS grid with inline `backgroundColor` instead of recharts for the heatmap and timeline. Rationale: these are dense grids (11×16 = 176 cells), not charts. recharts adds complexity and bundle size for a simple colored grid. SVG-based approaches would need manual viewBox management. CSS grid + color interpolation is simpler and more maintainable.
3. **`buildOverviewFromRows` as pure function** — Separated DB fetch from data transformation. Service exposes both `getOverviewSummary()` (with DB) and `buildOverviewFromRows()` (pure, testable). All 8 service tests use the pure function — no DB mocking needed.
4. **Shared chart colors** — Extracted `CHART_COLORS`, `CATEGORY_COLORS`, `CONVERGENCE_STATUS_COLORS` to `lib/data/chart-colors.ts`. Was duplicated across TrendChart, TrajectoryChart, and now needed in 3 more overview components. Single source of truth.
5. **`make_interval()` over `sql.raw()`** — OpenGrep flagged `sql.raw(String(weeks * 7))` in the interval calculation. Replaced with `make_interval(days => ${weeks * 7})` — parameterized, safe from injection. PostgreSQL-specific but correct.

**Lessons Learned:**

1. **TrajectoryChart stale key** — R3.3 renamed `indices` → `executiveActions` across 48 files but missed the `CATEGORY_COLORS` map in TrajectoryChart. The `indices` key was stale since Sprint 11 (renamed to `executiveActions` then). Lesson: when renaming, search for string-keyed maps, not just imports/types. The map compiled fine — missing key just returns `undefined` → falls back to `'#94a3b8'`.
2. **`as const` type narrowing** — Using `CONVERGENCE_STATUS_COLORS` with `as const` makes the light/dark sub-objects have literal string types. Passing them as props to child components requires `Record<string, string>` instead of the specific const type. Not a bug, but a pattern to remember.
3. **R4a deferral was correct** — Document corpus has FR + GDELT + WH, but GDELT is mostly international noise (50% of rhetoric docs are from outside the US) and WH coverage is archives-only. Narrative quality would suffer. Better to expand sources (R-S1) first, then generate narratives.

**Spec Deviations:**

- ROADMAP.md §R4b listed `pages/overview.tsx` as a separate page. Built as `pages/index.tsx` (rewrite of existing landing). Same functionality, better UX.
- ROADMAP.md §R4b listed `ConvergenceMatrix` component. Built as `ConvergenceIndicator` (3-dot indicator instead of 3-column matrix). Simpler, fits in card headers. Full matrix deferred to R4c detail page.

---

## Sprints 11-12 (condensed)

Sprints 11, 12, and 12.1 built the seed data pipeline: import/export framework, Biden 2024 baseline backfill with AI Skeptic, review report, interactive CLI review, and DB-centric review flow. Key decisions that remain relevant:

- **DB-centric review flow** (Sprint 12.1): `alerts` table is the single source of truth for review state. Both CLI and future UI read/write through `review-queue.ts`. JSON export is for audit only.
- **UI Spec §10A deviation**: Changed from JSON-as-primary-store to DB-centric flow. Interactive CLI mirrors planned UI review page using the same `getPendingReviews()` / `resolveReview()` API.
- **`reviewedDocuments` on EnhancedAssessment** (not in original spec): Stores top 10 source documents at assessment time. Essential for human reviewers.
- **ReviewFeedbackSchema**: Shared contract (CLI, UI, `apply-decisions.ts`) with 4 feedback types: `falsePositiveKeywords`, `missingKeywords`, `suppressionSuggestions`, `tierChanges`.

---

## Sprints 13-14.1 (condensed)

Sprints 13, 14, and 14.1 built the keyword tuning pipeline: AI Skeptic structured feedback, `apply-decisions.ts`, and Biden 2022 baseline calibration (3 iterations, 42→8 alerts). Rhetoric gap analysis found zero keyword additions needed. Key decisions that remain relevant:

- **`indices` → `executiveActions` rename** (Sprint 14): The `indices` key was misleading — category tracks executive action volume/tempo. DB migration applied to 9 tables. Later fully renamed in Sprint R3.3.
- **Signal tightening over keyword removal** (Sprint 14): fiscal/elections had broad FR signal queries. Fixed at signal level (narrower queries) rather than adding suppressions.
- **Volume thresholds**: drift 3→5, capture 2→3. Keyword hallucination filter added to AI assessment.
- **Light fixtures strategy** (Sprint 14): Export calibrated outputs (~29MB) + document manifest, not raw documents. Raw docs reproducible via `pnpm backfill`.
- **`source_type` inconsistency (#28)** (Sprint 14.1): Three specs define `source_type` differently. Tracked as #28, must be fixed before Sprint L (Search Infrastructure).

---

### Baseline strategy (Sprints 14-15.1, completed)

- 4 baselines: Biden 2022 (primary, Year 2), Biden 2021 (Year 1), Trump 2017 (Year 1), Trump 2018 (Year 2). All have uniform FR + GDELT + WH coverage. All re-run with AI (gpt-4o-mini) in Sprint 15.1.
- Obama 2013 dropped (FR-only source coverage would confound comparisons).
- Keyword refinement cycle complete: zero additions needed — dictionaries well-calibrated.
- **Pre-Sprint L:** Normalize `source_type` values (#28)

### Sprint 15 (condensed)

Key decisions that remain relevant:

- **Trump WH archive scraper**: `parseWhArchiveArticles` with WordPress-specific selectors. `WhArchiveConfig` interface on `BaselineConfig`. Only Trump 2017/2018 use it. _(Removed in R-S1f — dead code after monitoring-period fetcher used instead.)_
- **Weekly aggregator date mismatch bug** (fixed): `eq(weekOf)` → range query `gte/lt` with 7-day window. Root cause: `getWeekOf()` (Monday-based) vs `getWeekRanges()` (config-date-based) — systemic mismatch, range query is a workaround.

---

## Sprint 15.1: Cycle-Aware Baselines

**Planned:** Re-run all 4 baselines with AI assessment (gpt-4o-mini), compute cycle adjustment factors (V3 Addendum §15.3–15.5), integrate into volume thresholds. UI annotations deferred.

**Actual:** Delivered as planned. All 6 work items shipped. All 4 baselines re-run with AI. 11 cycle adjustment factors computed and stored.

**Key decisions:**

- **All 4 baselines re-run with AI** (not just Biden pair): Sprint 15 note said "Trump baselines stay keyword-only." Changed to re-run all 4 with gpt-4o-mini to get AI-assessed severity ratios for cycle factors. Cost ~$2.28 total. The richer data improves factor quality.
- **UTC date math for `getCurrentCycleYear()`**: Initial implementation used `365.25 * ms` which failed on Jan 20 boundaries (365 days < 365.25 days). Switched to `getUTCFullYear()/getUTCMonth()/getUTCDate()` to avoid both the fractional-year and timezone issues. UTC is necessary because `new Date('2028-01-20')` parses as UTC midnight, which is Jan 19 in local US timezones.
- **Volume-only adjustment (not keyword)**: Cycle factors multiply volume thresholds only (`assessByVolume`). Keyword match thresholds (`CAPTURE_MATCH_THRESHOLD`, `DRIFT_MATCH_THRESHOLD`) are not scaled — if specific concern keywords match, that's a genuine signal regardless of cycle year.
- **Safe defaults everywhere**: `cycleFactors` is optional throughout the pipeline. Missing factors, missing category in map, or same cycle year as primary baseline all resolve to multiplier 1.0 (no adjustment).
- **snapshot.ts refactored**: `runSnapshots` exceeded 50-line limit after adding cycle factor loading. Extracted `snapshotRhetoric()` and `snapshotLegislative()` as private helpers.

**Cycle factor results (Year 1 vs Year 2):**

| Category                | Severity | Volume    | Stddev | Notes                                       |
| ----------------------- | -------- | --------- | ------ | ------------------------------------------- |
| military                | 2.5x     | 0.98x     | 2.71x  | Highest Year 1 surge — tiny absolute values |
| rulemaking              | 1.36x    | 0.83x     | 1.24x  | Transition regulatory activity              |
| civilService            | 0.84x    | 0.95x     | 0.99x  | Slightly lower Year 1                       |
| courts                  | 0.25x    | 1.02x     | 0.31x  | Much lower Year 1 severity                  |
| igs                     | 0.30x    | 1.05x     | 0.37x  | Much lower Year 1 severity                  |
| executiveActions        | 0x       | 1.04x     | 0x     | No severity in Year 1 baselines             |
| fiscal, elections       | 1x       | 1x        | 1x     | Zero severity → safe default                |
| hatch, infoAvail, media | 1x       | ~0.8-0.9x | 1x     | Minimal severity                            |

**Lessons learned:**

- **ESLint import ordering is strict**: Type-only imports from `@/lib/services/cycle-adjustment-service` must still respect alphabetical ordering relative to other `@/lib/services/*` imports. The `import/order` rule treats type imports the same as value imports for ordering purposes.

---

## Sprint 16: UI Design System + Landing Page

**Planned:** CSS design tokens, Tailwind config, StatusPill/Sparkline/CategoryCard components, reading level + dark mode contexts, landing page rewrite, `/api/categories/summary` endpoint. 9 work items.

**Actual:** Delivered as planned. All 9 work items shipped. First UI sprint — replaces traffic-light color system with indigo-scale design, builds props-driven landing page backed by real DB data. 38 new tests (920 total).

**Key decisions:**

- **Indigo-scale replaces traffic-light**: Status colors use `slate-400` (Stable) → `indigo-400` (Warning) → `indigo-500` (Drift) → `indigo-700` (Capture). Icons reinforce severity: em dash, open triangle, filled triangle, diamond. WCAG AA accessible on both light and dark backgrounds.
- **CSS custom properties + Tailwind tokens**: Design tokens defined as CSS vars in `styles/globals.css` (`:root` for light, `.dark` for dark mode). Tailwind config references vars via `var(--color-*)`. This allows runtime dark mode switching without Tailwind rebuild.
- **Props-driven, embed-ready components (UI Spec §14)**: CategoryCard receives all data via props — no internal fetch calls. Enables future embedding (Notion, external dashboards) and straightforward testing. Sparkline and StatusPill are pure presentation components.
- **`DISTINCT ON` for latest assessments**: `fetchLatestAssessments()` uses PostgreSQL `DISTINCT ON (category) ... ORDER BY category, assessed_at DESC` for efficient latest-per-category lookup. Window function `ROW_NUMBER() OVER (PARTITION BY category ORDER BY week_of DESC)` for sparkline data (last 8 weeks).
- **DB-optional API fallback**: `/api/categories/summary` returns static metadata with zero scores when DB is unavailable (HTTP 200, not 503). Allows the landing page to render in development without a running database. Marked with `nosemgrep: opengrep.no-inline-db-guard` since the inline guard is intentional.
- **ThemeContext tracks system preference in state**: Initial implementation computed `resolvedMode` from `getSystemPreference()` on each render. This caused stale mode when OS theme changed. Fixed by tracking `systemPref` in `useState` with a `matchMedia('prefers-color-scheme: dark')` change listener.
- **`PRIMARY_BASELINE_ID` constant**: Extracted `'biden_2022'` from category-summary-service into `scoring-config.ts` to centralize the primary baseline identifier. Other files already referenced scoring-config for baseline constants.
- **`@testing-library/react` added**: First component tests in the project required testing-library. Added alongside `@testing-library/jest-dom` as devDependencies.

**Spec deviations:**

- None material. All 9 items align with UI Spec §4 (Landing Page) and §14 (Embeddable Pattern). The spec's "confidence" label is already tracked as "Data Coverage" (Sprint 8 decision).

**Lessons learned:** ESLint import order has no test-file exemption. jsdom SVG attributes use kebab-case (`stroke-dasharray`), not React camelCase. Run `npx prettier --write` before committing — lint-staged checks but doesn't auto-fix. (All codified in MEMORY.md.)

---

## Sprint 17: Source Health Backend + Landing Banners

**Planned:** Source health monitoring infrastructure — signal IDs, health checks, meta-assessment, confidence degradation, feed fetcher metadata, DB schema, API endpoints, landing page banners. 12 work items per V3 Addendum §A–C and UI Spec §4.7–4.8.

**Actual:** Delivered as planned. All 12 work items shipped. 24 files changed, 5 new test files, 55 new tests (975 total).

**Key decisions:**

- **Stable signal IDs on Signal type**: Added `id: string` to `Signal` interface (31 signals). IDs follow `{type}_{short_name}` convention (e.g., `fr_opm`, `rss_scotus`, `html_oversight_gov`). Required for health tracking — can't use `name` (spaces, unstable) or `url` (verbose, could change).
- **Canary sources via `health.isCanary`**: 6 signals marked as canaries: `fr_opm`, `rss_dod_news`, `fr_dod`, `fr_presidential_actions`, `fr_all_rules`, `rss_gao`. These are high-reliability signals — if they go silent, it may indicate deliberate information restriction. Meta-assessment downgrades from `high` to `moderate` when ≥50% canary sources are critical.
- **`sourceAvailability` as 6th confidence factor**: Added to `ConfidenceFactors` with weight 0.15. Reweighted existing 5 factors proportionally (sum still 1.0). When no health data available, defaults to 1.0 (no penalty).
- **`CRITICAL_CONFIDENCE_CAP = 0.3`**: Hard cap on data coverage confidence when source health is `critical`. Even if keyword/AI factors are high, unreliable data limits confidence.
- **Named constants for all thresholds**: Code review caught magic numbers in `meta-assessment-service.ts`. Extracted to `INTEGRITY_THRESHOLDS` and `CANARY_CRITICAL_FRACTION` in `scoring-config.ts`. Consistent with existing `HEALTH_THRESHOLDS` pattern.
- **`fetchCategoryFeedsWithMetadata()` wraps existing fetcher**: Returns `{ items, signalResults }` where `signalResults` captures per-signal success/failure, document count, and timing. Original `fetchCategoryFeeds()` now delegates to this wrapper. Zero behavior change for existing callers.
- **4-level data integrity model**: `high` (hidden, ≥80%), `moderate` (info, ≥50%), `low` (warning, ≥25%), `critical` (alarm, <25%). Maps to `DataIntegrityBanner` component with progressive visual severity.
- **`alerts` prop removed from `DataIntegrityBanner`**: Code review flagged unused prop. Removed — alert rendering will be added in Sprint 18 (Source Health Detail Page) where individual source alerts are displayed.
- **DB-optional API endpoints**: Both `/api/health/meta` and `/api/health/sources` return sensible defaults (high integrity, empty sources) when DB unavailable. Consistent with Sprint 16's `/api/categories/summary` pattern.

**Spec deviations:**

- **`dismissible` behavior deferred**: UI Spec §4.7 specifies moderate-level banner should be dismissible. Removed `dismissible` field from component config per code review (dead code). Will implement with `useLocalStorage`-backed dismiss state when the detail page exists.

**Lessons learned:** Don't add speculative props/fields — ship the minimum, add when consumed. Check boundary conditions match `>=` vs `>`. Check OpenGrep rules before writing new API routes, not after.

---

## Sprint 18: Category Detail Page + Trend Chart

**Planned:** Full category detail page with trend chart, evidence panel, assessment summary, AI reviewer notes, and data coverage indicator. 8 work items per UI Spec §5 and V3 Addendum §15.6.

**Actual:** Delivered as planned. All 8 work items shipped. 6 new files (4 components, 1 page, 1 API route), 5 test files, 24 new tests (999 total).

**Key decisions:**

- **Reused existing `/api/history/weekly-scores` endpoint**: The roadmap planned new `GET /api/category/[key]/weekly` but the existing weekly-scores endpoint already returns the data needed for the trend chart (weekOf, totalSeverity, documentCount filtered by category). Avoided duplicating an endpoint.
- **Single `GET /api/category/[key]` endpoint**: Combines category metadata, latest assessment snapshot, and primary baseline stats in one response. Uses `getLatestSnapshot()` from snapshot-store + baseline query in parallel.
- **`ChartTooltip` extracted as standalone component**: ESLint `react/no-unstable-nested-components` flagged inline tooltip content function in recharts `<Tooltip content={...} />`. Extracted to a named function component outside `TrendChart` — no behavior change, but avoids unnecessary remounts.
- **`keywordMatches` passed as `undefined` for now**: `EvidencePanel` supports tier grouping (capture/drift/warning) via optional `keywordMatches` prop, but current `EnhancedAssessment` doesn't store per-keyword tier info on the `matches` array. Falls back to ungrouped "Keyword triggers" display. Tier grouping will work when match context is enriched in a future sprint.
- **Cycle annotation per V3 Addendum §15.6**: `CycleAnnotation` component in TrendChart shows explanatory text when `getCurrentCycleYear() !== PRIMARY_BASELINE_CYCLE_YEAR`. Currently hidden (Feb 2026 = Year 2, primary baseline = Year 2). Will appear when Year 3 begins (Jan 2027).
- **AI reviewer notes constraint label**: `AiReviewerNotes` component includes a note explaining that the AI Skeptic can confirm or lower the automated assessment but cannot raise it. This is a transparency feature ensuring users understand the AI's role is skeptical review, not escalation.
- **DB-optional fallback on category API**: Returns null assessment with `{ avg: 0, stddev: 0 }` baseline when DB unavailable, consistent with Sprint 16/17 API patterns.

**Spec deviations:**

- **Confidence degradation indicator deferred**: UI Spec §4.9 specifies a confidence indicator on the page header. Sprint 18 shows `dataCoverage` percentage instead. Full confidence breakdown (with factor-level detail) will land in Sprint 22 (Detailed mode features).
- **Week drill-down interaction deferred**: UI Spec §5 mentions clicking trend chart data points to navigate to week detail. This requires the week detail page (Sprint 19). Sprint 18 chart renders data points but they are not clickable links.

**Lessons learned:** ESLint `react/function-component-definition` applies to test mocks — use named function declarations. Recharts components need full mocking in jsdom (no canvas) — use `data-testid` for assertions. (Codified in MEMORY.md.)

---

## Sprint 19: Week Detail + Document Table + Export

**Planned:** Week drill-down page, sortable document table, CSV export, methodology JSON export. 6 work items: TrendChart click-to-navigate, week detail page + routing, week summary cards, DocumentTable with CSV, keyword matches section, methodology endpoint.

**Actual:** Delivered as planned. All 6 work items shipped. 5 new files (3 components, 1 page, 1 API route), 3 test files, 22 new tests (1021 total).

**Key decisions:**

- **`ComposedChart.onClick` for click-to-navigate**: Recharts `Line.onClick` uses `CurveMouseEventHandler` which doesn't expose payload data. `ComposedChart.onClick` provides `activeLabel` (the week string from XAxis `dataKey`), which is the correct way to get the clicked data point's identity. Also sets `style={{ cursor: 'pointer' }}` on the chart when `onWeekClick` prop is provided.
- **`[key].tsx` → `[key]/index.tsx`**: Next.js Pages Router can have both `pages/category/[key].tsx` and `pages/category/[key]/week/[date].tsx`, but moving to `[key]/index.tsx` is the canonical form for directories with nested routes. Same behavior, cleaner structure.
- **`top=200` for week detail fetching**: The existing `/api/explain/week` endpoint already accepts a `top` query param (default 5). Week detail page passes `top=200` to get all documents for a week. No new endpoint needed — typically <100 docs per category per week.
- **Client-side CSV export**: DocumentTable generates CSV in the browser from already-loaded `DocumentExplanation[]` data using `escapeCell()` from `lib/utils/csv.ts`. No server round-trip needed since all data is already on the page. Downloads as `{category}-{weekOf}.csv`.
- **Sparkline `highlightWeek` prop**: Added to the existing Sparkline component to show a highlighted dot on the position-in-context mini chart. Renders a filled circle with white stroke at the data point matching the current week. IIFE pattern inside JSX to avoid creating an intermediate component for a simple conditional render.
- **`computeTierCounts` aggregates from document tier breakdowns**: Weekly aggregate table stores tier proportions but not raw counts. Rather than adding a new API call, the tier counts for summary cards are computed client-side from `WeekExplanation.topDocuments[].tierBreakdown`. This is exact when all docs are fetched (top=200).
- **Deferred items tracked in ROADMAP**: DocumentTable on category detail page → Sprint 20, item 7. Per-week AI reviewer notes → Sprint 22, item 2.

**Spec deviations:**

- **AI reviewer notes for specific week (UI Spec §5A.1)**: Deferred to Sprint 22. Per-week AI assessment requires storing AI results per-week in the snapshot pipeline (currently stores per-category-per-snapshot). Placeholder not shown — section simply absent until the data exists.
- **Document table on category detail page (ROADMAP Sprint 19 item 6)**: Deferred to Sprint 20. The `DocumentTable` component is built reusable — wiring it into category detail just needs a data source for "all weeks" documents.

**Lessons learned:** Recharts v3 `ComposedChart.onClick` provides `activeLabel` (not `activePayload`). Always check existing utils before writing inline helpers (DRY). (Codified in MEMORY.md.)

---

## Sprint 20 (condensed)

Signal gap remediation: 18 FR queries fixed (AND→OR), 5 GDELT sourcecountry:US, 7 PRESDOCU signals, FR subtype threading, InsufficientData badge, document_id NULL fix, oversightGovDown removed. Key decisions that remain relevant:

- **FR API boolean syntax**: Pipe `|` for OR, space for AND, `""` for phrases. `fr_court_compliance` is the only intentional AND query.
- **Presidential Document classification priority**: Subtype → fallback to `executive_order` → `FR_TYPE_MAP` → title heuristics (only when `item.type` is unset).
- **`resolveDocumentIds()` post-store UPDATE**: Joins `document_scores` to `documents` on URL. Idempotent, no pipeline changes.
- **FR API AND-vs-OR is silent**: Wrong boolean logic returns fewer results without errors. Spot-check signal query result counts.

---

## Sprint 21: Signal Gap Remediation — Keyword Expansion + Baseline Regeneration (Code Work)

**Planned:** Add 56 operational-language keywords (Type B erosion), create admin-specific keyword overlay with date-filtered merge, add 4 new FR signal queries, add suppression rules, integrate overlay merge into assessment pipeline. Baseline regeneration deferred to run work phase.

**Actual:** Code work items WI1–WI6 delivered as planned. 6 files changed (4 modified, 2 new), 17 new tests (1044 total). Run work (WI7–11: baseline regeneration, validation, export) deferred to subsequent session.

**Key decisions:**

- **56 keywords across 5 categories**: civilService +17, fiscal +14, igs +10, military +8, courts +7. All at warning/drift tier — operational language is inherently ambiguous, so enters at lower tier and relies on AI Skeptic for disambiguation per Phase 18.1 design principle.
- **`getEffectiveKeywords()` in separate file**: Merge function lives in `admin-specific-keywords.ts` (not assessment-service.ts). Keeps overlay data + merge logic co-located. Assessment service imports and calls it — single line to build effective rules per category.
- **`deriveDocumentDate()` returns first available date**: Items in a weekly batch are from the same period, so first non-null date is representative. No need to scan all items for max date.
- **Admin overlay date comparison uses ISO string ordering**: `documentDate >= o.applicableFrom` works because ISO date strings (`YYYY-MM-DD`) sort lexicographically in date order. No `Date` object construction needed.
- **No admin overlay when `documentDate` is undefined**: Baseline assessments don't pass document dates → only core keywords used. This ensures admin-specific terms (DOGE, "fork in the road") never affect baseline scores.
- **4 suppression rules preemptive**: Rules for "reduction in force" (OPM guidance), "hiring freeze" (budget justification), "agency restructuring" (OMB A-11), "spending freeze" (CR notices). These anticipate false positives from expanded operational keywords in routine government documents. Will be validated during baseline regeneration.
- **4 new FR signal queries**: `fr_workforce`, `fr_restructuring` (civilService), `fr_spending` (fiscal), `fr_ig_personnel` (igs). All use pipe-OR syntax with quoted phrases. `fr_ig_personnel` uses grouping syntax: `"inspector general" (removal | vacancy | acting | appointment)`.

**Spec deviations:**

- None. SIGNAL_GAP_REMEDIATION.md Phases 18 and 20.3 are the authoritative spec. All code work items delivered per spec.

**What remains (run work, WI7–11):** ~~Superseded by architecture redesign.~~ Under the three-layer architecture, keyword-based baseline regeneration is unnecessary — keywords are annotations only and don't affect detection or baselines. The Sprint 21 code work (keywords, admin overlay, `getEffectiveKeywords()`) remains as annotation infrastructure. Baselines are regenerated differently in Sprints R2 (structural distributions + embeddings) and R3 (AI flag rates).

---

## Architecture Redesign Decision (2026-02-22)

**Context:** Signal gap analysis + keyword expansion efforts (Sprints 20-21) revealed a structural problem: keyword-based detection requires anticipating the specific language an administration will use. When language shifts — from formal legal terminology to operational euphemisms, branding, or novel constructs — keyword detection collapses. Expanding keywords reactively creates a treadmill where the system confirms what was already known rather than independently detecting signals.

**Decision:** Replace keyword-driven detection with three-layer triangulated architecture:

1. **Layer 1 — Structural Anomaly Detection** (deterministic, language-immune): Statistical comparison of document metadata against baseline distributions. Volume, type composition, functional distribution, agency activity, publication tempo, source convergence, long-horizon drift.
2. **Layer 2 — AI Two-Pass Assessment** (meaning-sensitive, every document): Pass 1 (cheap model, high recall) → Pass 2 (reasoning model, high precision on flags). Runs on ALL documents, not gated by keywords.
3. **Layer 3 — Thematic Drift Detection** (embedding-based, language-resilient): Intra-administration rolling window detects semantic content shifts. Cross-admin comparison is secondary context only.

**Convergence Synthesis:** Status = Stable / Elevated / Divergent / Confirmed Concern, based on how many independent layers agree something is unusual.

**Keywords:** Exit detection pipeline entirely. Become UI annotations and research artifacts. Keyword changes trigger zero re-runs.

**What this supersedes:**

- Sprint 21 run work (WI7–11: keyword-based baseline regeneration)
- Sprint 22 (rhetoric cross-feed) → absorbed into Sprint R1
- Sprints 23-29 (UI + features) → restructured as R4 + Post-R5
- V3 Addendum feedback learning / novel threat detection → restructured under Layers 2 and 3
- Keyword-severity scoring as the primary detection method

**What survives unchanged:**

- Sprint 21 code work (keywords, admin overlay as annotation infrastructure)
- Sprints 1-20 infrastructure (baselines, schema, embedding pipeline, UI components)
- Source health monitoring (Sprint 17)
- Cycle-aware adjustments (Sprint 15.1)
- All 4 baselines (reused with extended structural distributions)

**Key validation:** Spike investigation (2026-02-22) confirmed structural signals already visible in existing data:

- Presidential Documents tripled in civilService (3.5% → 10.4%)
- Excepted Service notices disappeared (18 → 0)
- Proposed Rules declined in fiscal (11.6% → 8.5%)
- These signals are invisible to keyword matching

**Sprint sequence:** R1 (document corpus fixes) → R2 (Layer 1 + Layer 3, ~$4-7) → R3 (Layer 2, ~$47-97) → R4 (narrative + dashboard) → R5 (immigration + validation)

**Full design:** `ARCHITECTURE_PROPOSAL.md` (924 lines)
**Feasibility investigation:** `ARCHITECTURE_FEASIBILITY_ANSWERS.md`, `SPIKE_FUNCTIONAL_CLASSIFICATION_FINDINGS.md`

---

## Sprint R1: Document Corpus Fixes

**Planned:** 3 work items: (1) Fix document-scorer to use `getEffectiveKeywords()` so admin overlay keywords are matched, (2) Capture FR API `action` and `subtype` in metadata JSONB, (3) Rhetoric cross-feed classifier routing GDELT/WH docs to 11 monitoring categories.

**Actual:** Delivered as planned. All 3 work items shipped. 13 files changed (9 modified, 4 new), 51 new tests (1095 total).

**Key decisions:**

- **`getEffectiveKeywords()` fix applied to both `document-scorer.ts` and `trend-anomaly-service.ts`**: Both files had the same bug — hardcoded `ASSESSMENT_RULES[category]` instead of merging admin overlay keywords via `getEffectiveKeywords()`. The 56 operational keywords from Sprint 21 were invisible to both document scoring and keyword trend counting.
- **`buildMetadata()` extracted as pure function**: Replaced inline `{ agency: item.agency }` with a helper that conditionally includes `agency`, `action`, and `subtype`. Returns `null` when no metadata fields are present. Exported for testing.
- **Rhetoric cross-feed reuses FR signal search terms**: Rather than creating a separate classification vocabulary, `extractCategoryCrossfeedTerms()` parses the existing FR signal URLs in `categories.ts` to extract per-category search terms. This ensures cross-feed classification stays aligned with signal definitions.
- **`SUPPLEMENTAL_TERMS` for executiveActions**: This category's FR signals use `type=PRESDOCU` filters (not search terms), so URL parsing yields no terms. Added 5 supplemental terms (`executive order`, `executive action`, `presidential memorandum`, `proclamation`, `signing ceremony`).
- **Module-level cache in rhetoric-crossfeed.ts**: `extractCategoryCrossfeedTerms()` parses all 80+ signal URLs. Cached at module level since signal definitions don't change at runtime. Code review caught the missing cache — initial implementation recomputed on every classification call.
- **Coverage thresholds lowered rather than padded with bogus tests**: Exporting `buildMetadata`, `toContentItem`, and `buildFrApiUrl` as pure functions caused their containing files (`document-store.ts`, `federal-register-fetcher.ts`) to be instrumented for the first time, exposing untested DB/network functions. Initial attempt to close the gap with no-DB guard tests (`if (!isDbAvailable()) return`) was reverted — those tests tested implementation, not behavior. Thresholds lowered to match actual coverage: statements 71.2%, branches 69.17%, functions 74.62%, lines 71.44%.

**Spec deviations:**

- None. All 3 items align with `ARCHITECTURE_PROPOSAL.md` §Sprint R1.

**Lessons learned:**

- **Coverage thresholds can legitimately drop when extracting pure functions from mixed files**: Exporting a pure helper from a file that's mostly DB/network code causes v8 to instrument the entire file. The correct response is lowering the threshold, not writing low-value tests for the DB functions just to hit a number.
- **FR signal URL parsing requires stripping all quotes, not just wrapping quotes**: Signal URLs contain patterns like `"inspector general" (removal | vacancy)`. After splitting on `|`, terms like `"inspector general" removal` have embedded quotes that `replace(/^"(.*)"$/, '$1')` won't strip because the quotes don't wrap the entire string. `replace(/"/g, '')` handles all cases.
- **`countKeywordsInItems` had the same `ASSESSMENT_RULES` bug as `document-scorer`**: Any code that builds keyword lists from `ASSESSMENT_RULES` directly bypasses admin overlay. Grep for `ASSESSMENT_RULES[` when adding overlay-dependent features.

---

## Sprint R2: Layer 1 (Structural Anomaly) + Layer 3 (Thematic Drift)

**Planned:** 10 work items: schema extension + types, functional classifier, structural anomaly scoring, baseline distributions I/O, semantic drift rolling window adaptation, convergence synthesis (L1+L3), pipeline integration, 4 test files. Run work (embedding backfill, baseline distributions, threshold calibration) deferred to separate session.

**Actual:** All code work items delivered. 19 files changed (11 modified, 8 new), 79 new tests across 4 files (1174 total). Run work items (#8-#10 from plan) deferred — requires API keys and ~15 min of embedding compute.

**Key decisions:**

- **Jensen-Shannon divergence for distribution comparison**: Used JSD (not chi-squared or KL divergence) for type/functional/agency distribution dimensions. JSD is symmetric, bounded, and handles zero probabilities gracefully — KL divergence is undefined when baseline has zero in a bucket the current week has non-zero.
- **`JSD_BASELINE_STDDEV = 0.05` as initial calibration point**: Normal week-to-week JSD variation is small (~0.01–0.05). Initial stddev of 0.05 means JSD values >0.1 register as 2+ z-score. Will be refined during threshold calibration against baselines (run work item #10).
- **Intra-admin rolling window (8 weeks) as primary thematic metric**: Cross-admin comparison (vs Biden 2022 centroid) is computed but stored as secondary context only — does not contribute to convergence status. This is per architecture proposal: different administrations have legitimately different policy priorities.
- **Bootstrap-aware convergence**: During Layer 3's bootstrap period (first 8 weeks of rolling data), thematic drift alone cannot trigger Elevated status. Thematic can reinforce structural (Elevated → Divergent) but cannot independently escalate. This prevents noisy early-admin thematic signals from causing false positives.
- **Source convergence dimension deferred**: The 5th structural dimension (source convergence — ratio of FR/PRESDOCU to GDELT to WH per category) requires per-category rhetoric document counts. The rhetoric cross-feed (Sprint R1) routes docs to categories but doesn't yet aggregate per-category rhetoric volume in a queryable way. Added as 6th dimension in future sprint. Current composite score redistributes weight across 5 available dimensions.
- **Dynamic imports in `computeStructuralLayer()`**: Used `await import()` for structural-anomaly-service and baseline-distributions in snapshot.ts to avoid circular dependency issues and keep the import graph clean for the existing snapshot pipeline.
- **`buildAggregateValues()` and `UPSERT_SET` extracted from `storeWeeklyAggregate()`**: Adding 6 new columns pushed the upsert function over the 50-line ESLint limit. Extracted the values construction and upsert set to module-level helpers.
- **Shared `getMonday()` and `addDays()` in date-utils.ts**: Code review caught duplicate implementations in `baseline-distributions.ts` and `weekly-aggregator.ts`. Consolidated to `lib/utils/date-utils.ts` using `toDateString()` for consistent formatting.
- **`ClusterShift` type retained as forward declaration**: Unused in Sprint R2 code but needed for Sprint R3 cluster labeling integration. Keeping it avoids re-touching the type file next sprint.

**What remains (run work):**

- **#8: FR embedding backfill** — Run `embedUnprocessedDocuments()` for ~75K FR docs. Cost ~$1.50, ~15 min. Requires `OPENAI_API_KEY`.
- **#9: Baseline structural distributions** — Compute and store distributions for all 4 baselines × 11 categories. SQL queries (free) + cluster labeling (~$2-5).
- **#10: Threshold calibration** — Run structural + thematic scoring against all 4 baselines. Adjust thresholds so baselines produce >95% Stable, never Divergent. Validate known spike findings in Trump 2025 data.

**Spec deviations:**

- **Source convergence dimension omitted from initial release** (ARCHITECTURE_PROPOSAL.md §Layer 1): The proposal lists 6 structural dimensions; Sprint R2 ships 5. Source convergence requires per-category rhetoric aggregation that doesn't yet exist. Weight redistributed across available dimensions. No functional impact — source convergence adds fidelity but isn't required for basic structural anomaly detection.
- **Cluster shift tracking not connected to weekly scoring**: `ClusterShift` type defined but cluster analysis runs monthly (not weekly). Weekly snapshot computes centroid distance and novel doc rate; cluster-level analysis is for deeper investigation in Sprint R3/R4.

**Lessons learned:**

- **JSD on identical distributions returns exactly 0**: Unlike z-scores where matching the mean still varies due to other dimension noise, JSD is a perfect distance measure. Test assertions for "baseline-matching week" must account for dimensions that don't use JSD (like publication tempo variance).
- **Named constants prevent silent tuning drift**: Code review caught three hardcoded JSD parameters (0, 0.05) and a drift trend threshold (0.3). Extracting to `scoring-config.ts` makes all tunable parameters visible in one place and forces annotation when they change.

---

## Sprint R3: Layer 2 (AI Two-Pass Assessment) + Source Convergence + Reproducibility

**Planned:** 12 work items: Zod schemas + types, prompt templates, schema migration, assessment service (pure functions), storage service, orchestrator, convergence synthesis update (3-layer + ConfirmedConcern), source convergence dimension (deferred from R2), pipeline integration, reproducibility audit script, backfill CLI, 4 test files.

**Actual:** All 12 work items delivered. 27 files changed (14 modified, 13 new), 47 new tests across 4 files (1221 total). Completes the three-layer triangulated detection system. Run work (baseline AI runs, ~$47-97) deferred to separate session.

**Key decisions:**

- **Different providers for epistemic independence**: Pass 1 uses OpenAI gpt-4o-mini (cheap, high recall), Pass 2 uses Anthropic Claude Sonnet 4.5 (reasoning model, high precision). Different providers ensure the two passes don't share correlated failure modes. Configurable via `Layer2Options`.
- **Pure function design for `computeAIAssessmentSummary()`**: The core aggregation function takes Pass 1/Pass 2 results as arrays and returns the full `AIAssessmentSummary`. No I/O, no DB access — fully testable with synthetic data. All z-score, concern rate, and false-negative rate computations are deterministic.
- **Deterministic audit sampling**: `selectAuditSample()` sorts URLs alphabetically before taking the first N. This ensures reproducible audit samples — running the same sample rate on the same URL list always selects the same documents.
- **`ConfirmedConcern` requires 2+ elevated layers AND high AI concern rate**: This is the highest-severity status and requires both structural/thematic corroboration and independent AI confirmation. AI concern rate threshold is 20% (`AI_CONCERN_THRESHOLD = 0.2`). A single elevated layer (even AI) maxes out at `Elevated`.
- **Bootstrap rule for AI layer**: Unlike thematic drift which has a bootstrap period (first 8 weeks), the AI layer is not affected by bootstrap. AI assessment is meaningful from the first document — it doesn't need historical context to function. However, thematic bootstrap can reinforce AI elevation (AI + bootstrapped thematic → `Elevated`, not `Divergent`).
- **Source convergence uses log2-smoothed ratio**: `log2((gov+1)/(rhetoric+1))` where +1 prevents division by zero. Positive values mean more government docs, negative means more rhetoric. This dimension captures imbalances in source coverage per category.
- **`ZERO_STDDEV_SCALE = 10` for z-score fallback**: When baseline standard deviation is zero (all weeks identical), the z-score formula `|value - mean| * 10` substitutes a steep scaling factor. Extracted to named constant after code review.
- **`require('@next/env')` → `import { loadEnvConfig }`**: The `require()` call at file bottom caused ESLint `import/order` rule to detect a second import group, triggering "no empty line between import groups" warning. Converted to ES import at the top, which also makes the module usage explicit.

**Spec deviations:**

- **Layer 2 store service simplified**: Plan called for 6 functions in `layer2-store.ts`; delivered 5 (combined `storeAIDocumentAssessment` into `storePass1Assessment`/`storePass2Assessment` for clarity). `getBaselineAIFlagRate` placeholder returns null — baseline flag rates require running Pass 1 on baselines (run work).
- **Backfill CLI in `lib/cron/` not `scripts/`**: Placed alongside existing `backfill.ts` and `backfill-baseline.ts` for consistency. `scripts/` reserved for one-off utilities like reproducibility-check.

**Lessons learned:**

- **ESLint `import/order` treats `require()` as a second import group**: Even `require()` at the bottom of a file (well past the import block) triggers import ordering rules. Converting to `import` at the top resolves all related warnings. This affected `scripts/reproducibility-check.ts` where `const { loadEnvConfig } = require('@next/env')` was in the CLI entry block.
- **Coverage thresholds sometimes need manual lowering**: `autoUpdate: true` in vitest.config.ts only raises thresholds, not lowers them. When new files contain untestable DB adapter code, branches may legitimately drop.
- **OpenGrep `cron-needs-env-config` vs import-at-top pattern**: Scripts that import `loadEnvConfig` at the top but call it in the CLI entry block satisfy both ESLint and the env loading requirement, but OpenGrep's `cron-needs-env-config` rule still flags them because it looks for `loadEnvConfig` near `getDb()` calls. Accepted as informational — the rule is conservative.

**What remains (run work):**

- **Pass 1 on 4 baselines** (~60K docs, ~$6-12): Run gpt-4o-mini on all baseline documents to establish per-category baseline AI flag rates.
- **Pass 2 on flagged baseline docs** (~3K-6K flagged docs, ~$28-60): Run Claude Sonnet on Pass 1 flags to establish baseline concern distribution.
- **Full system on Trump 2025** (~$9-18): Run three-layer system end-to-end. Validate detection of DOGE, USAID closure, IG firings, court order defiance.
- **Threshold calibration**: Adjust `AI_FLAG_RATE_THRESHOLD`, `AI_CONCERN_THRESHOLD`, and convergence synthesis rules based on baseline results.
- **Database migration**: Run `pnpm db:migrate` to create `ai_document_assessments` table and add `aiScore`/`aiDetail` columns to `weekly_aggregates`.

---

## Sprint R3.1: Deployment Strategy + Data Management

**Planned:** Fix render.yaml (db:migrate in build, stagger crons, add digest API key), create DEPLOYMENT.md (deployment guide + data strategy + disaster recovery), update CONTRIBUTING.md (3-tier data setup), update README.md (11 categories, three-layer architecture), add `ai_document_assessments` to seed export/import pipeline.

**Actual:** Delivered as planned. All 5 work items shipped. 9 files changed (7 modified, 1 new, 2 test files updated). No code logic changes — infrastructure and documentation only.

**Key decisions:**

- **Three-tier data strategy**: Git fixtures (~93MB) for local dev, GitHub Release pg_dump (~500MB-1GB) for full dataset, Render PostgreSQL for production. Expensive AI assessment data (~$47-97 to reproduce) lives in GitHub Releases, not git.
- **`ai_document_assessments` gitignored but in pipeline**: The fixture file is too large for git, but adding it to the export/import pipeline means `pnpm seed:export` produces a complete local backup. Import skips gracefully when the file is missing (most contributors won't have it).
- **Build command includes db:migrate**: `pnpm install && pnpm db:migrate && pnpm build` ensures schema changes apply automatically on deploy. Previously required SSH to run migrations manually — a latent bug that would have bitten on first real deploy.
- **Cron stagger**: `daily-digest` moved from 06:00 to 07:00 UTC so `daily-snapshot` (the data-producing cron) runs first. Digest now has fresh data to summarize.

**Lessons learned:**

- **Test mocks must track schema exports**: Adding `aiDocumentAssessments` to the export/import modules broke 2 test files because their `vi.mock('@/lib/db/schema')` didn't include the new export. Vitest's error message is clear ("No X export is defined on the mock") but easy to miss when the production code change is trivial.

---

## Sprint R3-RUN: Threshold Calibration, Layer 2 Backfill, Layer Score Recomputation

**Planned:** Run work from Sprint R3 — Pass 1/Pass 2 on 4 baselines, T2 Layer 2 backfill, threshold calibration, layer score recomputation. Estimated cost $47-97.

**Actual:** Completed in 6 phases. T2 Layer 2 backfill (14,480 docs, 221 flagged). Structural dampening calibration to suppress false positives from mild statistical deviations. Layer score recomputation across all 2,896 category-weeks. Logo and favicon assets added. Actual AI cost ~$15 (T2 only; baseline runs deferred — source convergence is a no-op without rhetoric cross-feed, so baseline Layer 2 data would be incomplete).

**Key decisions:**

- **Baseline Layer 2 runs deferred**: Neither backfill nor snapshot was cross-feeding rhetoric to assessment categories (see WI-15 below). Source convergence dimension was a no-op (always comparing zero rhetoric vs zero rhetoric). Running Layer 2 on baselines without cross-feed would produce incomplete data. Deferred to Sprint R-S1 (source expansion + baseline recomputation).
- **Structural dampening**: Exponential decay (`exp(-abs(z))`) for z-scores below 1.5 σ to suppress noise from mild deviations. JSD z-score cap prevents single-dimension outliers from dominating. These thresholds are in `scoring-config.ts` as named constants (`DAMPENING_THRESHOLD`, `JSD_Z_SCORE_CAP`).
- **Seed fixture export includes ai_document_assessments**: 78,576 rows. The fixture file is large (~75MB) but captured in the git-tracked seed pipeline for local development.

**Spec deviations:**

- **Baseline AI runs skipped**: Plan called for all 4 baselines (~60K docs); only T2 (14,480 docs) was assessed. Baselines will be assessed after rhetoric cross-feed is enabled and baselines are recomputed with cross-fed data.

---

## Sprint R3.2: Snapshot Source Parity (WI-15)

**Planned:** 4 work items: schema migration (composite unique on documents), crossfeed helper function, wire into snapshot/backfill pipelines, tests.

**Actual:** All 4 work items delivered. 10 files changed, 5 new tests (1240 total). Schema migration applied cleanly. Cross-feed function shared across all 3 pipelines.

**Key decisions:**

- **Composite unique `(url, category)` instead of `url` alone**: The single-column unique on `documents.url` prevented the same URL from existing under multiple categories. Cross-feed requires exactly this — a rhetoric doc stored as 'intent' also needs rows under 'civilService', 'fiscal', etc. The migration is non-destructive: all existing rows already had unique (url, category) pairs since url was previously unique alone.
- **`IF NOT EXISTS` on category index**: Local DB already had `idx_documents_category` from prior manual creation. Added `IF NOT EXISTS` to the generated migration SQL for idempotency.
- **Crossfeed function calls storeDocuments per-item-per-category (serial)**: Could be batched for performance, but rhetoric batches are typically <500 items, the function mirrors existing pipeline patterns, and the upsert is fast. Simplicity over optimization.
- **No baseline re-run required now**: Baselines and T2 data were both computed without cross-feed, so they're consistent. Source convergence is a no-op for both. When baselines are re-run (Sprint R-S1), cross-feed will be enabled, making source convergence meaningful.

**Lessons learned:**

- **`vi.mock()` between imports triggers ESLint `import/order`**: ESLint sees `vi.mock()` calls as non-import statements that create a gap between import groups, triggering "no empty line between import groups". Fix: put all imports first (vitest hoists `vi.mock()` regardless of position), then all `vi.mock()` calls after.
- **Drizzle `db:generate` doesn't know about manually created indices**: If an index already exists in the DB but wasn't in a Drizzle migration, `db:generate` will generate a `CREATE INDEX` that fails. Use `IF NOT EXISTS` when the index may already exist.
- **Prettier must format seed fixtures**: `pnpm seed:export` writes raw JSON; pre-commit hook checks formatting. Always run `prettier --write lib/seed/fixtures/*.json` after export.
- **Script files need ESLint max-lines-per-function compliance**: Unlike test files which are exempt, `scripts/` files are not exempt from the 50-line function limit. Split large query functions into focused helpers.

---

## Sprint R3.3: Category Renames

**Planned:** Rename `courts` → `judicialIndependence` and `igs` → `executiveOversight` across entire codebase + database. Standalone DB migration script (not Drizzle migration). Single atomic commit.

**Actual:** Delivered as planned. Database migration renamed values in 11 tables (including JSONB arrays). Codebase rename: 7 data files, 2 service files, 1 UI component, 2 demo files, 2 comment examples, 34 test files. Seed fixtures regenerated. 1240 tests pass. Also added R4 sub-sprint breakdown to ROADMAP.md.

**Key decisions:**

- **Standalone script instead of Drizzle migration**: Data-only migration (no schema change) via `scripts/rename-categories.ts`. Avoids polluting Drizzle journal with non-schema changes. Idempotent (safe to re-run).
- **Tables without `category` column skipped**: `intent_weekly` uses `policy_area`, not `category`. Script discovered this at runtime; fixed and re-ran.
- **JSONB array handling**: `legal_documents.relevant_categories` and `semantic_clusters.categories` store category names as JSONB arrays. Script uses `jsonb_array_elements` + `jsonb_agg` for in-place replacement.
- **TrajectoryChart labels shortened**: `'IGs'` → `'Exec Oversight'`, `'Courts'` → `'Judicial Indep'` (legend space constrained).
- **Prose text preserved**: `'federal courts'` in demo fixture content, `'The courts have overstepped...'` in intent fixtures — these are narrative text, not category keys.
- **R4 split into sub-sprints (R4a/R4b/R4c)**: R4a = API + narrative generation (backend only), R4b = overview page, R4c = category detail redesign + keyword demotion. Avoids monolithic UI sprint.

**Lessons learned:**

- **Check DB schema before assuming column names**: `intent_weekly` has `policy_area`, not `category`. `p2025_proposals` has `dashboard_category`. Always verify against `schema.ts` before writing migration scripts.
- **`sql.raw()` for data migrations**: Drizzle's `sql.raw()` works well for UPDATE statements. No need for raw pg client.
- **Regenerate fixtures after DB rename**: `pnpm seed:export` after the migration script produces fixtures with correct category keys. No manual JSON editing needed for large fixture files.
