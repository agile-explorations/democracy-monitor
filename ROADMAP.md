# Democracy Monitor — Roadmap

This document describes the planned sprint sequence for completing the Democracy Monitor system. It bridges the specification documents (which describe _what_ the system does) and GitHub Issues (which track _who is doing what right now_).

**Specification documents:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` — Backend features: source health, feedback learning, novel threat detection, expert contributions (Sprints A-J)
- `UI DESIGN SPECIFICATION V3.md` — UI redesign: information architecture, visual language, component design, admin interface (Phases 1-5)

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
- **Obama 2013** — Second first-year-in-term baseline. Cross-president validation.
- **Biden 2024** (legacy) — Election year with lame-duck dynamics. Kept for comparison but not primary.

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

| Period              | Weeks | x 11 Categories | AI Calls  | Cost (gpt-4o-mini) |
| ------------------- | ----- | --------------- | --------- | ------------------ |
| Biden 2024 baseline | ~55   | 11              | 605       | ~$0.61             |
| T2 backfill         | ~55   | 11              | 605       | ~$0.61             |
| **Sprint 11 total** |       |                 | **1,210** | **~$1.21**         |
| Biden 2022 baseline | ~52   | 11              | 572       | ~$0.57             |
| **Sprint 14 total** |       |                 | **572**   | **~$0.57**         |
| Biden 2021 baseline | ~52   | 11              | 572       | ~$0.57             |
| Obama 2013 baseline | ~52   | 11              | 572       | ~$0.57             |
| **Sprint 15 total** |       |                 | **1,144** | **~$1.14**         |
| **All 5 periods**   |       |                 | **2,926** | **~$2.93**         |

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

**Goal:** Switch to Biden 2022 as primary "steady state normal governance" baseline. Build rhetoric-to-keyword gap analysis for `missingKeywords`. First full keyword refinement cycle with new baseline.

**Depends on:** Sprint 13 (keyword tuning pipeline)

**Code work (~300 lines new/modified):**

1. Run `build-baseline --baseline biden_2022 --model gpt-4o-mini` for Jan 2022 – Dec 2022
2. Create rhetoric-to-keyword gap analysis (`lib/seed/rhetoric-keyword-gaps.ts`): frequency analysis of terms in documents table (source: whitehouse, gdelt) mapped to categories, compared against `assessment-rules.ts` keyword dictionaries. Surfaces terms appearing in N+ rhetoric documents for a category but absent from the keyword dictionary.
3. Integrate `missingKeywords` suggestions into post-session aggregate report
4. Run first full refinement cycle against Biden 2022 baseline: backfill → review → aggregate → apply → re-run → validate
5. Export Biden 2022 as fixture set alongside Biden 2024

**E2E test:**

- Biden 2022 baseline produces data for all 11 categories
- Rhetoric gap analysis surfaces candidate keywords not in current dictionaries
- Aggregate report includes both false-positive removals and rhetoric-sourced additions
- Re-scored Biden 2022 baseline shows improvement after keyword tuning

**Risk:** Biden 2022 is the target "clean" baseline, so keyword tuning should reduce false positives to near zero for this period.

---

### Sprint 15: First-Year-in-Term Baselines + Cross-Baseline Validation

**Goal:** Add Biden 2021 and Obama 2013 as first-year-in-term baselines. Build cross-baseline comparison to validate that keyword dictionaries perform well across different normal governance periods.

**Depends on:** Sprint 14 (Biden 2022 baseline + tuned keywords)

**Code work (~250 lines + live API runs):**

1. Run `build-baseline --baseline biden_2021 --model gpt-4o-mini` for Jan 2021 – Dec 2021
2. Run `build-baseline --baseline obama_2013 --model gpt-4o-mini` for Jan 2013 – Dec 2013 (verify FR + GDELT data availability; WH archive URL structure differs for Obama era)
3. Create cross-baseline validation report (`lib/seed/baseline-validation.ts`): compare flagging rates across baselines by category. Keywords that trigger at Warning+ in all baselines are likely false positives in normal governance. Keywords that only trigger in first-year baselines may capture legitimate transition activity.
4. Run review cycle on new baselines with tuned keywords — should produce significantly fewer flags than Biden 2024 did pre-tuning
5. Export all baselines as fixture sets, documenting source coverage per period

**E2E test:**

- Three baselines available: biden_2022, biden_2021, obama_2013
- Cross-baseline report shows category-level flagging rate comparison
- Tuned keywords produce fewer false positives across all baselines
- First-year baselines show higher activity but lower false-positive rates than pre-tuning Biden 2024

**Risk:** Obama 2013 data availability — WH archive structure differs, GDELT coverage for 2013 may be limited. Verify before committing.

---

### Sprint 16: UI Design System + Landing Page

**Goal:** Build the new UI foundation and a working landing page rendering real seed data.

**Depends on:** Sprint 15 (committed seed fixtures with validated baselines)

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

**Parallel opportunity:** Can start CSS/component work during Sprint 13-14 review cycles using placeholder data, then wire to real seed data when available.

---

### Sprint 17: Source Health Backend + Landing Banners

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

### Sprint 18: Category Detail Page + Trend Chart

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

### Sprint 19: Week Detail + Document Table + Export

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

### Sprint 20: Methodology + Supporting Pages (Summary Mode)

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

### Sprint 21: Admin Auth + Review Queue

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

### Sprint 22: Detailed Mode + Chart Toggles

**Goal:** Detailed mode features across all existing pages.

**Code work (~300 lines new):**

1. Chart toggle tabs on category detail (decay-weighted, running avg, running sum, high-water, severity mix)
2. AI reviewer notes display (UI spec section 5.4) with ceiling constraint label
3. Suppression audit panel — "What was suppressed" column with rule explanations
4. Baseline overlay selector — multi-select pills for up to 2 baselines (UI spec section 13.2)
5. Semantic drift placeholder (disabled with tooltip "Requires baseline centroids — coming in Sprint 24")
6. Document class breakdown, full keyword lists, technical details in Detailed mode
7. Detailed mode content on supporting pages (Rhetoric, P2025, Infrastructure)

**E2E test:**

- Switch to Detailed mode — chart toggles appear, suppression panel visible, technical details shown
- Select second baseline — overlay band renders with different color
- AI reviewer notes show ceiling constraint label
- Switch back to Summary — all Detailed content hidden
- Disabled chart toggles show informative tooltip

---

### Sprint 23: Suppression Learning + Proposals Page

**Goal:** Feedback learning pipeline and admin proposal review interface.

**Depends on:** Sprint 21 (feedback store must exist)

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

### Sprint 24: Novel Threats + Expert Submissions

**Goal:** Semantic novelty detection and expert keyword contribution system.

**Depends on:** Sprint 23 (proposal pipeline must exist for novelty/expert proposals to flow through)

**Code work (~300 lines new):**

1. Baseline centroid computation + storage in `category_baselines` table (V3 Addendum Sprint F)
2. `detectNovelDocuments()` + `detectNovelDocumentsAllCategories()` with AI triage prompt
3. `MIN_NOVELTY_MULTIPLE` and `NOVELTY_DRIFT_TRIGGER` constants in `scoring-config.ts`
4. Expert submission service + `expert_submissions` Drizzle schema (V3 Addendum Sprint H)
5. Backtest engine for submitted keywords (best-effort)
6. Expert submission form (`pages/admin/submissions.tsx`, UI spec section 10C)
7. Rhetoric-to-keyword pipeline — `rhetoric-keyword-pipeline.ts` (V3 Addendum Sprint G section 13.6)
8. Enable semantic drift visualization on category detail (was placeholder in Sprint 22)

**E2E test:**

- Novel document detection flags semantically unusual documents invisible to keywords
- Submit expert keyword — backtest results shown — proposal created with `proposalSource: 'expert_submission'`
- Rhetoric gap detected — keyword proposal generated with `proposalSource: 'rhetoric_pipeline'`
- Semantic drift chart renders on category detail in Detailed mode

---

### Sprint 25: Onboarding + Responsive Polish + Performance

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

### Sprint 26: Alternative Sources

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

| While waiting for...                            | Can parallelize...                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Sprint 13-14 keyword tuning + review iterations | Sprint 16 UI design system work (CSS vars, components with placeholder data)  |
| Sprint 15 baseline API runs + validation        | Sprint 17 source health backend (starts fresh, no historical data dependency) |
| Sprint 25 onboarding + responsive work          | Sprint 24 novel threat / expert submission code work                          |

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
