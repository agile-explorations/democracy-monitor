# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-FEEDBACK-RESPOND and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-LOAD, WP5 measurement rounds (#779 #782, v1.16.9) — ✅ WO-5 shipped 2026-08-27; sprint close-out (#783, #724) pending the budget decision

**Origin**: Round A (basic-4gb) passed stability but failed the cold-novel latency budget (30/60s): p50 100s / p95 229s, one probe (workforce-1c) never finishing. Attribution named the alias machinery — expansion validation → alias arms → mining, stacked serially — so WP5 became a sequence of eval-gated work orders on that path.

**Work orders, measured**:

- **WO-1** batched validation SQL — implemented, verdict-parity verified, **refuted by timing** (single statement 1.0–1.4× the concurrent per-phrase path) and reverted; `bench:validation-counts` kept.
- **WO-3** arm/count concurrency 5→8 — **adopted**: cold alias-arms p95 216→64s, lead p50 100→84s; both knobs env-overridable.
- **WO-2** contribution-derived arm pruning (ceiling 600, roster 18→12) — **reverted on the eval gate**: pair [73,81] (variance regression vs the tight [78,78] instrument) with three questions failing both runs; arms carry redundancy value static cuts destroy.
- **WO-5** stage overlap — four variants and a same-day A/A control decided the final shape "D": expansion (LLM propose + validation counts) runs first and alone; then alias arms overlap vectors → mining under a **per-request DB budget of 8 statements per window** (`DB_CONCURRENCY_PER_WINDOW`, AsyncLocalStorage-scoped). Retrieval decisions byte-identical (golden guard). **The DNF class is fixed**: 1c finished in 3/3 capped runs (232→205→189s) and failed in 4/4 uncapped incl. the control (375s); the overlapped half ran 149s vs 207s same-day. Ungated overlap (counts beside vector scans) and parallel-window expansion were net-negative; a process-wide cap throttled the era path.

**Spec deviations**: the WO-2 plan's "eval mean ≥75 passes" was overruled by variance — the instrument's tightness ([78,78]) is part of the gate now. The WO-5 plan modeled a 20–25% p50 cut from overlap; the tier's I/O behavior falsified the model and the shipped result is "no regression + DNF fixed", not the modeled cut.

**Key decisions (owner)**: WO-2 reverted rather than tuned; WO-5 continued through the per-window and D iterations after mid-cycle re-framing; D shipped as v1.16.9 on "a failing query class fixed with decisions provably unchanged beats an unmeasurable few seconds"; `docs/GLOSSARY.md` created at the owner's request — shorthand (p50, DNF, probe ids, run labels) must be defined where the owner can read it.

