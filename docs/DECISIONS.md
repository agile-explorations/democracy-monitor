# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

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

## Sprint R-PARITY: coverage-parity repair — court-scoped opinions 2017–2023 + LegiScan gaps (#555, #556) — ✅ complete

**Status: Complete (2026-07-22).** Owner-driven from the standing coverage-parity constraint (PROJECT_KNOWLEDGE.md) and the #557 audit. Executed with per-invocation approvals on every baseline-period write; two owner mid-flight decisions (Option-B mechanical rehearsal; LegiScan folded in) and two owner acceptances (5 stale-enrichment flips, then the full 147-flip assessment effect).

**Product outcome:** baseline years now carry the same court-scoped opinion layer and LegiScan coverage T2 has. 5,813 docs landed (2,071 opinions incl. Trump v. Hawaii/Seila Law/Vance/Mazars correctly routed; 3,742 bills filling trump_2020 and biden_2023/2024 from zero); ~5,465 P1 + ~1,900 P2 assessments; baselines recomputed ×8; 2017→2025 re-enriched. **147 baseline-week status upgrades (95 Elevated, 52 CC, 0 downgrades) owner-accepted** — concentrated in immigrationEnforcement/elections/rulemaking/executiveActions in 2020/2023/2024, landing on real events (Trump v. Hawaii decision week, Dec-2020 election litigation, COVID emergency rules). Gates at close: 39/39 events, 6/6 NCs (NC-3 required an 8-doc actor-attribution pass for the new biden_2022 confirmations). NC-1 elections at 18.1% vs ≤20% is the standing calibration watch item.

**Method innovations that should recur:** verified-copy (fetch/verify locally off bulk staging, anti-join on url+category, insert exact rows into prod — minutes instead of a fragile 6-year CL API crawl); nc:margins capture/diff (margins, not pass/fail, at every phase boundary); detached chain scripts with done-markers + monitor events (survived task reaping that killed three plain background runs).

**Incidents & overruns (honest ledger):**

- **#563 — ~$190–200 duplicate-P2 burn, chain stopped mid-run:** `runPass2Phase` had no dedup (re-called Sonnet for every previously-flagged doc in any week containing one new doc, discarding results on conflict) AND `review:backfill --pass` was parsed but never wired, running the full pipeline twice per baseline. ~16k P2 calls for 1,894 real rows. Retroactively explains much of R-SEARCH's "4x overrun." Fixed same day (dedup + wired passFilter); post-fix the identical remaining work ran at pennies. Total sprint spend $220–230 vs $8–18 quoted ($30–35 legit).
- **#564 — spend protocol (owner-approved) now structural:** prechecks model CALLS not documents; every AI step runs `--max-calls <estimate × 3>` (exit 3, never retried); canary-before-fleet for rehearsal-skipped steps; spend sentinel in chain scripts; actuals posted post-run. CLAUDE.md "AI spend protocol."
- **"Exactly 5 flips" stop condition was a framing error:** it bound the mechanical rehearsal's diff, but Option B structurally cannot preview assessment-driven status impact — the 147 flips were the repair working, not a malfunction, yet they arrived unapproved. **Standing rule: any repair that adds documents to baseline periods gates on an Option-A (full-AI) rehearsal or a prod canary with status-diff before the fleet.** Applies to the pending trump_2017/2018 CL decision.
- **Monday checkpoint collateral (all fixed same-day):** #560 weekly dump ENOSPC (disk holds one dump, not two — old dump now deleted first); #561 db:init treated pg_restore's benign version-mismatch exit as failure and destructively fell back to a March GitHub release over a fully-restored local DB (fallback now bootstrap-only); #562 filed (bulk path stores docket pairs the API path doesn't — 7,190 dockets excluded from the copy under the parity constraint).
- **LegiScan root cause was code, not data:** BASELINE_PERIODS ended terms at year 2 — the 116th/118th Congress never matched. Two-line range fix; weekly cron now maintains full-term coverage.

**Lessons learned:** estimate what pipelines call, not what they store (conflict-discarding writes hide call volume); spend is a gated quantity like data integrity; a rehearsal's stop conditions must be derivable from what the rehearsal actually exercised; stale enrichment can hide latent status changes that any scoped re-enrich will surface (the original 5); pg_restore exit codes lie (completed-with-ignored-errors = 1).

---

## Sprint R-SEARCH: action-first research retrieval + SCOTUS gap-year backfill (#552, #553) — ✅ complete

