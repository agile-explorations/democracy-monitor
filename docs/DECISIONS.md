# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-FUNNEL: per-source funnel diagnostic with collapse alerting (#547, milestone 97) — ✅ complete 2026-07-30

**Origin**: Top of the #524 follow-on list. The mediaFreedom contamination ran for years — thousands of FR docs retrieved into the category, ~0% ever flagged — invisible because nothing watched the _shape_ of the pipeline per source. Converts that from "a bug we fixed" to "a class of bug we detect."

**Shipped**: `pnpm validate:funnel` — per (category × source_origin), the drop-off across RETRIEVED → RELEVANCE → P1 → P2, with collapse alerting. Wired into the weekly snapshot post-steps (`tryValidateFunnel`): error-tier collapses append to the cron error channel, which the snapshot already funnels into the ops-alert email — so a future contamination auto-pages. Pure collapse logic (`funnel-collapse-checks.ts`, 14 boundary tests) separated from windowed I/O queries (`funnel-validation-queries.ts`) and assembly (`funnel-validation-service.ts`, 9 DB-mocked tests). Exit 2 on error-tier collapse.

**Key decisions:**

- **Granularity = (category × source_origin), not per-signal** (owner). No stored row carries a signal id — it's dropped at storage in `document-store.ts`. Per-signal would need a column + store-time change + full backfill; the coarser view still catches the mediaFreedom case. Filed as future work.
- **Leave-one-out sibling baseline + thin-baseline guard.** A source alerts only when its stage-retention is below _both_ an absolute floor _and_ its category siblings' pooled baseline. This is the false-positive guard: a category that legitimately flags rarely has a low sibling baseline too, so nothing looks anomalous. When siblings are too sparse to trust (< 500 pooled), severity caps at warn.
- **FR live-drop ledger folded into RETRIEVED via anti-join.** Post-#524, contaminated FR docs are live-dropped into `fr_drop_ledger` and never stored as documents; without them RETRIEVED would miss the exact future contamination the diagnostic exists to catch. The `NOT EXISTS` anti-join avoids double-counting the historical-annotation drops that ARE stored.
- **Automated alerting in scope for v1** (owner) — errors auto-page via the existing ops-alert; warns are manual-CLI-only. The catastrophic-absolute rule for sparse-sibling categories (so mediaFreedom-shaped contamination also pages) is filed as **#621**, to be tuned from real warns first.