**Lessons** (promoted to PROJECT*KNOWLEDGE): (1) **The cold instrument is storage-I/O-bound, not CPU-bound** — Render metrics show the dev Postgres at ≤0.2 of 2 vCPU during every run; the \_unchanged* expansion stage varied 35–103s for identical work 25 minutes apart because the page cache (2.3–4.1 GB, churning) decides everything. Single cold runs cannot resolve effects under ~±40%; **A/B must be interleaved A/B/A/B in one session, medians compared, with a same-day control** — never one run each, never against yesterday. (2) This reframes Round B: the residual is page-cache-shaped, so RAM (the 8 GB tier), not CPU, is the lever the data points at. (3) A scheduling-only change needs a shape guard: `pnpm retrieval:golden` diffs `candidatesPreRerank` + `alsoSearched` and labels known noise (uncached reranker order, trace narrowing draw, salience picks on multi-era questions). (4) Detached promises in a DAG must be marked observed or an early rejection kills the process. (5) `.env.dev.local`'s `RENDER_SERVICE_ID` is prod's — verify which service an API call targets before trusting a secret it returns (the chain held prod's CRON_SECRET for an hour).

**Open**: WO-4 (chip-wall UX) unstarted; #783 close-out (#724 tier decision now informed by the I/O finding; regression-gate adoption with the interleaved rule); budget decision (30/60s vs measured p50 ~85–115s / heaviest ~190s on this tier).

---

## Sprint R-DRAWS + R-ADMIT + gate incident day (#773–#776 #778 #779, milestones 122–123, v1.16.1–v1.16.5) — ✅ GATE PASSED 2026-08-24: replicated pair [78, 78], mean 78/107 ≥ 75

**Origin**: R-SLOTS left the pair at [70,71]; R-DRAWS (union-of-two-expansion-draws + prod-deficit fixes, v1.16.1) lifted it to [73,75] — one point short. R-ADMIT (#776 question-conditioned nomination channel + #775 per-class quotas, v1.16.2) targeted IM3's never-nominated due-process canon.

**The incident day (2026-08-24) — five production defects found and fixed in one diagnostic chain**, each one exposed by the gate runs and diagnosed from prod evidence (Render logs API access added mid-day; it turned two-hour inferences into ten-minute queries):

1. **Health-check starvation** (v1.16.3): cold enumeration builds saturated the shared pg pool (default max 10, bare Promise.all arm fan-out); /api/health/live's SELECT 1 queued past Render's 5s budget → healthy instances evicted → sitewide 502s from ONE sequential eval client. Fix: dedicated single-connection health pool. Memory was flat at 10% — the diagnosis, not the graph's first suggestion, named the mechanism.
2. **Silent statement-timeout degradation** (v1.16.4): 10-wide fan-out under cold cache pushed 1s FTS statements past their own 120s ceiling (57014); every kill silently dropped an arm/alias — builds "succeeded" with 60 docs while randomly missing retrieval. Fix: mapConcurrent(5) + one delayed retry + DEGRADED summary logs. Cold-run timeout kills: continuous storms → zero.
3. **Duplicate-build spiral** (v1.16.4): 240s coalescing slot TTL < 300–1,100s cold builds → retries spawned concurrent twins that compounded the contention that made them slow. TTL → 900s.
4. **Empty-payload cache poisoning** (#778 residual): a degraded zero-doc build caches for the week and serves instant empties. Server-side never-cache-empty guard queued to R-LOAD.
5. **Salience admission triple-defect** (v1.16.5, the gate-decisive one, found via new stage tracing + full local repro): (a) judge cache key omitted the shortlist — stale picks replayed verbatim against different nominees; (b) the question channel's single combined LIMIT let baseline-era omnibus granules (they match any long question's AND terms) bury current-era entities; (c) the roster's sharpest-first 18-seat slice cut judge picks (Trump v. J.G.G., 31 matches) for swarms of sub-20-match junk captions. Fixes: shortlist-hashed key (v3), per-era question queries with recency-first merge, composeRoster priority seats (10 of 18, judge's relevance order).

**Gate protocol hardening en route** (eval-harness + scripts): silent-flush failure caught (a no-op cache flush served week-old captures as a "fresh" run — verified-flush with printed counts now mandatory); capture-dir wipe + 6h measuredAt freshness guard; blind prewarm (single pass, docs>0-verified, 202-checked-before-res.ok, ~20-min coalescing patience); res.json() inside the retry try. Standing rule: prewarm is never re-rolled — re-rolling would draw-shop the gate.

**Result**: [74, 75] under degraded conditions → **[78, 78] clean** — and ten of fourteen questions scored identically across the pair (the rest ±1): the instrument itself is now tight. IM3 2/7 → 4/7 in both runs with the canon in arms.

**Lessons** (promoted to PROJECT_KNOWLEDGE): silent failure-tolerance struck FIVE more times in one day — every catch-and-degrade needs a log line the day it's written; res.ok includes 202; observability changes debugging economics (logs API, [salience] stage line, SALIENCE_TRACE); a measurement gate is only as good as its environment controls (flush verification, freshness guards, contention-free windows).

**Owner decisions**: option-1 (engineering cycle then fresh pair) after the 74.5 miss; ask-before-scope-change honored throughout; R-LOAD confirmed pre-outreach with cold-novel-search latency as the lead budget; outreach-gate label + #779 umbrella created.

---

## Sprint R-SLOTS: retrieval slot economics (#762 #763, milestone 121, v1.16.0) — ✅ shipped 2026-08-23

**Origin**: the scatter diagnostic classified 36/40 remaining CORE eval misses as never-candidate — documents in corpus, no query reaches them. Root causes measured: no slot guarantee for non-salience arms (a 608-match 'Title IX' arm contributed 0 candidates — RRF dilution + the reservation slice); selection funnel dropping indexed entities (Laken Riley Act docFreq 160 never an arm); era artifact (Bolton in trump_t1); synthesis losing the enumeration instruction in the two-pass path. Owner constraints throughout: corpus-scale sustainable, content-neutral (no curated lists, no per-question logic).

**Built**: composeArmSlotPool — bounded round-robin slots (PER_ARM_CAP=2, 30/60 slots) for ALL productive arms + the seed-exclusion bug fix; widened selection (judge ∪ floor ∪ top-8 mechanical, cap 20) + cross-era nomination (era-blind pool join, erasForWindow); statute-aware ENUM mining (validate-then-slice); synthesis per-doc accounting in draft AND revision prompts with lifted caps. All behind classifyQuestionMode — flag-off byte-identity guarded by tests; Explore and analytical paths untouched.

**Measured, cut, and kept (the sprint's real story)**: three latency incidents drove scope: (1) 48-arm roster saturated the DB pool (121s arms stage) → slot-justified 18; (2) era-window arm extras ran per window against ≤5-slot reserves (RL3/RL4 could never finish a build) → reverted to #760 semantics [owner: ask-first feedback + retroactive approval]; (3) R5 (16-term expansion) + mining width drove 100–150s seeds → matrix attributed gains to slots not width → option-1 trim (owner decision). Acceptance was band-form replicated: baseline [68,72] → candidate [72,72] (zero interval regressions, IM4/RL2 above-interval replicating EXACTLY — slot guarantees also stabilized retrieval variance) → trimmed confirmation 76/107 (71%), the project's best single run.

**Open residuals**: IM3's due-process canon still never nominated (0/40 arms both candidate runs — nomination ORDERING, not funnel width; next diagnosis); RL4 big-count items; outreach gate = replicated prod pair pending post-deploy.

## Sprint R-GAO: GAO reports via Wayback (#739, milestone 120, v1.15.0–v1.15.1) — ✅ Phase A shipped 2026-08-21; Phase B (baselines-to-2017) completed + accepted 2026-08-22

**Origin**: zero GAO documents in the corpus; gao.gov WAF-blocks non-browser fetches (403 on robots.txt → direct crawl forecloses under robots discipline); GovInfo GAOREPORTS dead since 2009 (#529). The Journalist Test flagged the 2026 GAO workforce series as journalist-noticeable absences and the coverage manifest disclosed the gap to every synthesis prompt.

**Planned vs built**: as planned, with one owner-driven scope change during planning — the owner's "does T2-only really serve both features?" review flipped v1 from T2-only to **full backfill-to-2017 in two phases** (DHS-OIG/CHRG precedent: era-comparable search, real negative controls, no structural seam). Shipped Phase A: generic `wayback-cdx.ts` (extracted from dhs-press-archive, re-exported, + capture-window support), pure two-generation page parser (2017-era template verified to carry the same Highlights markers), historical/recent fetcher pair (weekly = capture-window keyed, so IA-late captures still arrive), `backfill:gao` CLI whose pre-T2 dateFrom is REJECTED without `--baselines` (the per-invocation baseline acknowledgment, mechanically enforced).

**Results**: 887 docs stored (1,073 enumerated − 126 pre-T2 releases − 60 replay failures ≈ 5.6%); all 3 eval-flagged reports verified; review 863/863 P1, 57 flagged (6.6%), 11 clearly_concerning + 27 potentially_concerning; ~1,000 calls ≈ $5 vs $7 modeled (audit line now in the precheck template). Eval: **FW3's gao-workforce-1 CORE converted** (+ both SECONDARY GAO items), aggregate 66/107 flat-in-band vs the docket run, zero regressions vs the committed baseline.

**Defects caught by verification**: (1) dry-run sample step expanded a placeholder 2000–2099 range into ~100 bogus CDX queries — hammered the archive until killed; samples now reuse the range enumeration. (2) og:title path skipped the brand-strip (313 stored titles cleaned). (3) **`ACTIVE_SOURCES` (lib/data/analysis-periods.ts) is a mandatory new-source registration point** that gates embedding, scoring, aggregation, AND baselines — two exploration passes missed it and the 887 docs were invisible to all four until embed-missing's "0 embedded" exposed it. Lesson: after any new-source ingest, verify each downstream population (embeddings count, score rows, aggregate counts) — "stored" proves only storage.

**Phase B actuals (completed 2026-08-22, all steps owner-approved per invocation)**: 4,534 baseline docs stored (6,032 enumerated, 386 replay failures ≈ 7.5%; per-year 510–666, no thin years) → 5,421 total GAO docs spanning 2017–2026. Review: 4,289/4,289 P1, 84 flagged (**2.0% baseline vs 6.6% current-term — a 3× era difference, itself a calibration finding**), 27 confirmed, 409 audit samples; ≈ $19–20 vs $27–32 modeled. All embedded; 410 baseline weeks scored + re-aggregated; 30 confirmed rows actor-attributed (29 federal_executive). **Negative controls unchanged-or-improved across the entire change**; exactly **one baseline status flip** (executiveOversight 2019-03-11 → Elevated on GAO's Federal Ethics Programs report, potentially_concerning 0.72) — presented and **accepted by owner** (uniform-rules principle: baselines judged like the current term). Retroactive INSTRUMENT_CHANGES entry shipped; the T2-only seam never reached a release.

~~**Phase B (parked for per-invocation approvals)**: baselines 2017–2025, 4,956 products sized by CDX, nc:margins before/after, ~$35–55 review, retroactive INSTRUMENT_CHANGES entry on completion. Until then executiveOversight has a T2-only GAO seam (validate:ingest shows baseline dashes).~~

---

## Sprint R-DOCKETS: criminal-docket RECAP ingest + auto-discovery (#740 #761, milestone 119, v1.14.0) — ✅ shipped 2026-08-21

**Origin**: H3 ("prosecutions of named adversaries") sat at 30–40% CORE because the primary documents did not exist in the corpus — both CL ingest paths are structurally blind to criminal dockets (NOS filters civil-only; opinion court scopes exclude vaed/njd). The 2026-08-18 spike confirmed CL holds the documents and `tracked_cases` already tracks the dockets.

**Planned vs built**: as planned, plus one plan amendment (owner concern: no curated-list maintenance treadmill → #761 salience-driven auto-discovery: hot person entities ≥15 docFreq → CL party-name search → `-cr-` docket filter → ≤3 enrollments/week, provenance-tagged + logged). Shipped: pure court-authored classifier (head-anchored charging instruments; party paper/1-page orders excluded), full-docket RECAP fetcher, backfill CLI, weekly ingest as pass 4 of `cases:refresh`, embed carve-out (`metadata->>'recapDocumentId'`, fragments precedent). Backfill: 151 docs (Comey 113 incl. the 2025-11-24 Appointments Clause dismissal verified verbatim, McIver 25, James 13), dual-categorized lawEnforcement+civilLiberties, counting_scope=false by construction.

**Two defects caught by verification, both silent-failure shapes**:

1. **Silent pagination cap ate the marquee doc**: entries ≫ documents (minute entries carry no recap_documents); a 10-page ascending sweep dropped the Comey docket's newest filings — including the dismissal — and the dry-run reconciled perfectly because it was truncated identically. Fix: newest-first ordering (truncation drops the OLD tail), cap 30, loud CAPPED warning. Lesson: **a dry-run reconciled against its own truncated enumeration proves nothing about coverage; reconcile against an independent count** (docket date_last_filing).
2. **Salience nomination was pool-circular**: both channels could only surface what the seed pool already discussed, and the category-enrichment ratio let 1 stray mediaFreedom doc in a 60-doc pool outrank lawEnforcement 10/60 (tiny global share denominator). U.S. v. Comey (breadth 470) was never nominated. Fix: proportional category support floor (≥ max(2, 5%)) + third nomination channel (era-wide top-20 by breadth, category-agnostic — the judge filters topical fit).

**Eval**: 53 → **66/107 (62%)** vs corrected baseline, H3 3→7 (Comey/James/4th-Cir converted), gains on 6 other questions from the global channel. RL3 "regression" (5/6→4/6) did not reproduce — two fresh single-question runs scored 6/6 (band-form noise, per the arc's nondeterminism finding). Two invalid eval runs preceded the valid one: the harness silently reuses existing captures, and its default base is the live site whose week-stamped caches predate mid-week ingests. Lesson: **an eval that can serve cached captures/responses must prove it re-measured** (fresh capture dir + cache-cold base are part of the measurement, not optional hygiene).

**Spend**: AI review actuals 310 P1 + 188 P2 (~$5.5 vs <$4 modeled; audit sampling wasn't in the precheck — now a standing precheck line item). CL API well under limits.

**Open follow-ups**: live-site caches stale until Monday cron rolls the data week (owner has flush one-liner); Monday cron verifies pass 4 + discovery; #739 (GAO) is the next gate mover — FW3 0/3 is a SOURCE-GAP.

---