**Status: Complete (2026-07-18).** Milestone 85. Design agreed in-conversation 2026-07-17 (recorded on #552, supersedes the original diversity-quota idea); #553 backfill + full post-chain executed with per-invocation approvals (gating correction posted: biden_2023/2024 ARE baselines — the issue's original "non-baseline" claim was wrong).

**Product outcome:** "Search the Documentary Record" now returns the record. Tiered retrieval (action/discussion source-type map, per-tier HNSW candidate pools, 60/40 action-weighted K=30 context) puts primary sources first; facet chips (All / Government actions / Commentary & debate) and tier-tinted source-type badges expose the layer; the synthesis prompt grounds action-claims in ACTION docs with DISCUSSION attributed to speakers. The regression query that exposed the gap now opens with the actual rulings (Chevron elimination cited to Loper Bright; Trump v. CASA) instead of "No actual Supreme Court opinions are included in this document set." 2,602 court-scoped 2023–24 opinions backfilled (Loper Bright → executiveActions+rulemaking; the 2024 immunity Trump v. United States → civilLiberties+executiveActions). Citation correctness fixed structurally: the synthesis stream consumes phase-1's exact ordered doc ids (previously two independent retrievals agreed only by accident) — and skips its redundant vector search. Gates: 6/6 negative controls, 39/39 events, #544 invariant green.

**Verification harness earned its keep — three ship-blockers caught pre-merge:** (1) filtered HNSW queries starved at ef_search=40 (11 of 30 action docs; zero discussion docs for speech queries) → pgvector 0.8 `iterative_scan=relaxed_order` at DEFAULT ef — raising ef alongside it multiplies continuation cost (measured ~110s; default-ef iterative = ~1.4s); (2) full opinion texts (~1MB) shipped over the wire per result when the prompt uses ≤2,200 chars → content joined for final topK only, `LEFT(content, 3000)` — retrieval 10s → ~1.5s warm, faster than pre-sprint; (3) metadata_only docket stubs were never excluded from research retrieval.

**Incidents & overruns (honest ledger):**

- **~4x AI cost overrun (~$70–80 vs ~$15–20 estimated):** `review:backfill --baseline` assessed 41,249 docs, not the ~2,500 new opinions — the 2023–24 baselines had never been L2-assessed, so the membership sweep took the whole backlog. Lesson: **estimate review:backfill from `SELECT count(*) WHERE unassessed`, never from the delta being added.** Side effect worth owning: the gap years now have full L2 coverage and their recomputed statuses show 115 Elevated / 42 ConfirmedConcern weeks where charts previously showed near-empty calm — consistent with the institutions-wide product view, materially helps #556, but it arrived as a side effect rather than a decision.
- **CL API network failure killed the backfill at week 74/105** (one week before Loper Bright); resumed idempotently.
- **Overnight laptop sleep hung the chain 10h on a dead DB socket** (0% CPU, silent). Relaunched idempotently; all chain steps now run under `caffeinate -i`. Lesson: long local runbooks need sleep protection AND liveness checks — a hung process looks identical to a slow one.
- **#555 filed en route:** the cl-bulk opinion path predates #528 and lacks the court-scoped queries — bulk-staging environments silently lose marquee-opinion coverage.

**Lessons learned:**

- **A verification harness with fixed queries is the cheapest reviewer we have** — it converted three invisible defects into measurements before any user saw them. Make one standard for retrieval/ranking changes.
- **pgvector filtered ANN is a loaded gun:** any WHERE on a vector scan can starve results at default ef_search; iterative scan is the fix, and ef must stay at default with it.
- **Wire cost is real on remote DBs:** SELECTing wide text columns through candidate stages is invisible locally and dominant against a remote Postgres.
- Stale docs cleaned: PROJECT_KNOWLEDGE "gap years intentionally excluded" and the analysis-periods "four baselines" comment both predated the 8-config reality.

## Sprint R-SPARSE: sparse silence + contamination index + upsert fix (#546, #548, #554) — ✅ complete

**Status: Complete (2026-07-16).** Milestone 84 closed. All three items landed on develop (28a95bc, 579ecfb + docs); ride to main at the next checkpoint.

**Product outcome:** (1) **#554** kills the aggregate-wipe bug family structurally — `storeWeeklyAggregate` now preserves enrichment on conflict (two-mode API; enrichment writes go through `storeEnrichedWeeklyAggregate`), E2E-proven by re-storing enriched weeks and watching statuses survive. The two #544-era call-site guards remain as scope/efficiency measures, no longer as the only defense. (2) **#546** makes silence detection meaningful for the four post-#544 sparse categories (hatch/elections/mediaFreedom/judicialIndependence at ~1–2 gov docs/wk): below a true weekly mean of 3, a 16-week presence-rate/zero-streak test replaces z-scores ((1-p)^k < 0.05 with presence ≥ 0.5 and independent sources active), and the full silence detail now persists in `convergence_detail.silence`. (3) **#548** measured the adjacent-category contamination with owner-adjudicated labels (96%/98% reliability): infoAvailability's FR flood is _worse_ than mediaFreedom's (random stratum 0/100 on-topic; silence blinded at ~152 docs/wk) but FR supplies **49% of its confirmed detections** — and of 30 confirmed-but-misrouted docs, only 10 are confirmed elsewhere, so the mediaFreedom cure would erase ~20 real detections. executiveOversight: equally dirty pipe, small blast radius (8% of detections), no action. Report: `docs/internal/CONTAMINATION_INDEX_548.md`. Recommendations await owner direction (filter+reroute sprint for infoAvailability, keyed to the #547 funnel diagnostic).

**Key decisions:** sparse floor = 3 (captures exactly the four broken categories; borderline rulemaking/civilService stay z-score until evidence); label-criteria boundary tightened by owner adjudication — transparency-_adjacent_ regulation is OFF unless the subject IS information access; relevance is direction-agnostic (a records _release_ is ON — concern is L2's job).

**Lessons learned:**

- **Measure before porting a cure.** The same measurement protocol on a nearly identical symptom (96.9% FR share vs mediaFreedom's 88.5%) produced the opposite prescription because the detection-contribution profile differed (49% vs 6% of confirmations from FR). The #548 issue's "re-derive, don't port" instruction was empirically vindicated twice over.
- **Cross-category overlap is the load-bearing fact for any category-scoped exclusion**: what looks like removable noise in one category can be the system's only confirmed copy of a real signal.
- **Two-mode APIs beat magic key-presence semantics** for preserve-vs-write upserts: the enrichment path legitimately clears stale fields to null, so COALESCE-preserve would have broken it silently.
