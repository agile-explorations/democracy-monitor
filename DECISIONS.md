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

## Sprint 14.1: Rhetoric Gap Analysis + Refinement Cycle

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
- **Biden 2021** — First-year-in-term baseline. 76,946 docs (keyword-only).
- **Trump 2017** — Same-president cross-term baseline (Year 1). 76,749 docs (keyword-only).
- **Trump 2018** — Same-president cross-term baseline (Year 2). 75,063 docs (keyword-only).
- ~~**Obama 2013**~~ — Dropped. FR-only source coverage (no WH archive, limited GDELT). Source asymmetry would confound comparisons.

### Updated sprint sequence

- ~~Sprint 13:~~ **Done** — AI Skeptic structured feedback + keyword tuning pipeline
- ~~Sprint 14:~~ **Done** — Biden 2022 baseline calibration (3 iterations, signal tightening, fixtures)
- ~~Sprint 14.1:~~ **Done** — Rhetoric gap analysis + first refinement cycle (zero additions, dictionaries well-calibrated)
- ~~Sprint 15:~~ **Done** — First-year-in-term baselines + cross-baseline validation
- **Pre-Sprint L:** Normalize `source_type` values (#28)

See ROADMAP.md for full sequence.

---

## Sprint 15: First-Year-in-Term Baselines + Cross-Baseline Validation

**Planned:** Biden 2021 + Obama 2013 baselines with cycle metadata. Cross-baseline validation report.

**Actual:** Scope changed mid-sprint. Obama 2013 dropped (FR-only source coverage). Replaced with Trump 2017 (Year 1) and Trump 2018 (Year 2) baselines — same president, enabling cross-term comparison that neutralizes party/philosophy differences. All 4 baselines have uniform FR + GDELT + WH coverage.

**Key decisions:**

- **Obama 2013 dropped for Trump 2017/2018**: Obama era lacks WH archive scraper and has limited GDELT coverage for 2013. Source asymmetry (FR-only vs FR+GDELT+WH) would confound cross-baseline severity/volume comparisons. Trump WH archive at `trumpwhitehouse.archives.gov` is a WordPress site with reliable pagination, making scraping feasible. The Trump pair also enables same-president Year 1 vs Year 2 comparison.
- **Trump WH archive scraper**: Separate parser (`parseWhArchiveArticles`) due to different HTML structure (WordPress `article.briefing-statement` vs modern WH `article` tags). Archive-specific selectors: `h2.briefing-statement__title a` for links, `p.meta__date time` for dates. Two sections scraped: `/remarks/` (~200 pages) and `/briefings-statements/` (~670 pages).
- **`WhArchiveConfig` interface**: Added to `BaselineConfig` for baselines requiring archive-era WH scrapers. Contains `baseUrl` and `sections` array. Only Trump 2017/2018 use it; Biden baselines use the live WH briefing-room scraper.
- **Keyword-only baselines (--skip-ai)**: All 4 baselines ran without AI assessment. Claude Online review confirmed this is sufficient for cross-baseline validation (volume patterns, source coverage, zero-vs-nonzero severity). Biden 2022 + Biden 2021 will be re-run with `--model gpt-4o-mini` as prerequisite step 0 in Sprint 15.1 (cycle-aware baselines). Trump baselines stay keyword-only — AI budget reserved for Trump 2025 current-period assessments.
- **Weekly aggregator date mismatch bug**: `computeWeeklyAggregate()` used exact-match `eq(weekOf)` but document scores compute Monday-based weeks while `getWeekRanges()` generates weeks from config start date (Friday for inauguration-based periods). Changed to range query `gte/lt` with 7-day window. This bug caused ALL baseline severity/volume to be zero since Sprint 11. Pre-existing bug, not introduced by Sprint 15.

**Spec deviations:**

- **Obama 2013 → Trump 2017/2018** (V3 Addendum §15): Spec called for Biden 2021 + Obama 2013. Replaced Obama with Trump pair for source uniformity and same-president comparison. Sprint 15.1 cycle adjustment factors will use 2 Year 1 baselines (Biden 2021, Trump 2017) averaged against 2 Year 2 baselines (Biden 2022, Trump 2018) — better sample size than planned.

**Lessons learned:**

- **Document scorer and weekly aggregator must agree on week boundaries**: `getWeekOf()` (Monday-based) vs `getWeekRanges()` (config-date-based) is a systemic mismatch. The range-query fix in the aggregator is robust, but the root cause (two different week-alignment strategies) should be unified eventually.
- **Background baseline runs need monitoring**: GDELT rate limiting (HTTP 429) extends 265-call runs significantly. Exponential backoff (10s/20s/40s) handles it gracefully but runs take 30+ minutes. One "Malformed JSON after retries" error per ~265 calls is normal — lost ~250 docs out of 65,000+.
- **Cross-baseline validation is only meaningful with non-zero data**: The weekly aggregator bug meant Sprint 11-14 baselines stored zeros. Always verify a sample of stored values before building reports on top of them.

**Validation findings:**

- military: 2.5x Year 1/Year 2 severity ratio (but tiny absolute values — 0.04 vs 0.01; within noise range)
- civilService: Highest absolute severity across both admins (0.05–0.11); driven by routine OPM keywords
- rulemaking: Most structurally coherent pattern — Year 1 > Year 2, Trump > Biden Year 2 (consistent with transition regulatory activity)
- elections, fiscal: Zero severity across all baselines (correct — concern keywords shouldn't fire during normal governance)
- No source asymmetry across any baseline pair

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

**Lessons learned:**

- **ESLint import order applies to all files equally**: Test files with `vitest` imports must still sort them alphabetically relative to external packages (`@testing-library/react` comes before `vitest`). The `import/order` rule has no test-file exemption.
- **jsdom SVG attribute casing**: React uses camelCase for SVG attributes (`strokeDasharray`), but jsdom renders them in kebab-case (`stroke-dasharray`). Use `getAttribute('stroke-dasharray')` in tests, not the React prop name.
- **Prettier reformats after `npx prettier --write`**: Always run prettier on modified files before committing. The pre-commit hook (`lint-staged`) checks but doesn't auto-fix.

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

**Lessons learned:**

- **Code review catches dead code early**: The `alerts` prop and `dismissible` field were speculative features that should have been deferred from the start. Better to ship the minimum and add when the consuming code exists.
- **`computeHealthSummary` threshold edge cases**: Test initially used 2 sources (1 unhealthy = 50%) and expected `'degraded'`, but `criticalSourceFraction` is `>= 0.5`. Need 3+ sources to test the degraded band (25-50%). Always check boundary conditions match `>=` vs `>`.
- **OpenGrep findings should be addressed before commit, not after**: The `no-inline-method-guard` and `no-inline-error-format` rules caught patterns that should have been avoided during initial implementation. Check OpenGrep rules before writing new API routes.

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

**Lessons learned:**

- **ESLint `react/function-component-definition` applies to test mocks too**: Arrow function mock components in `vi.mock('recharts', ...)` triggered the rule. Must use named function declarations (`function MockLine() { ... }`) even in test mock factories.
- **Recharts components need full mocking in jsdom**: Cannot render recharts in jsdom (no canvas). Mock all components (`ResponsiveContainer`, `ComposedChart`, `Line`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ReferenceLine`) with simple div/null returns using `data-testid` for assertions.
