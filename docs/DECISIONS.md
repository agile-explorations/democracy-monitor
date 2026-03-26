# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-DATA1 and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

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

---

## Sprint R-SIG: FR Signal Contamination Fix ✅

**Status: Done (issues #451-#455).** Milestone 67.

**Context:** Term-based FR signals in `categories.ts` searched ALL federal agencies via the FR API when no `agency` parameter was specified. This polluted every affected category with noise documents from unrelated agencies — civilService had 91% noise (5,105 FR docs, only 451 from OPM). Systemic: 26 of 32 FR signals lacked agency restrictions. This reframes prior debugging (thin-category problems, L1 false positives, low P2 confirmation rates) as partly corpus contamination.

**Scope vs. Actual:** All 5 issues implemented as planned. No scope changes.

1. Multi-agency support in FR fetcher stack — `parseSignalParams` returns `agencies[]`, `buildFrApiUrl` loop-appends, feed-fetcher and API route updated (#451)
2. 16 signals scoped with `agency=` restrictions, 1 signal terms tightened (`fr_oversight`), 7 cross-agency signals kept intentionally unscoped with nosemgrep comments (#452)
3. `validate:fr-signals` CLI — spot-checks signal queries against FR API for one week (#453)
4. `fr:purge-noise` CLI — deletes FR-sourced documents + derived data per category, respects FK constraints (#454)
5. OpenGrep `unscoped-fr-signal` rule prevents future unscoped signals (#455)

**Key decisions:**

- **Comma-separated agency param** (`agency=opm,eop,omb`) over array param — minimal parser change, backward-compatible with existing single-agency signals.
- **PRESDOCU and executiveActions kept unscoped** — presidential documents are already narrow by type; `fr_all_rules` intentionally captures ALL rules for volume measurement.
- **7 cross-agency signals kept unscoped** — IG oversight, FOIA, media freedom apply to every agency. Restricting would miss relevant docs. L2 AI assessment is the right filter layer.
- **Agency slugs validated against live FR API** — caught `commission-on-civil-rights` → `civil-rights-commission` before commit. Would have silently returned 0 results for civilLiberties.
- **`buildFrRecentUrl` extracted** from `fetchFederalRegister` in feed-fetcher.ts — multi-agency loop pushed function over ESLint max-lines-per-function limit.

**Lessons:**

- **Validate API identifiers against the live API before committing.** Agency slugs are not documented and can't be guessed from agency names (`commission-on-civil-rights` vs `civil-rights-commission`). The validation script would have caught this post-commit, but pre-commit validation is cheaper.
- **LegiScan has the same class of problem** — pure keyword matching on bill title/description, no structural scoping via subjects/committee/bill-type metadata. Lower volume (1,845 docs) but same contamination risk. Must audit next.
