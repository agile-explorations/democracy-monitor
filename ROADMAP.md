# Democracy Monitor — Roadmap

This document describes the planned sprint sequence for completing the Democracy Monitor system. It bridges the specification documents (which describe _what_ the system does) and GitHub Issues (which track _who is doing what right now_).

**Specification documents:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` — Backend features: source health, feedback learning, novel threat detection, expert contributions (Sprints A-J)
- `UI DESIGN SPECIFICATION V3.md` — UI redesign: information architecture, visual language, component design, admin interface (Phases 1-5)

**Prior work:** Sprints 1-10 built the core dashboard, assessment engine, AI skeptic review, progressive disclosure, snapshot/backfill infrastructure, history page, infrastructure overlay, rhetoric tracking, P2025 pipeline, validation indices, and test coverage. See `MEMORY.md` sprint log for details.

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

Before any UI work begins, we need realistic data in the database. Both the baseline period and the current (T2) period go through the **same** AI Skeptic + human review process. This is critical because false-positive keywords inflate baseline statistics just as they inflate current-period scores — a clean baseline requires the same keyword tuning as clean T2 data.

**Pipeline:**

1. **Generate baseline + T2 backfill** — Run `backfill-baseline` for Biden 2024 and `backfill` for T2 (Jan 20 '25 – present), both with AI Skeptic enabled and both fetching FR + WH + GDELT. Both runs use the same keyword dictionaries and AI provider.
2. **AI-assisted human review** — Generate one targeted review report covering both periods. The report shows only items where the AI Skeptic flagged disagreements: `false_positive` or `ambiguous` keywords, status downgrades, low-confidence assessments. Human reviews flagged items and records approve/override decisions.
3. **Keyword tuning** — Apply approved changes to keyword dictionaries and suppression rules.
4. **Re-score both periods** — Re-run scoring for both baseline and T2 with tuned keywords (skip fetch, skip AI — just re-score from stored documents). Recompute baseline statistics from the clean baseline data.
5. **Commit seed data** — Final fixtures committed to `lib/seed/fixtures/`. New deployments run `pnpm seed:import` — no API keys required.

See V3 Addendum Risk Reminders #12-14 for design rationale.

### AI Cost Estimate

Both baseline and backfill scripts call `enhancedAssessment()` (the AI Skeptic) for each category-week. The AI does first-pass triage that a human will review, so we use `gpt-4o-mini` for bulk runs (daily `snapshot.ts` continues to prefer Claude Sonnet for higher-stakes individual assessments).

**Token estimates per call:** ~4,000 input (system prompt + keyword matches + document summaries + RAG docs) and ~800 output (structured JSON with per-keyword verdicts).

| Period              | Weeks | x 11 Categories | AI Calls  | Cost (gpt-4o-mini) |
| ------------------- | ----- | --------------- | --------- | ------------------ |
| Biden 2024 baseline | ~55   | 11              | 605       | ~$0.61             |
| T2 backfill         | ~55   | 11              | 605       | ~$0.61             |
| **Sprint 11 total** |       |                 | **1,210** | **~$1.21**         |
| Obama 2013 baseline | ~52   | 11              | 572       | ~$0.57             |
| Biden 2021 baseline | ~52   | 11              | 572       | ~$0.57             |
| **Sprint 23 total** |       |                 | **1,144** | **~$1.14**         |
| **All 4 periods**   |       |                 | **2,354** | **~$2.35**         |

gpt-4o-mini rates: $0.15/1M input, $0.60/1M output. For comparison, the same runs on Claude Sonnet 4.5 would cost ~$57 total ($3/1M input, $15/1M output) — 24x more for first-pass triage that gets human review anyway.

**Implementation:** Add a `--model` flag to `backfill.ts` and `backfill-baseline.ts` (default: `gpt-4o-mini`). The `--skip-ai` flag bypasses AI entirely for fast re-scoring runs after keyword tuning.

---

## Sprint Sequence

### Sprint 11: Seed Data Framework + Baseline & T2 Backfill

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

### Sprint 12: AI-Assisted Review Report + Human Review

**Goal:** Generate a targeted review report from AI Skeptic output covering both baseline and T2 periods. Human reviews flagged items.

**Code work (~250 lines new):**

1. Create `lib/seed/review-report.ts` — generates targeted review report filtering to:
   - Keywords the AI assessed as `false_positive` or `ambiguous`
   - Assessments where AI recommended a status downgrade
   - Assessments where AI confidence < 0.7
   - Groups by category, sorted by severity of disagreement
   - Covers BOTH baseline and T2 periods in a single report
   - For each flagged item: keyword, AI assessment, document context, AI reasoning, suggested action
2. Create `lib/seed/review-decisions.ts` — TypeScript schema for the decisions file (`lib/seed/review-decisions.json`) where the human records approve/override for each flagged item
3. Add CLI entries: `seed:review` (generate report), `seed:apply` (apply decisions — Sprint 13)

**Run work:**

- Run `pnpm seed:review` to generate the targeted report from Sprint 11 data

**E2E test:**

- Review report correctly filters to AI-flagged items only (not every keyword match)
- Report covers both baseline and T2 periods
- Report includes document context, AI reasoning, and suggested action for each flag
- Decisions schema validates correctly

**Review gate:** Sprint 12 output goes to human review. Sprint 13 cannot start until the reviewer has completed `review-decisions.json`.

---

### Sprint 13: Keyword Tuning + Regression Fixtures

**Goal:** Apply human review decisions to keyword dictionaries. Re-score both periods. Recompute baseline statistics from clean data. Create regression test fixtures that lock in the reviewed behavior.

**Depends on:** Sprint 12 review gate (human must complete `review-decisions.json`)

**Code work (~300 lines new/modified):**

1. Create `lib/seed/apply-decisions.ts` — reads `review-decisions.json`, applies changes:
   - Updates `assessment-rules.ts` (keyword additions, removals, tier changes)
   - Adds suppression rules for confirmed false positives
   - Generates patch summary for human verification before applying
2. Create `__tests__/fixtures/scoring/known-true-positives.ts` — documents that MUST score at expected tier (from review decisions where human confirmed AI's `genuine_concern`)
3. Create `__tests__/fixtures/scoring/known-false-positives.ts` — documents that MUST be suppressed (from review decisions where human approved AI's `false_positive`)
4. Re-score both baseline AND T2 documents with updated rules (`backfill --skip-fetch --skip-ai` and `build-baseline --skip-fetch --skip-ai`)
5. Recompute baseline statistics from clean, re-scored baseline data (`build-baseline --skip-fetch --recompute-stats`)
6. Re-export updated seed fixtures (including new baseline statistics)
7. Commit final seed data to `lib/seed/fixtures/`

**E2E test:**

- All known true positives score at or above expected tier
- All known false positives are suppressed
- No category has zero scored documents in any week
- Re-scored weekly aggregates differ from pre-tuning fixtures (proving tuning had effect)

**Iterative:** If the first tuning round reveals more issues, this sprint may repeat. Exit criterion: human reviewer signs off that the scoring distribution is reasonable.

---

### Sprint 14: UI Design System + Landing Page

**Goal:** Build the new UI foundation and a working landing page rendering real seed data.

**Depends on:** Sprint 13 (committed seed fixtures)

**Code work (~350 lines new):**

1. CSS custom properties in `styles/globals.css` — full indigo scale, dark/light mode tokens, status colors
2. Extend `tailwind.config.ts` with custom color tokens referencing CSS vars
3. New `components/ui/StatusPill.tsx` — icons (dash/triangle/filled-triangle/diamond) + indigo scale + text label
4. New `components/ui/Sparkline.tsx` — SVG sparkline (200x40) with baseline band
5. New `components/landing/CategoryCard.tsx` — props-driven, embed-ready (per UI spec section 14 pattern)
6. Reading level context provider (`lib/contexts/ReadingLevelContext.tsx`) + toggle component
7. Dark/light mode context + toggle (localStorage + `prefers-color-scheme`)
8. Landing page layout (`pages/index.tsx` rewrite) — positioning statement, card grid, methodology footer
9. API endpoint: `GET /api/categories/summary` — returns 11 categories with current status, score, sparkline data from `weekly_aggregates` + `baselines`

**E2E test:**

- Import seed data, start dev server
- `GET /api/categories/summary` returns 11 categories with sparkline arrays
- Navigate to `/` — 11 cards render with correct statuses from seed DB
- Dark mode toggle switches all colors correctly
- Reading level toggle shows/hides technical keys on cards

**Parallel opportunity:** Can start CSS/component work during Sprint 12-13 review cycle using placeholder data, then wire to real seed data when available.

---

### Sprint 15: Source Health Backend + Landing Banners

**Goal:** Source health tracking, confidence degradation, and landing page integration of data integrity banner and source health summary bar.

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

### Sprint 16: Category Detail Page + Trend Chart

**Goal:** Full category detail page with trend chart, evidence panel, and assessment summary.

**Code work (~350 lines new):**

1. API endpoints: `GET /api/category/[key]/summary`, `GET /api/category/[key]/weekly`
2. Category detail page (`pages/category/[key].tsx`)
3. Trend chart — recharts LineChart with decay-weighted line + baseline band
4. Assessment summary section (AI-generated or template, with "How we could be wrong")
5. Evidence panel — matched keywords grouped by tier, with document links
6. Confidence degradation indicator on page header (UI spec section 4.9)
7. Back navigation to landing page

**E2E test:**

- Click category card on landing page — navigates to `/category/[key]`
- Trend chart renders with correct number of weeks from seed data
- Baseline band visible with correct avg from `baselines` table
- Evidence panel shows keywords from latest assessment
- Back button returns to landing page

---

### Sprint 17: Week Detail + Document Table + Export

**Goal:** Week drill-down pages, sortable document table, and CSV/JSON export.

**Code work (~300 lines new):**

1. API endpoint: `GET /api/category/[key]/week/[date]`
2. API endpoint: `GET /api/category/[key]/documents?from=&to=` (paginated)
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

### Sprint 18: Methodology + Supporting Pages (Summary Mode)

**Goal:** Methodology page plus Infrastructure, Rhetoric, P2025, and Source Health pages — all in Summary mode.

**Code work (~350 lines new):**

1. Methodology page (`pages/methodology.tsx`) — sidebar nav, scoring formula with worked example, interactive keyword explorer
2. Infrastructure convergence page (`pages/infrastructure.tsx`) — convergence status, three theme panels, intensity bars
3. Rhetoric-to-Action page (`pages/rhetoric.tsx`) — Summary table (policy area, what's said, what's done, lag weeks)
4. P2025 page (`pages/p2025.tsx`) — headline percentage bar, by-area breakdown, recent matches
5. Source health page (`pages/health.tsx`) — meta-assessment summary, historical availability chart, per-source detail table
6. Infrastructure convergence banner on landing page (UI spec section 4.3)

**E2E test:**

- Navigate to each page from nav bar — all render with correct data from seed DB
- Infrastructure page shows convergence level computed from seeded weekly data
- Rhetoric table shows 5 policy areas with lag data from `intent_weekly`
- P2025 page shows proposal progress from seeded `p2025_proposals` + matches
- Source health page shows per-source detail from `source_health`
- Methodology keyword explorer shows all categories and tiers

---

### Sprint 19: Admin Auth + Review Queue

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

### Sprint 20: Detailed Mode + Chart Toggles

**Goal:** Detailed mode features across all existing pages.

**Code work (~300 lines new):**

1. Chart toggle tabs on category detail (decay-weighted, running avg, running sum, high-water, severity mix)
2. AI reviewer notes display (UI spec section 5.4) with ceiling constraint label
3. Suppression audit panel — "What was suppressed" column with rule explanations
4. Baseline overlay selector — multi-select pills for up to 2 baselines (UI spec section 13.2)
5. Semantic drift placeholder (disabled with tooltip "Requires baseline centroids — coming in Sprint 22")
6. Document class breakdown, full keyword lists, technical details in Detailed mode
7. Detailed mode content on supporting pages (Rhetoric, P2025, Infrastructure)

**E2E test:**

- Switch to Detailed mode — chart toggles appear, suppression panel visible, technical details shown
- Select second baseline — overlay band renders with different color
- AI reviewer notes show ceiling constraint label
- Switch back to Summary — all Detailed content hidden
- Disabled chart toggles show informative tooltip

---

### Sprint 21: Suppression Learning + Proposals Page

**Goal:** Feedback learning pipeline and admin proposal review interface.

**Depends on:** Sprint 19 (feedback store must exist)

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

### Sprint 22: Novel Threats + Expert Submissions

**Goal:** Semantic novelty detection and expert keyword contribution system.

**Depends on:** Sprint 21 (proposal pipeline must exist for novelty/expert proposals to flow through)

**Code work (~300 lines new):**

1. Baseline centroid computation + storage in `category_baselines` table (V3 Addendum Sprint F)
2. `detectNovelDocuments()` + `detectNovelDocumentsAllCategories()` with AI triage prompt
3. `MIN_NOVELTY_MULTIPLE` and `NOVELTY_DRIFT_TRIGGER` constants in `scoring-config.ts`
4. Expert submission service + `expert_submissions` Drizzle schema (V3 Addendum Sprint H)
5. Backtest engine for submitted keywords (best-effort)
6. Expert submission form (`pages/admin/submissions.tsx`, UI spec section 10C)
7. Rhetoric-to-keyword pipeline — `rhetoric-keyword-pipeline.ts` (V3 Addendum Sprint G section 13.6)
8. Enable semantic drift visualization on category detail (was placeholder in Sprint 20)

**E2E test:**

- Novel document detection flags semantically unusual documents invisible to keywords
- Submit expert keyword — backtest results shown — proposal created with `proposalSource: 'expert_submission'`
- Rhetoric gap detected — keyword proposal generated with `proposalSource: 'rhetoric_pipeline'`
- Semantic drift chart renders on category detail in Detailed mode

---

### Sprint 23: Remaining Baselines + Responsive Polish

**Goal:** Additional baselines (Obama 2013, Biden 2021), first-time onboarding, mobile layouts, performance.

**Code/Run work (~250 lines + live API runs):**

1. Run `build-baseline` for Obama 2013 and Biden 2021 (live FR + GDELT; WH archive availability varies)
2. Export as additional fixture sets, noting source coverage per baseline period
3. First-time visitor onboarding overlay (UI spec section 4.5)
4. Card ordering toggle — "By concern level" / "By category group" (UI spec section 4.6)
5. Mobile layout refinements per feature visibility table (UI spec section 10.2)
6. Performance: lazy loading for charts, virtual scrolling for large document tables
7. Data integrity banner condensed mode for non-landing pages (UI spec section 4.7)

**E2E test:**

- Three baselines available in overlay selector, all render correctly on trend charts
- Onboarding overlay shows on first visit, dismissed, never shows again
- Card ordering toggle reorders grid correctly
- Mobile viewport (< 768px) renders 1-column layout with collapsed sections

---

### Sprint 24: Alternative Sources

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

## Parallel Track Opportunities

Not everything is strictly sequential. Where human review or API runs create wait time:

| While waiting for...                             | Can parallelize...                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Sprint 12 human review of AI Skeptic report      | Sprint 14 UI design system work (CSS vars, components with placeholder data)  |
| Sprint 13 keyword tuning iterations              | Sprint 15 source health backend (starts fresh, no historical data dependency) |
| Sprint 23 live API runs for additional baselines | Sprint 22 novel threat / expert submission code work                          |

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
