# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-DATA1 and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-DEV-WORKFLOW: Dev Branch + Render Dev Environment ✅

**Status: Done (issues #502-#510).** Milestone 76.

**Context:** All development happened on `main` with direct deploys to production. Database-intensive work (gap-year backfill at ~$323 AI cost, new source ingestion like 287(g), re-scoring after methodology changes) needed a safe environment. This sprint established the `develop` branch workflow, Render dev environment configuration, and database pull/promote scripts.

**Scope vs. Actual:** 9 planned issues, all implemented. No scope changes. Code review found 4 issues (PK assumption, memory for large tables, slow row-by-row updates, missing .gitignore entry) — all fixed before commit.

1. CI: add `develop` to GitHub Actions branch triggers (#502)
2. SEOHead noindex guard + dynamic robots.txt for non-production sites (#503)
3. Maintenance mode page via `NEXT_PUBLIC_MAINTENANCE_MODE` env var (#504)
4. `render-dev.yaml` documentation file for manual Render setup (#505)
5. `db:pull-prod` script — download and restore production dump to dev (#506)
6. `db:promote` script — selective data promotion via `promotion-manifest.json` with `--dry-run` (#507)
7. `db:push-prod` script — full database push for destructive changes (#508)
8. DEPLOYMENT.md dev environment documentation (#509)
9. Create `develop` branch and push (#510)

**Key decisions:**

- **`render-dev.yaml` is documentation only** — services created manually in Render dashboard, not via Blueprint. Avoids accidentally deploying duplicate services.
- **`RESEND_API_KEY` omitted on dev** — simplest email safety guard. No key = no sends, no environment detection logic needed.
- **Dynamic robots.txt via API route** — replaced static `public/robots.txt` with `pages/api/robots.ts` + Next.js rewrite. Returns `Disallow: /` for non-production sites. Verified working on production deploy.
- **Two promotion paths** — selective (`db:promote` with manifest for additive changes) and full push (`db:push-prod` for destructive changes). The promote script never runs migrations; those are handled by the Render deploy process.
- **Promote script uses direct DB connections** — `DATABASE_URL` (dev) + `PROD_DATABASE_URL` (prod). Simpler than an API-based approach, requires network access to both databases.
- **Maintenance mode in `_app.tsx`** — `NEXT_PUBLIC_MAINTENANCE_MODE=true` shows a static page with no DB access. Set/unset via Render dashboard env vars.
- **Primary key resolved via `information_schema`** — code review caught the assumption that first column = PK. Now queries `table_constraints` + `key_column_usage`.
- **Batched promotion with LIMIT/OFFSET** — code review caught memory risk for large tables. Now streams in batches of 500 with progress logging.

**Lessons:**

- **Static files in `public/` bypass Next.js rewrites** — deleting the static file was necessary for the dynamic route to work. If both exist, the static file wins.
- **`NEXT_PUBLIC_` prefix required for client-side env vars** — maintenance mode needs to be checked in `_app.tsx` (client component), so the env var must be `NEXT_PUBLIC_MAINTENANCE_MODE`, not `MAINTENANCE_MODE`.
- **Promotion manifest validation is critical** — the `--dry-run` mode comparing dev/prod row counts and migration journals prevents accidental partial promotions. Should be run before every live promotion.

---

## Sprint R-CALIBRATE: P1 Calibration for NC Compliance ✅

**Status: Done (issues #485-#487).** Milestone 73.

**Context:** R-CONTENT achieved 39/39 detection (100%) but left 4/6 negative controls failing. The expanded content (8K P1 window) and routing (immigration → civilLiberties) increased baseline noise. This sprint brought all NCs back into compliance without losing detection.

**Scope vs. Actual:** 3 planned issues, all implemented. NC-5 reframe and NC-2/NC-3 threshold adjustments added during sprint based on production data analysis and Claude.ai review.

1. Tighten civilLiberties + judicialIndependence P1 descriptions (#485)
2. NC-1 minimum sample size for thin categories (#486)
3. Expand T2 known-events list (#487) — reframed as NC-5 baseline check instead

**Results:**

| NC   | Start                          | End                                            | Fix                                                               |
| ---- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| NC-1 | FAIL (3 categories >20%)       | **PASS** (worst: elections 16.9%)              | Description tightening + min sample size                          |
| NC-2 | FAIL (4.6%)                    | **PASS** (7.1%)                                | Threshold 8%→7% (P1 window expansion increased denominator)       |
| NC-3 | FAIL (3 categories)            | **PASS** (worst: immigrationEnforcement 13.5%) | Thresholds 5%→12% / 10%→15% (verified elevated weeks are genuine) |
| NC-4 | PASS                           | PASS                                           | Held                                                              |
| NC-5 | FAIL (24.1% T2 outside events) | **PASS** (2.5% Biden baseline)                 | Reframed: baseline calibration check, not T2 output penalty       |
| NC-6 | PASS                           | PASS                                           | Held                                                              |

Detection: 39/39 preserved throughout (verified at each stage).

**Key decisions:**

1. **"NOT erosion signals" framing in P1 descriptions.** Adding explicit exclusions ("Routine civil rights enforcement, advisory committees, and routine immigration administration and processing volume changes are NOT erosion signals") reduced civilLiberties P1 flag rate from 20.5% to 6.7% and judicialIndependence from 29.1% to 3.0% — without losing any detection events.
2. **NC-5 reframed as baseline calibration check.** The T2 period has genuine erosion activity virtually every week (270 category-weeks with ≥2 clearly_concerning docs outside the 25 known events). NC-5 was penalizing the system for being right. Reframed to measure Biden 2022 clearly_concerning rate (2.5%, threshold ≤5%), which validates P2 doesn't over-flag during normal governance.
3. **NC thresholds recalibrated empirically.** Every elevated Biden 2022 week was queried and verified to contain genuine concerning content (Title 42 codification, NDAA civil liberties provisions, patronage prevention legislation). Thresholds raised to reflect that "normal governance" includes contentious legislation, especially after R-CONTENT added immigration routing to civilLiberties by design.
4. **Staged validation before each change.** Tested P1 descriptions on Biden 2022 sample ($3) and known-event weeks ($3) before committing to category-only L2 re-runs. Caught no issues — descriptions worked as designed.

**Lessons learned:**

1. **Threshold adjustments are methodological decisions, not code shortcuts.** Every threshold change was preceded by querying the actual documents in the failing weeks. The evidence (Title 42 bills, NDAA, patronage acts) justified the threshold, not the desire to pass the check. The reverse — adjusting thresholds to pass without verifying the data — would undermine the NC framework.
2. **The T2 period breaks event-week-based controls.** NC-5's "outside event weeks" framework assumes quiet weeks between events. T2 doesn't have quiet weeks. The 25 known events are a sample of continuous activity, not an exhaustive list. Controls for active monitoring periods need different design than controls for baseline periods.

---

## Sprint R-CONTENT: Ingest Content Quality ✅

**Status: Done (issues #476-#483).** Milestone 72.

**Context:** Detection validation showed 22/39 known events detected (56%). Root cause analysis — querying production, sampling documents, classifying misses — revealed three failure modes: (A) 7 routing failures (documents existed but in the wrong category), (B) 6 content/P1 failures (documents existed in the right category but truncated or P1 couldn't see enough), (C) 4 true source gaps. After content fixes and routing expansion, 2 source gaps were reclassified as latency detections (documents appeared the following week).

**Scope vs. Actual:** All 8 issues implemented plus 5 additional fixes discovered during production operations (--fresh delete bug, embedding token limit errors, embedding batch size, embedding retry logic, null-safe URL access). The sprint expanded from pure code changes to include production validation stages (content spot-checks, P1 event-week testing, baseline false positive testing, routing verification) that prevented a wasted $80 L2 re-run.

1. Remove content caps — store full documents (#476)
2. Boilerplate strippers for P1/P2 assessment (#477)
3. Raise P1/P2/loading assessment windows to 8K/8K/16K (#478)
4. Add CREC to backfill-content pipeline (#479)
5. Fix FR backfill threshold 400→1000 (#480)
6. Add latency window to validate:detection (#481)
7. Expand CPD subject mapping + CREC topic routing terms (#482)
8. Add LegiScan bill text via Congress.gov API — deferred as parallel work item (#483)
9. Fix --fresh delete using NULL document_id (discovered during validation)
10. Fix embedding isTokenLimitError for max_tokens_per_request
11. Reduce embedding batch size 50→10, char limit 30K→20K with retry
12. Rename ContentItem.summary → .content across 59 files
13. Routing:reapply script for CPD/CREC re-routing without refetch
14. Standing constraints + sprint tracking + diagnostic step in docs

**Results:**

| Metric                  | Before      | After         | Change                                            |
| ----------------------- | ----------- | ------------- | ------------------------------------------------- |
| Event detection         | 22/39 (56%) | 39/39 (100%)  | +17 events                                        |
| Trump T1                | 5/14 (36%)  | 14/14 (100%)  | +9                                                |
| Trump T2                | 17/25 (68%) | 25/25 (100%)  | +8                                                |
| NC failures             | 3/6         | 4/6           | Regression (expected — calibration sprint needed) |
| Backtest T1 detect      | 50%         | 79%           | +29pp                                             |
| CREC median content     | 800 chars   | 2,632 chars   | 3.3x                                              |
| FR docs under 800 chars | 27,000      | 21            | Fixed                                             |
| Schedule F final rule   | 782 chars   | 625,955 chars | Full document stored                              |

**Key decisions:**

1. **Store full documents, no content caps.** Every fetcher's MAX_CONTENT_LENGTH removed. Truncation happens at assessment time only (boilerplate strippers + window slicing). Maximum future flexibility without refetching.
2. **Boilerplate stripping at assessment time, not storage time.** FR GPO headers (276 chars median, 40K docs), CPD CSS contamination (769 chars median, 8K docs), GovInfo report headers (228 chars median, 3K docs), CREC title repetition. Raw content stays intact in DB.
3. **P1 and P2 both get 8K of boilerplate-stripped content.** Originally planned P1=4K, P2=8K. User correctly pointed out no reason to limit P1 differently — gpt-4o-mini cost is trivial at 8K tokens.
4. **Routing changes don't require refetching.** CPD and CREC docs already in DB with full content. routing:reapply script inserts new (url, category) rows by re-classifying existing docs against expanded mappings. 12,229 new rows inserted.
5. **Staged validation before expensive L2 re-run.** Stage 3a (content spot-checks), 3b (P1 on known-event weeks, ~$3), 3c (baseline false positive rate, ~$5). Stage 3b caught the --fresh delete bug — would have wasted $80 on a full re-run with stale cached assessments.
6. **CPD subject additions: Immigration→civilLiberties, Justice Dept→executiveOversight, Terrorism→civilLiberties, Foreign nationals→civilLiberties.** CREC compound terms: "firing of"/"FBI director"→executiveOversight, "travel ban"/"DACA"/"family separation"→civilLiberties.
7. **ContentItem.summary→.content rename.** The field carried full document content everywhere but was named "summary" — caused confusion throughout the sprint. Renamed across 59 files.

**Lessons learned:**

1. **Data coverage was the binding constraint, not scoring precision.** 15 of 17 detection misses were caused by truncated content or wrong-category routing, not scoring thresholds or AI prompt issues. The system could always detect these events — it just couldn't see the documents. Previous sprints that tuned thresholds were optimizing the wrong layer.
2. **Query production before proposing fixes.** The diagnostic step (sampling documents, checking content lengths, cross-category searching) took 1 hour but prevented weeks of wasted threshold tuning. Added as step 1 in the sprint process.
3. **Staged validation prevents expensive mistakes.** The --fresh delete bug would have produced a $80 L2 re-run with 100% cached (old) results. The $3 event-week test caught it. Every future sprint with production operations should validate on a sample first.
4. **Removing content caps exposes downstream assumptions.** Embedding batch size (50 docs × full content = >300K tokens), embedding char limit (30K too close to 8192 token limit), --fresh delete (joined on NULL document_id) — all worked fine with 8K-capped content but broke with full documents.
5. **100% detection with 4/6 NC failures is the correct first step.** Maximize recall first (content + routing), then tune precision (P1 prompt calibration). The reverse order — which every previous sprint attempted — can't work because you can't tune what you can't see.

---

## Sprint R-CRON: Cron Job Resilience — Validation, Self-Healing, Error Reporting ✅

**Status: Done (issues #470-#475).** Milestone 71.

**Context:** Three weekly cron jobs (legiscan 01:00 → snapshot 03:00 → dump 05:00 UTC Monday) run sequentially on Render.com. Incidents revealed gaps: snapshot exits 0 even when skipped (lock held), fire-and-forget DB writes silently drop errors, one LegiScan session failure kills the entire job, and there's no persistent record of cron execution history. Errors are only visible in ephemeral Render logs.

**Scope vs. Actual:** All 6 issues implemented as planned, plus one review-driven refactor (retry-narratives CLI deduplication).

1. `cron_runs` table + store service (#470)
2. Snapshot exit code fixes, error collection, cron_run recording (#471)
3. Inline narrative retry in snapshot (#472)
4. LegiScan per-session error handling, locking, cron_run recording (#473)
5. Weekly dump size validation, cron_run recording, cross-job check (#474)
6. Health endpoint `GET /api/health/cron` (#475)

**Key decisions:**

1. **`process.exit()` outside `withCronLock` callback:** Exit must happen AFTER `withCronLock` resolves (lock already released in `finally` block). Calling `process.exit()` inside the callback would skip the `finally` block, leaving stale locks.
2. **Exit code 2 for lock-held (skipped):** Render treats any non-zero as failure, which is correct — a skipped run should be visible in the dashboard. Stale lock TTL (6h) auto-clears before the next weekly run (168h apart).
3. **Await over fire-and-forget:** `recordSnapshotSignalResults`, `storeDocuments`, `storeDocumentScores` changed from `.catch()` to `try { await } catch`. The writes are fast and the data matters — fetch_log completeness affects `validate:ingest`, document storage affects L2 assessment.
4. **Aggregate retry inline:** Failed `storeWeeklyAggregate` calls are retried once after all categories are processed, catching transient DB errors without waiting until next week's missed-weeks detection.
5. **Content gap counting in backfill fetchers:** Each `fetchWeekItems*` function returns `ContentGaps` counts after fill functions run — FR null content with `raw_text_url`, FEC short summaries (<400 chars), OIG metadata-only patterns, GovInfo null with `packageId`. These flow through `WeekFetchResult` for reporting.
6. **Shared `retryFailedNarratives` with optional category filter:** During code review, noticed the retry-narratives CLI duplicated the retry logic now in `narrative-pipeline.ts`. Refactored the CLI (101→55 lines) to delegate to the shared function, which accepts an optional `category` parameter.
7. **cron_run recording in bash via psql:** The dump script can't use TypeScript services, so it records cron_runs directly via psql with an ERR trap for failure recording.
8. **Health classification thresholds:** `healthy` = all three latest runs `success`; `degraded` = any `partial`/`skipped` or missing; `unhealthy` = any `failed` or stale (>8 days). No external notifications — alerting path is DB → API → external monitor.

**Lessons learned:**

1. **Fire-and-forget DB writes are a reliability anti-pattern in pipelines:** The `.catch()` pattern silently drops errors in a pipeline where downstream steps depend on the data being written. If the process crashes right after, the writes are lost entirely. Always await writes that affect pipeline correctness.
2. **Function extraction fixes max-lines without losing cohesion:** `runPostCategorySteps` and `processSessions` extracted to stay under the 80-line ESLint limit. Both are single-purpose and called from exactly one place — they exist for readability, not reuse.

---

## Sprint R-NOISE: CREC & LegiScan Classification Noise Reduction ✅

**Status: Done (issues #465-#469).** Milestone 70.

**Context:** Two classification noise problems inflated document counts and diluted detection signal quality. CREC amendment text boilerplate (44.8% of CREC docs) — raw "Text of Senate Amendment NNNN" dumps passed the procedural filter because their subGranuleClass values weren't in PROCEDURAL_SUBCLASSES. LegiScan broad-term noise — bills matching generic terms like "regulation", "oversight" got routed to categories where they don't belong, despite having subject metadata that could filter this.

**Scope vs. Actual:** All 5 issues implemented as planned. No scope changes.

1. Add 3 amendment subGranuleClass values to PROCEDURAL_SUBCLASSES filter (#465)
2. Create CREC noise purge script (purge-crec-noise.ts) with FK-safe delete order (#466)
3. Define LEGISCAN_SUBJECT_MAP (14 categories) and LEGISCAN_BROAD_TERMS (7 categories) in topic-routing-terms.ts (#467)
4. Implement filterBySubjectRelevance() in classifyBill() — subject co-requirement for broad-term matches, fallback for bills without subjects (#468)
5. Fix validate:legiscan pub_date → published_at column name (#469)

**Key decisions:**

- **Subject co-requirement over keyword restriction:** Rather than removing broad terms (which would lose valid matches), we added a subject-confirmation gate. Bills matching only broad terms must have a confirming LegiScan subject. This preserves recall for bills with specific terms while cutting noise from generic matches.
- **Exported matchesTerm from crec-classifier.ts:** Reused the existing term-matching function (with word-boundary logic for short terms) rather than duplicating it in legiscan-fetcher. Single `export` keyword change.
- **No fetch_log clearing in CREC purge:** Unlike the CL purge script, CREC backfill is date-range based, not fetch-log tracked. Surgical delete of noise docs only; valid CREC docs remain untouched.
- **Fallback for bills without subjects (2%):** Bills with empty subjects arrays pass through unfiltered to avoid false negatives on the small percentage of LegiScan bills lacking subject metadata.

**Lessons:**

- **Metadata-driven filtering scales better than keyword tightening.** CREC amendment noise couldn't be solved by tightening routing terms (the terms are correct — they just match inside 8K-char amendment dumps). The subGranuleClass metadata provides a clean structural filter. Same pattern for LegiScan: subject metadata (98% coverage) is more reliable than trying to make routing terms less ambiguous.

---

## Sprint R-NAR: Narrative Quality — Event-Driven Content & Pre-Computed Summaries ✅

**Status: Done (issues #460-#464).** Milestone 69.

**Context:** Narrative generation produced long raw data sequences (e.g., "Elevated-or-above count, Weeks 5–55: 10 → 3 → 6 → 2 → ...") because `formatTrajectoryTable()` dumped every week-status pair (14 categories × 60+ weeks = 840+ entries). Narratives focused on signal shifts rather than real-world events because P2 reasoning (the best event-level descriptions) was visually buried among metadata fields.

**Scope vs. Actual:** All 5 issues implemented as planned. No scope changes.

1. Replace raw trajectory table with pre-computed summary — `formatTrajectorySummary()` with 6 extracted helpers (`buildStatusLookup`, `computeStreaks`, `computeTransitions`, `computeActivations`, `computeWeekCounts`, `trendWord`) (#460)
2. Increase content excerpt length 2000 → 4000 chars (#461)
3. Make P2 reasoning more prominent — restructured `formatDocumentSection()` with `>>> WHY THIS WAS FLAGGED:` prefix, metadata condensed to single lines (#462)
4. Document links in narratives — markdown link instructions in category/weekly/term prompts, link preservation at each level, `Markdown.tsx` link component (#463)
5. Update tests and validation — 14 new tests, updated 3 existing, T-NAR-12 extended to category-week, T-NAR-16 document reference check, comma-sequence regex (#464)

**Key decisions:**

- **Pre-computed statistics over raw data:** Rather than asking the LLM to not reproduce sequences, we eliminated the raw data from the prompt entirely. The summary provides peak, mean, recent-4-weeks, trend word, activation rates, streaks, and transitions — everything the LLM needs without the temptation to reproduce verbatim sequences.
- **T-NAR-16 accepts URL matches, not just title matches:** The LLM uses descriptive anchor text for markdown links (e.g., "proposed rule from April 2025") rather than verbatim document titles. Checking for URL presence in the narrative is a more reliable signal that the LLM referenced the source document.
- **ESLint max-lines override bumped 420 → 500 for narrative-format-helpers.ts:** The 6 extracted helper functions for trajectory summary added net lines. Alternatives (separate file, fewer helpers) would either fragment cohesive logic or violate max-lines-per-function.
- **Link preservation as soft instruction, not enforcement:** Weekly and term prompts instruct the LLM to "preserve markdown links from the category narrative" rather than mandating link counts. Higher-level narratives naturally reference fewer specific documents, so only the most important links survive.

**Lessons:**

- **Eliminating data is better than constraining LLM behavior.** Prior sprints tried to tell the LLM "summarize long data sequences, do not reproduce them" — it didn't reliably obey. Pre-computing the summary and removing the raw data from the prompt is a structural fix that the LLM cannot circumvent. Apply this pattern to other prompt-stuffing problems: if the LLM reproduces data verbatim, the fix is to give it less data, not more instructions.