**Findings from the first prod run**: no error-tier collapses (correct — post-#524 nothing is contaminated); the diagnostic correctly surfaces mediaFreedom/federal_register as a relevance warn (576 retrieved / 90d, 0.5% pass — the FR signal query is broad and #524's filter catches it). Thresholds validated as reasonable; no false positives.

**Lessons learned:**

- **Detoast discipline is a query-design constraint, not an afterthought** — `length(documents.content)` in an unbounded aggregate hangs on the ~6GB TOASTed column; the funnel's mandatory window keeps it in the same safe envelope the L2 queries use. Named the rule in the file header so the next author doesn't reintroduce it.
- **A diagnostic's severity model is a product decision, not a threshold tweak** — whether mediaFreedom-shaped contamination pages or merely warns turns on the thin-baseline guard, and that's the owner's alert-fatigue call. Surfaced it as such rather than picking silently.

---

## Sprint R-DHS-OIG + R-CHRG + R-HARDEN: source expansion + pre-launch security hardening (milestones 94/95/96) — ✅ deployed 2026-07-30 (main @ 1c0b0b0)

**Origin**: Pre-launch push for journalist/subscriber outreach. Two new corpus sources to deepen oversight coverage (DHS OIG reports, Congressional hearing transcripts), plus a catastrophic-first security sprint on the premise that a public civic-tech site will be probed and attacked.

**Shipped — R-DHS-OIG (#600–603, #607)**: DHS OIG as a new document source. **Union routing** = official DHS component tags (server-side `field_dhs_agency_target_id` facet) ∪ title-keyword matches, deduped by report number, tags stored on `metadata.dhsComponents`; immigration subset = ICE/CBP/USCIS. 687 unique reports (2017→now) backfilled to prod, full-text, scored + embedded. #607 bounded-memory PDF extractor (page-capped `pdf-parse`, streamed download, injectable parse seam) so oversized oversight PDFs can't exhaust memory.

**Shipped — R-CHRG (#608–611)**: Congressional hearing transcripts as a **special source** on the CREC pattern (single fetch → content-classified fan-out to categories, stored per url×category). 7 committees, 2,661 unique hearings backfilled. `dateIssued` = hearing _held_ date with a 540-day trailing-window weekly re-query (transcripts publish months late); hearing document class ×0.6, discussion tier; classifier calibrated from a 2019-Q2 rehearsal audit (6k text cap, bare-"oversight" boilerplate excluded). L2 fleet confirmed 23% hearing P2 rate; **101 baseline-era status flips owner-accepted** (mission-correct, e.g. 2018 family-separation week → ConfirmedConcern), NC 6/6 pass, 93% known-event AI coverage.

**Shipped — R-HARDEN (#614–618)**: catastrophic-first blockers only. R1–R3 deleted dead unauthenticated endpoints that wrote the corpus / spent paid AI (verified zero callers); R4/R6 Redis-backed rate limiter (search 20/5min, email 5/hr) with in-memory fallback; R5 excluded subscriber/feedback PII from the public dump; R7/R8 Backblaze B2 off-site backup (compliance-mode Object Lock, ~360-day retention, complete = corpus + PII-tables pair); R9 destructive-migration gate (blocks DROP/TRUNCATE in prod without `CONFIRM_DESTRUCTIVE_MIGRATION`). Fast-follows #619 (headers/admin/SSRF/dep bumps) and #620 (origin↔Cloudflare shared-secret) filed, not built.

**Deploy & owner ops**: develop→main merge `1c0b0b0` (merged tree **byte-identical** to develop — the two "main-only" commits carried already-identical content), pushed after all four pre-push gates ran green on develop; Render cut over clean (one ~5s 502), all deleted routes 404, live endpoints healthy, migration gate a verified no-op (applied-count 48 = journal 48). #613 accept-stale run (1,281 narratives acknowledged, G4h→0, $0). B2 lifecycle 360d set; DB inbound-IP locked to the owner's dedicated VPN IP/32 (prod unaffected — all services connect over Render's internal network); 2FA enabled across every catastrophic + paid account. Cloudflare nameserver switch in-flight at close.

**Key decisions:**

- **Union routing for both sources** — routing correctness was the standing rework risk; official component tags give ground truth, title keywords catch the untagged tail. Validated against DHS component facets before the fetch.
- **Catastrophic-first scoping (owner).** Blockers = the two catastrophe axes only: integrity+cost (unauth corpus-write/paid-AI endpoints, which were also dead code) and data loss (single-account backup blast radius, ungated auto-migrations). Headers/admin-hardening/SSRF are real but recoverable → fast-follow.
- **B2 in compliance-mode Object Lock** — recent backups are immutable even with a stolen key; ~360-day retention is the succession runway. A complete restore needs both objects (PII-free corpus + PII-tables).
- **Public-repo disclosure discipline** — the origin-bypass fast-follow (#620) is filed as non-actionable defense-in-depth, no exploit recipe, because the repo is public.

**Incidents & lessons learned:**

- **`ai_document_assessments.relevant` is Pass-1-only (NULL on P2 rows); P2 verdicts live in `assessment`.** Reported "0 hearing confirmations" wrong for hours until an impossible all-zeros table exposed it. The column semantics are now in the db-operations reference.
- **Never resume `review:backfill` after another prod op has landed documents** — the pass P1-sweeps every unassessed doc in the weeks it visits; a resume swept freshly-landed CHRG docs (cap contained it; it became accidental hearing calibration). Re-scope explicitly instead.
- **No filter pipe between a gated command and its exit check** — `cmd | grep >> log` makes `$?` the grep's, which masked a mid-run `EADDRNOTAVAIL` crash as exit 0. Redirect unfiltered, capture `$?` directly.
- **Marathon laptop→prod jobs need kill-tolerant, year-chunked drivers** — long single connections die on `ETIMEDOUT` / ephemeral-port exhaustion; detached `caffeinate` drivers with per-chunk retry survive.
- **Credential-presence shell checks must use length/`:+` and never echo the value** — a `${VAR:-MISSING}` check printed a real B2 app key (rotated same day). Presence checks only, permanently.
- **Merge via a throwaway git worktree when the dev server is running** (branch-switching corrupts the webpack pack cache) and verify the merged tree is byte-identical to source before pushing to production.

---

## Sprint R-RETRIEVAL: research retrieval quality for journalist outreach (#592–598, milestone 93) — ✅ deployed 2026-07-28

**Origin**: live testing of the outreach plan's 12 sample research questions (probes + 3 syntheses, ~$0.50). Findings drove six issues; owner approved all, including a standing per-query re-rank cost.

**Shipped**: #593 procedural-CREC title demotion (0.12 combined-score penalty, conservative genre list + TS twin); #592 era-stratified retrieval (deterministic era extraction onto the baselines' term windows — named pairs 2×15 slots, across-admins 3×10; user dates intersect windows with surfaced conflicts; removable comparison chips; era-labeled synthesis prompt); #595 attributed provenance + tier legend; #598 query failures throw instead of returning empty; #594 bearing-on-question re-rank (overfetch 2×, gpt-4o-mini, ~$0.0008/query, strict fallback to vector order); #596 conservative tier suggestion (suggest, never override).

**Acceptance (prod re-runs)**: Schedule-F comparison 0→12 docs from 2020 (EO 13957 at #2, 15/15 strata); IM4 T1-vs-T2 gained 14 first-term docs; boilerplate out of every top-5; IG-firings top-10 noise 4→0 with 2.1s docs-phase latency.

**Incident en route**: the #593 deploy broke research search for ~15 min — drizzle sends numeric params as text and `CASE WHEN … THEN $1 ELSE 0` failed, swallowed into empty results. Hotfixed with ::numeric; follow-ups #597 (OpenGrep cast rule) and #598 (fixed in-sprint).

**Lessons learned:**

- **Behavioral verification before deploy applies to ranking changes, not just data ops.** The broken SQL passed unit tests (they covered the TS twin, not the query); only executing against a real DB would have caught it — and did, for every subsequent change in the sprint.
- **Drizzle `${}` params are text: any use inside SQL arithmetic/CASE/comparison needs an explicit cast.** Two incidents from one class (#597 files the lint rule).
- **Empty-on-error is the worst failure mode for a research tool** — a broken query rendered as "the corpus lacks documents," precisely the credibility failure the outreach plan warns about. Errors must look like errors.
- **Deterministic beats clever for query understanding**: regex era-extraction is reproducible from the question text alone, testable against the real outreach questions, and free — the model is reserved for judgment (re-rank), with a fallback that can only improve on baseline.

---

## Sprint R-POPULATION: method-consistent court-category counting (#587, milestone 91) — ✅ deployed 2026-07-28

**Planned vs built**: plan approved as Option D — a local deterministic opinion-scope classifier mirroring the pipeline's collection criteria, applied uniformly to all eras, so counting is method-consistent _by construction_. Built as planned with two mid-sprint discoveries that changed the data definition:

1. **The classifier's first-amendment branch was dropped** (owner decision point flagged on #587): prod diagnostics showed the NOS-docket stream (~1,000/mo) and the FA-search stream (~15/mo matching) both stopped delivering ~April 2026; only the court-queries opinion layer (#528/#556) is steady across every seam. The plan's own principle — counting mirrors current collection — forces v1 = SCOTUS unconditional + circuits/D.D.C. × EXEC_POWER_PHRASES. Any FA branch re-imports the cliff.
2. **Docket stubs contaminated every distribution surface in every era**: the first re-derivation rehearsal made structural scores _worse_ (agency z peaked 11.6σ), exposing that `metadata_only` docket stubs (3,134 in baseline Q1-2022 civilLiberties; 118k embedded corpus-wide) sat inside structural distributions, silence source counts, drift embeddings, theme labels, and baseline centroids. They are `court_opinion` rows, unreachable by the opinion stamp — fixed with a shared `countingEligible()` predicate (stubs + retrieval + counting scope) threaded through all seven query sites. Likely a root cause of the artifacts R-DRIFT had to suppress.

**Key mechanisms**: `documents.counting_scope` flag (migration 0045, NULL = in scope, stamped at ingest + `pnpm scope:backfill` with self-verifying TS↔SQL sample, exit 2 on mismatch); classifier versioned (v1) and documented on the Data page as part of the public data dictionary; `scores:purge-stubs` extended as the purge mechanism; L2 evidence population untouched by construction.

**Prod acceptance** (runbook on #587, four owner-approved baseline writes, $0 AI): 0 status flips across 6,958; 39/39 detection + 6/6 NC; civLib weekly counts continuous across both break dates; mean |agency z| 2.38 pre-seam vs 1.70 post (pre-fix jump +1.38→+5.21); the 2026-03-02 thematic artifact now −1.37 (was +44). Teardown deployed same day: CL registry entry `retroactive: true` (single-switch design from the #587 checklist worked as intended), masks/caveat removed, suppression machinery kept with fixture-based tests.

**Lessons learned:**

- **Counting population ≠ collection population ≠ evidence population.** Naming the three separately dissolved the "can't fix history" problem: history can't be re-collected, but a documented counting rule evaluable from stored fields can be applied to all of it.
- **Rehearse the re-derivation, not just the code.** Both real bugs (dead FA stream, stub contamination) were invisible to unit tests and code review; they surfaced only when the full chain ran against a prod copy and the numbers were compared to expectations.
- **Consistency-by-construction beats fidelity.** The classifier recalls only 54% of what CL's analyzer matched for the exec layer — and it doesn't matter, because both sides of every seam are measured by the same rule. Chasing analyzer fidelity would have been unfalsifiable.
- **Long prod operations need kill-tolerant drivers.** Harness background tasks died repeatedly mid-enrichment; the fix was a detached, stale-aware driver whose every restart resumes from a freshness predicate rather than from zero.

---

## Sprint R-OVERVIEW: landing-page integrity + the CL-seam honesty arc (#584–587) — ✅ code complete, deploys Tue 7/28

**Planned vs built** (2026-07-25/26, develop): planned as a half-day (markers, significant-weeks reframe, dead component). Owner feedback drove five substantive escalations, each catching something analysis had settled too early:

1. Caption legibility → plain-language copy.
2. **Retroactive vs non-retroactive changes**: two of three registry entries were reprocessed across all history — no seam exists; markers now claim discontinuity only where one is real (`retroactive` flag; time-axis markers + suppression consult it).
3. **Per-surface marker semantics**: the concern chart/status timeline are status-derived and verified comparable across the CL seam (confirmed/month 5/10/6/4/7/7/7 — content-based detection + zero-flip gates); status surfaces mark only `affectsConcernStatuses` changes (currently none). Volume surfaces keep the marker.
4. **Mask scope measured, not assumed**: across the seam (new scoring, control categories flat) volume +0.84→−1.17, tempo +1.43→−1.18, type −0.14→+1.39, agency +1.38→+5.21, functional +0.19→+0.86, composite 1.01→1.58; only convergence clean (−0.12→−0.10). Mask widened to all baseline-relative dims incl. Composite; numbers recorded in the code comment and as #587 acceptance criteria.
5. **Fix the data, not just the display** (#587 filed): method-consistent counting population — L2 evidence population untouched so statuses can't flip and re-derivation costs $0 AI; teardown checklist of every interim measure posted to the issue, keyed to the single `retroactive: true` flip.

Also: significant weeks reframed (inauguration = `monitoring_began`, score 20), Concern Score displayed per entry (exact chart formula, `STATUS_WEIGHT` exported as single source), then re-sorted recent-first with event badges when the visible score exposed that the ranking was event-based and undecodable; thematic tooltip fixed to fixed-position below-cell top-z; dead `CategoryDriftHeatmap` removed (kept alive only by its own test — knip counts tests as entries); Data-page downloader caveat added (comment-tagged for #587 removal).

**Lessons learned:**

- **A marker on a time axis is a factual claim** — "before and after are measured differently." Retroactively-applied rule changes make that claim false; only genuine collection seams may mark, and only on the surfaces they actually break.
- **"Compensated" must mean the surface a user is looking at.** Findings suppression protected the panel while the cells still showed the artifact; each rendering surface needs its own honesty treatment.
- **Measure mask scope; don't reason it.** "Count-derived dims only" missed that proportions shift when one source collapses — agency hit +5.2σ through metadata sparsity, and Composite inherited everything.
- **Displaying a number next to a ranking it doesn't drive invites (correct) distrust** — either rank by the visible number or drop the ranking claim.
- **File the teardown with the workaround.** Interim measures documented as a checklist on the fixing issue, keyed to one flag, with tests that will fail loudly on the flip.

**Tuesday runbook (combined with R-STRUCT/R-DRIFT):** verify Monday green → merge develop→main → deploy → `pipeline:repair --from 2025-01-20 --to <last Monday>` (zero-flip gate; re-derives structural + thematic) → `recomputeSignificantWeeks` one-off → saturation + thematic distribution before/afters to #574 → close #573–586, milestones 88–90.

---
