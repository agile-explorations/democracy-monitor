# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

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

## Sprint R-DRIFT: light up the thematic drift heatmaps (#578–583) — ✅ code complete, deploys Tue 7/28

**Planned vs built** (2026-07-25, develop; rides Tuesday's single deploy + re-derivation with R-STRUCT):

- #578 novelty/variance wiring — as planned, plus empirical threshold calibration (see decisions).
- #579 small-N masking — as planned (`THEMATIC_MIN_DOC_COUNT = 5`, distance tabs only).
- #580 legibility ports — as planned, via generalization rather than copying (`scanStandoutRuns`, shared `buildMarkersByWeek`).
- #581 verification — caught a live defect (see decisions).
- #582/#583 (unplanned, owner feedback on the live panel) — spike detection over static runs; AI theme labels on shifts; methodology-text alignment; comparison basis moved to the panel header.

**Key decisions:**

- **The metrics were never wired, not miscalibrated.** `detectNovelDocuments` and `computeVarianceRatio` existed as exported, unit-tested pure functions in the same file whose result builders hardcoded 0/1 — 100% of 1,042 current-term weeks displayed literal constants. The enabler: the centroid path already fetched every needed embedding and discarded it.
- **Novelty threshold 0.5 = p90, empirically.** The dormant 0.3 default sat at the _median_ of real doc-to-centroid distances and would have flagged half of all documents. Post-calibration: novel rate mean 0.109 / median 0.049 — discriminating.
- **Instrument suppression is direction-dependent per metric family.** Verification caught the CL ingest rework reading as z=+44 _upward_ thematic drift (doc-mix changes move the centroid), while structural volume metrics only lose signal _downward_ — `scanStandoutRuns` takes `suppressDirections` ('below' structural, 'both' thematic).
- **Rolling-window drift z mean-reverts ⇒ spikes, not runs, are the thematic headline.** The window absorbs a real shift within ~2 weeks, so upward drift can't sustain a 3-week run; the first panel render filled with "thematically static" items until spike detection (z ≥ 4) was added and ranked first.
- **Panel = AI headline, tooltip = raw evidence** (owner decision). The hover term lists (TF-IDF, deterministic, auditable) carry _more_ information than the AI phrase; replacing them would have made the detail surface less detailed. Left as complementary layers.
- **Methodology text now matches the computation**: the z denominator is typical _consecutive week-to-week_ centroid movement, not deviations of the distance-from-mean itself, and the current week is never in its own window — /data/thematic, /system/methodology, and ASSESSMENT_METHODOLOGY.md all corrected (the imprecise wording had propagated from the page into the owner's own understanding).

**Lessons learned:**

- **A spec'd field that ships with a constant is worse than an unshipped field** — it renders as a working display. Distribution checks (stddev = 0, value = constant) on stored JSONB fields are one query and would have caught this the week it shipped.
- **Verify suppression logic against each metric's failure direction** — the same instrument change reads downward in counts and upward in centroids.
- **Owner-facing surfaces earn feedback that diagnostics can't** — both #582 issues (static-domination, comparison-basis clarity) came from the owner reading the live panel, minutes after it rendered.

**Prod runbook (Tuesday, with R-STRUCT):** single `pipeline:repair --from 2025-01-20 --to <last Monday>` re-derives structural + thematic; thematic distribution before/after (novel-rate no longer all-zero, variance std > 0) added to #574's gate comment; zero-flip gate unchanged.

---

## Sprint R-STRUCT: make the structural heatmaps carry their weight (#573–577) — ✅ code complete, deploys Tue 7/28

**Planned vs built** (2026-07-25, develop, unpushed; deploy + prod re-derivation ride together after the Monday checkpoint per owner decision):

- #573 empirical JSD baseline stats — as planned. `buildBaselineDistribution` computes each baseline week's JSD against the aggregate distribution; scoring uses the empirical mean/std (floor 0.01) with the old constants as documented, effectively-unreachable fallback.
- #575 "What stands out" panel — as planned (|z| ≥ 2.5 for ≥3 weeks, ranked duration × magnitude, top 8, plain sentences).
- #576 legibility — directional legend, methodology-change tick marks, recent-heat row ordering; owner approved the 3-entry instrument-change registry as-is.
- #577 provenance check — verdict: **instrument drift**. civilLiberties CL rows fell ~1,100→~100/month across the CL rework while non-CL sources rose 66→~200/month. Wired into code, not just prose: below-baseline standout runs ending after a registered change for their category are suppressed.
- #574 prod re-derivation — pending Tuesday (with deploy), zero-flip gate + NC diff + detection + graph; saturation before/after to the issue.

**Key decisions:**

- **Instrument changes are regime shifts, not point events.** First cut suppressed only runs _spanning_ a change date; a test exposed that the post-change regime is exactly the artifact case. Suppression now covers any below-baseline run ending after the change; above-baseline runs are never suppressed (this period's ingest changes only removed volume).
- **Marker registry is code, owner-approved** (`lib/data/instrument-changes.ts`) — one source of truth for both the visual ticks and the findings suppression.
- Standout sentences are composed server-side so the API serves display-ready findings (review finding 2, accepted).

**Diagnostic that drove it** (2026-07-25 prod): agency z saturated >+4 in 76.1% of current-term weeks (mean 6.49), type 40.4% — z divided by hardcoded `JSD_BASELINE_MEAN=0 / STDDEV=0.05`, never calibrated; small-sample weeks always diverge from an aggregate distribution. Local verify after fix (blitz window): agency 76.1%→7.2%, type 40.4%→1.2%, and the story _sharpened_ — civilService tempo z 14.6 with agency correctly ~0–2.

**Lessons learned:**

- **A dimension that alarms every week alarms never.** Constant-red is indistinguishable from broken; saturation percentage is a cheap standing metric for any z-scored display (candidate for a future validate:data check).
- **Never z-score against assumed moments when the empirical ones are already in memory.** The baseline docs were grouped by week in the same function that used hardcoded stats.
- **Before presenting a "quiet period" as signal, check whether the instrument changed.** The most striking pattern in the heatmap (the 2026 CL blue band) was our own pipeline; one month-by-origin query settled it.

## Sprint R-GRAPH: derivation-graph contract + repair orchestrator (#568–572) — ✅ code complete, deploy held

**Planned vs built** (2026-07-25, develop only; rides to main after the Monday 7/27 checkpoint):

- #572 derivation-graph doc — as planned, extended with the edge-contract section after #569 landed.
- #568 `enriched_at` lineage column — column + upsert stamp as planned; **the prod initialization was dropped** (see decisions).
- #569 `validate:graph` — 9 invariants (planned ~7): G4 split into current-week error / historical warn, G3 gained the G3L legacy warning.
- #570 `pipeline:repair` — as planned (stages via the stage CLIs, gates in-process); `scores:backfill` gained `--to` so scope stays exact.
- #571 cron + Health wiring — as planned except the digest mention (see deviations).

**Key decisions:**

- **`enriched_at` is forward-only.** The planned `enriched_at := computed_at` initialization was tried locally and produced 313 false narrative-staleness flags — count-only upserts bump `computed_at`, so the stamp claimed enrichments that never ran. Legacy rows keep NULL (G3L warning, shrinks naturally). Bonus: the owner-gated baseline write disappears from the deploy runbook.
- **Narrative freshness is measured against assessment data, not enrichment timestamps.** First cut compared `generated_at < enriched_at`; the pipeline:repair smoke run then failed its own gate because a no-op re-enrich bumps `enriched_at`. A narrative is stale when _assessments newer than it_ exist in its week. Error tier = current completed week only; historical regeneration stays a per-repair owner decision (G4h warn).
- **Severity tiers (error/warn)** keep the gate usable: a hard-fail invariant that flags 2,000+ accepted-policy rows is a gate nobody runs.
- Graph violations are **not** injected into the subscriber digest (#571 spec deviation) — that email is public narrative content, not an ops channel. Health page + cron error channel instead.

**The validator paid for itself before it was committed:**

- 77 orphan score rows in prod (stub-marking ran after the #566 purge — cross-tool ordering gap).
- 120 assessments for noise-purged documents, silently skewing weekly flag-rate denominators.
- 1 stale aggregate (executiveOversight 2026-06-29, agg=28 vs 39 scores).
- A live bug: `scores:recompute` bypassed the #566 content floor (called `scoreDocument` directly, skipping `scoreDocumentBatch`'s filter) — caught when G1b flagged 4 fresh stub scores minutes after a recompute.

**Lessons learned:**

- Every repair tool that re-derives state must share ONE eligibility predicate. Three tools each restated "eligible document" and one drifted. `validate:graph`'s `ELIGIBLE_DOC` is now the reference; a follow-up could extract it into a shared query fragment.
- Freshness invariants need the _data_ dependency, not the _process_ timestamp — processes re-run harmlessly; data changes are what invalidate derived artifacts.
- Grid queries over weekly data must be Monday-anchored (2017-01-20 is a Friday); `generate_series` from an inauguration date matches zero aggregate rows and reads as 6,930 violations.

**Prod runbook (deploy day, after Monday checkpoint):** `pnpm db:migrate` (additive 0044) → `pnpm scores:purge-stubs` (77 score rows + 120 orphan assessments; baseline rows included — **owner approval**) → `pnpm pipeline:repair --from 2026-06-29 --to 2026-07-05` (stale eO aggregate; analysis period) → `pnpm validate:graph` expecting all errors green, G3L/G4h warnings expected.

## Sprint R-CL-DEPTH: trump_2017/2018 CL depth + substantive-only counts (#565, #566) — ✅ complete

**Status: Complete (2026-07-23).** Milestone 86. Owner decisions: full repair, immediate start (promotion timing inverted the wait-for-Monday default), adjudication sample waived (volume-only change), option B for count semantics (deflate all eras to substantive-only rather than inflating 2017–2018 to the stub-counting basis).

**Planned vs built:** planned as a ~120k-row, $150–250, 2–3 day repair of the audit's last finding. Under measurement the finding decomposed into (a) substantive opinions — already repaired by #556's base branch, unnoticed until execution; (b) 4,285 genuinely missing rows — copied for **$0.02** (47 P1 calls); (c) the dominant cause, **era-inconsistent scoring policy** — the 2019-era pipeline scored every docket stub into weekly counts (503/wk) while current rules don't (75/wk). Fixed by #566: scoring floor (100-char L2 eligibility) enforced at every score site, 119,298 stub/orphan score rows purged, 1,647 category-weeks re-aggregated, 8 baselines recomputed, 6,899 weeks re-enriched. **Outcome: lawEnforcement 50/103/76/89 avg docs/wk across eras** — the 6.7x artifact gone; residual spread is the source archives' own coverage (publicly disclosed). **Zero status flips in both repairs**, verified by pre/post snapshot; 6/6 NCs; 39/39 events; total sprint AI spend $0.02 vs ~$40 protocol budget.

**Deviations & lessons:** four sizing passes fell $220→$0.02 → **three-numbers rule** (source-matched / net-new after anti-join against prod / assessable after eligibility) now in CLAUDE.md's spend protocol; **sibling audit findings sharing substrate must be re-sized after any one is repaired**; **count asymmetries can be scoring-policy artifacts, not data gaps** — check what each era scored before proposing ingestion. One false-alarm chain stop (`--load-opinions` confusion; 20 min, $0) — the 90-second-completion tell was read as a bug when it was dedup working. R-PARITY's machinery (Option-A rehearsal, zero-flip invariant, detached chains, caps/sentinel) ran twice more without modification and caught nothing because there was nothing to catch — which is the point.

---
