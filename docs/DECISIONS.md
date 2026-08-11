# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-FEEDBACK-RESPOND and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-ANSWER-QUALITY: search answer validation + error hardening (#707 #709–#711, v1.9.5–v1.9.9) — ✅ deployed + suite-validated 2026-08-11

**Origin**: owner challenged a "Document Coverage Note" on the FW4 showcase that claimed congressional responses to the 2025 Schedule F reinstatement don't exist ("is this accurate for the corpus, or an artifact of the documents retrieved?"). Corpus check: 2/3 of the claim was false (H.R. 2550 + rule + ~25 era-vocabulary floor speeches exist). That one question became a full answer-quality regime: execute the 12-question outreach suite, audit every AI answer claim-by-claim against the corpus (parallel agents, three rounds), fix root causes, re-validate.

**Built (five releases)**:

- v1.9.5 — coverage discipline (absence claims scoped to "this retrieval", corpus characterization only via corpus statistics; feedback criterion audits it) + tier-balanced re-rank (rank all candidates, compose kept slots at the 60/40 action/discussion share — the tier-blind re-rank had returned the 2025 era all-action, which is what misled the synthesis).
- v1.9.6/7 — annotation discipline (AI Assessment / Review Note lines labeled "(annotation)", never quotable, never attributable to the document) + matched-passage snippets in the synthesis context (docsOnly payload carries its cache hash as docsKey; the UI passes it to the stream as dk; the stream re-attaches phase-1 snippets) + public-answer discipline (simplify, never add) + route slimming (research-doc-retrieval.ts).
- v1.9.8 — judicial-disposition precision (attribute holdings only to parties the visible text names) + own-framing attribution (synthesis-level connections belong to the answer, not the speaker).
- v1.9.9 — **temperature 0.2 on all synthesis passes** (root find: AnthropicProvider.completeStream silently dropped the temperature option — every streamed answer ever ran at 1.0); disposition-aware + query-aware ts_headline excerpts for every context doc (synthesis-context-enrichment.ts); **deterministic quote verification** (quote-verification.ts — every quoted span string-matched against the cited document's FULL stored content, SSE verification event, UI badge). Plus scripts/audit-annotations.ts (the #711 sampled audit tool).
- Data corrections (#711 ledger): two poisoned P2 annotations fixed prod+local — EO 14029 credited with EO 14003's Schedule F revocation; a statutory 30-day IG Act notice attributed to a speaker who said only "as is required by law". Both had re-poisoned regenerated answers THROUGH the prompt rules.

**Audit evidence chain**: Round 1 (12 answers): 5 errors, 9 warns — failure taxonomy: annotation-over-document (worst), synthesis blind to deep content, public-version drift, last-inch precision decay; citation-index integrity perfect throughout. Round 2 (post-rules): 4/5 fixed; discovery that streamed answers redraw per visit — per-draw vetting guarantees nothing. Round 3 (post-hardening, full suite): 9/12 pass with zero quote-fidelity errors (~50 quoted spans verified verbatim); the 2 annotation-driven failures cured at the data source; 1 stochastic attribution slip. Targeted re-check: **12/12 pass**.

**Key decisions (owner)**: rejected answer caching as the fix ("does not help journalists asking ad-hoc questions") — forcing the systematic hardening path; approved the 4-item hardening list; pulled #711 data corrections forward when they kept re-poisoning; ordered the #711 measurement (200-row sampled annotation audit). **(Claude)**: quote verification as CODE not prompts; disposition/query excerpts over bigger excerpt budgets; annotation corrections with guarded WHERE clauses.

**Lessons learned**:

- **Prompt rules lose to confident false annotations.** A wrong "fact" asserted in-context beats an instruction not to trust it — twice, in independent draws. The durable fix is correcting the data; the prompt rule is defense-in-depth.
- **Per-visit stochastic generation means per-draw vetting is worthless as a guarantee.** Reduce variance (temperature), give the model the right evidence (targeted excerpts), and verify mechanically (quote checker) — those hold for every draw.
- **Check the temperature.** The provider silently dropped the option; every "prompt-quality" iteration before v1.9.9 was fighting max-entropy sampling.
- **The public rewrite is the highest-risk transform** — it fabricated the only made-up quote and repeatedly upgraded legislative status. (#709 files the structural fix: derive public from expert text only.)
- **Scripted repo edits must assert application** (a silent str.replace no-match shipped a dead docsKey); **never git-checkout a file holding uncommitted work** (one recovery from exactly that).

**Spec deviations**: none (no spec section; design recorded on #707/#711).

## Sprint R-HYBRID / R-CREC-SPLIT: hybrid retrieval + CREC fragments (#702 #704 #705, milestones 113/114) — ✅ deployed v1.9.0–v1.9.2 2026-08-11, verified on prod

**Origin**: owner testing outreach questions — "This search says there are no documents with congressional responses to Schedule F. Shouldn't there be?" Diagnosis found three stacked causes: passage-level entity mentions don't move a document's embedding (vector-only retrieval misses them), old-era CREC granules are whole-day multi-topic blobs, and the 2025 debate doesn't use the literal phrase "Schedule F" (vocabulary drift). One sprint shipped the answer to all three.

**Built**:

- **Terminology expansion** (`query-expansion-service`): gpt-4o-mini proposes short atomic aliases (cached 7d); corpus validation keeps only aliases matching ≥1 doc and ≤5% of the searched window, clamped to [200, 1000] matches, boilerplate stoplist. Hallucinated aliases die at validation. Kill switch `HYBRID_RETRIEVAL_DISABLED=1`.
- **Per-alias FTS arms** (`hybrid-arms`): match on the full search_vector (GIN), rank on the compact trigger-maintained `search_rank_vector` (migration 0053) so ts_rank never detoasts multi-MB vectors; inner LIMIT 2000 match scan bounds rank-sort cost structurally.
- **Weighted RRF fusion** (`hybrid-fusion`, k=60): IDF-style arm weights `1/(1+log10(1+n/100))`; post-fusion URL dedupe (alias arms reintroduce same-url multi-category rows the primary arm's DISTINCT ON collapses). Zero alias arms ⇒ exact pre-sprint pure-vector behavior.
- **Matched-passage snippets**: one batched ts_headline query post-fusion for only the surfaced keyword docs, [[..]] markers rendered as `<mark>` (no raw HTML); "Also searched:" chips in both modes.
- **CREC fragments (Path A)**: 29,215 retrieval-grade fragment documents split from 508 old-era multi-topic granules (structural line-anchored splitter, re-fetch mode after flattened-content rehearsal showed 25.9% boundary agreement); parent_id lineage, counting_scope=false, excluded from L2 — parents untouched, zero counting/assessment impact. Promoted to prod (420 parent-id identity verified). **Path B (L2 on fragments) declined on canary data**: old-era fragments confirm at ~1/6 the current-term rate ($3 canary killed a projected 4-figure spend).
- **Prod data**: rank-vector backfill 399,842 rows (keyset, $0 AI); fragments promote (finished manually after the interactive shell's 2-min timeout killed the upsert mid-flight — atomic abort verified, staging table completed the operation).

**Evidence chain**: tuning canary (corrected era-aware ground truth) baseline 88 → 143 with zero per-case regressions; pre-registered holdout on 7 untested journalist questions (matchers frozen before first run) baseline 76 → 86–92 across runs; all 12 verified outreach questions pass their documented properties locally AND on prod (era splits, EO 13957 top-5, named removal-power cases, press-release yield). Biggest single win: collective-bargaining question 6 → 17 relevant docs.

**Key decisions (owner)**: both search modes; latency cost accepted; pre-registered holdout to control over-fitting; re-rank untouched the week of outreach (#705 filed); press-on-to-prod same night. **(Claude)**: RRF over hand-tuned fusion weights; alias admission cap 1,000 aligned with the RRF surfacing threshold (quality-neutral by the weight math AND the perf fix); URL dedupe post-fusion; kill-switch env var.

**Prod-only findings (both fixed same night)**: two 60s-edge-timeout failures invisible on a RAM-warm local DB — (1) unbounded validation `count(*)` over a no-filter window (~400k rows) ate the whole budget (v1.9.1: all counts LIMIT-bounded); (2) one broad alias arm measured 31s cold — ORDER BY ts_rank detoasts a ~20KB rank vector per corpus-wide match (v1.9.2: admission cap + inner-LIMIT scans + validated-alias cache key bump).

**Lessons learned**:

- **Local-warm ≠ prod-cold**: every count and sort inside a request path must be LIMIT-bounded; "milliseconds locally" says nothing about a cold 17GB prod table.
- **Alias quality is the entire game**: iteration 1's hallucinated aliases produced a −23% regression; atomic-term prompting + corpus validation turned the same architecture into +63%.
- **Calibrate fusion weights against the RRF cutoff math**: vs a 150-deep primary arm at k=60, an arm needs weight >~0.67 to surface anything — a plausible-looking weight curve silently zeroed every alias arm until recalibrated.
- **Judge nondeterministic configs on the band, not single runs**: temp-0 expansion still varies; per-case hits move ±3 run to run.
- **The verified-questions checker earned its keep twice** (Seila URL-dedupe bug, the timeout class) — run it after every search-affecting release.

**Standing caveats**: heaviest era-stratified questions run 37–50s warm, near the 60s edge cut — a fully cold first hit (post-Monday-dump) can fail once before warming (mitigations: #705 re-rank latency, post-cron pre-warm). Occasional tangential-but-validated chips accepted as v1 behavior.

**Spec deviations**: none (no spec section; design recorded on #702/#704).

## Sprint R-CASE-TRACKER: tracked_cases + Litigation panel + stub retirement (#693–#698, milestone 112) — ✅ deployed v1.8.0 2026-08-10 (full prod sequence: promote, purge, milestone closed)

**Origin**: owner question after R-DOCKET-CONTEXT — "is the case tracker also CL-API-bound, and can the trigger stubs be purged once pulled?" Answer became the architecture: case UNIVERSE from our 283k docket stubs (the only record of case→category routing), case CONTENT from CL bulk dockets (5GB quarterly file verified to carry filing/termination/last-filing dates, NOS, cause, court; NO docket-entries bulk exists — entry-level posture stays on the shipped timeline API), weekly capped v4 refresh for open cases. **Stub retirement is a deliverable**: once tracked_cases verifiably carries the universe, the 283k metadata-only documents rows (−42% of the table) are purged.

**Built ($0 AI spend — fully deterministic)**:

- `tracked_cases` table (jsonb categories + GIN, posture jsonb cache, provenance, refreshed_at-as-queue) + dictionary artifact with dated format-change notes.
- `pnpm cases:seed` (LOCAL ONLY — the 71M-row staging tables never touch prod): documents-universe aggregation LEFT JOINed with search_docket/search_court/latest search_opinioncluster. **Parity perfect: 202,664 = 202,664, 0 missing, all 14 categories exact**; re-seed from fresh 2026-06-30 bulk cut bulk-miss 2,606 → 349; 156,511 terminated.
- **The linchpin**: `storeDocuments` now routes court_opinion items to `upsertTrackedCasesFromItems` (category-merge upsert) instead of persisting stubs — without this the stubs regrow. In-memory flow untouched (fillClOpinions still sees the items).
- Weekly refresh as snapshot post-step: docket-date sweep (cap 200/run, `id__in` batches of 20 ⇒ ≤10 calls) + tier-B posture cache (top 3 open per category, cap 40 calls). CL-absent dockets get refreshed_at stamped so the queue drains.
- `GET /api/category/cases` (GIN query, Redis 24h) + `LitigationPanel` on category pages (cards, open/all toggle, load-more, CaseContext live-timeline expand); CollapsiblePanel lifted to `components/ui/`.
- `pnpm docs:purge-stubs`: pre-flight ABORTS unless every stub case is in tracked_cases AND zero score/assessment rows. Local dry-run: 282,521 docs / 191,502 cases, both gates pass. Retirement surface pass: methodology + ASSESSMENT_METHODOLOGY rewrite, ingest stub check flipped all-marked → **none-present** (regrowth detector), doc-count cache v4, mark-docket-stubs retired.
- DEPLOYMENT.md rollout runbook + promotion-manifest `tracked_cases` entry.

**Key decisions (owner)**: work now, deploy held until after the Monday snapshot review; purge folded into the sprint as a deliverable.

**Rehearsal findings (both fixed pre-commit)**:

- **fetch_log has no per-URL rows** (per source/category/week) — the planned "delete matching fetch_log" would have falsely marked CL weeks unfetched. Purge now leaves fetch_log alone, with the reason printed in the runbook output.
- **Year-3926 filing dates**: 11 CL bulk rows carry typo'd `date_last_filing`; DESC ordering pinned them atop every case list. Sanitized at both write paths (seed + refresh) and in data.

**Lessons learned**:

- **Rehearse against real data before review**: both defects above were invisible in code review and surfaced only by running the endpoint/purge against the seeded local DB.
- **The staged-file pre-commit hook runs test-quality OpenGrep rules the full `lint:patterns` scan exempts** — negative-mock and mock-call-argument assertions in new tests fail at commit even after a green full scan. Write tests behaviorally from the start.
- Retiring a validation's subject flips the check's polarity: "all marked metadata_only" became "none present" — a retired population's check should become its regrowth detector, not be deleted.

**Spec deviations**: none (no spec section; architecture recorded in FUTURE_ROADMAP + c5fcb7d design commit). Detection untouched — tracked_cases is display/research surface only.

## Sprint R-DOCKET-CONTEXT: opinion docket timelines + posture lines + glossary (#686–#692, milestone 111) — ✅ built 2026-08-09, ships v1.7.0

**Origin**: owner discussion of the 283k metadata-only CL docket stubs' value. Pre-roadmap investigation found stored stubs CANNOT power timelines (median 1 query-matched entry/case, caption-only titles) — but every opinion's `case_id = cl:<docketId>` is a live gateway to CourtListener's v4 docket-entries API, whose entry descriptions are rich procedural text (live-probed before planning). Also settled en route: the stubs' real forward value is as the case-universe index for the future posture tracker, not as content; and the homepage corpus figure was a leftover (stubs counted in the hero number after R-POPULATION removed them from all analytics) — owner decided the hero cites only searchable full-text.

**Built (zero AI spend — fully deterministic)**:

- `lib/services/docket-timeline.ts` — pure keyword classifier (10 event types, ordered precedence) + posture derivation + one-page CL fetch. `pages/api/case/timeline` — validated (`^cl:\d{1,10}$`), rate-limited (30/min), Redis-cached 24h with **asOf captured at CL-fetch time** so the staleness stamp reports data age across cache hits; CL failure → 502, never cached.
- `useCaseTimeline` (module cache + in-flight dedupe + concurrency-3 queue) + `CaseContext` (EditorialPanel-pattern disclosure). Rendered on all three opinion surfaces; research citations auto-load the posture line (owner decision — visibility is the point; ~5–10 opinion cites/answer vs CL's 5k/hr budget).
- caseId plumbed through both search query paths, research formatDocList whitelist (optional field — 24h-cached payloads predate it), and the week-detail explanation query (+sourceType).
- **Glossary tooltips** (owner request mid-review): `lib/data/docket-glossary.ts` — 10 event-type tips + ~30 legal terms of art ("per curiam", R&R, habeas, en banc…), longest-phrase-first matching, composed into native title tooltips per the ASSESSMENT_TIPS precedent. Touch-device limitation matches every existing tooltip in the app.
- case_id join documented for dump consumers (dictionary entry + table-level note); hero count now full-text-only.

**Key decisions (owner)**: auto-load posture on research; all three surfaces at once; hero shows ~270k searchable full-text only (the ~470k records figure was an unrevisited leftover — recorded as such); glossary added.

**Lessons learned**:

- **A test can bless a bug.** The classifier initially marked "Order on Motion for Summary Judgment" as terminal `judgment` — and the fixture I wrote asserted exactly that. Caught only on re-reading the fixtures as legal facts rather than expected outputs. Fixture review is domain review.
- **The no-negative-mock-assertions OpenGrep rule earned its keep**: restructuring "cacheSet not called" into "a later request retries successfully" produced a strictly better test (real cache map, observable behavior).
- **Probe before roadmap**: the docket-stub investigation (1-entry medians, caption titles) killed the naive display-join design before anything was planned around it; the CL API probe then settled classifier feasibility with real descriptions. Both took minutes and reshaped the feature.

**Spec deviations**: none; UI-only + one cached proxy endpoint. Detection untouched (post-opinion activity surfaces as displayed context only — any status-driving use remains an explicit future methodology decision).

## Sprint R-DHS-PRESS: DHS/ICE/CBP press releases as a corpus source (#676–#683, milestone 110) — ✅ built + locally verified 2026-08-07

**Origin**: #605 research issue — immigrationEnforcement had ZERO executive-branch operational documents (recent weeks: floor speeches, bills, FR notices only), the twice-named corroboration gap (ICE operational claims uncheckable against our corpus). Sprint was gated on an archive-depth probe.

**The gate fired, then resolved**: all three live newsrooms (dhs.gov/news-releases 119pp, ice.gov/newsroom 41pp, cbp.gov/newsroom 107pp) are purged to inauguration day 2025-01-20/21 — no live baseline series. But recovery paths exist without Wayback content-fetching: DHS has an `/archive/news` subsite with a server-side press-release facet (`field_news_type_target_id=436`, 412pp back to 2008, dates in URL paths); ICE/CBP sitemaps still enumerate delisted-but-live release URLs (canaries: 50/50 per host fetched+dated+full-bodied, incl. 2022-era). Wayback CDX first-capture timestamps serve as date HINTS for the dateless sitemaps (on-page date authoritative post-fetch). The purge itself is filed as infoAvailability research (#683).

**Built**: `dhs-press-parsers.ts` (pure per-host parsers), `dhs-press-fetcher.ts` (standard fetcher module, SignalType `dhs_press`, origin `dhs_press`), `dhs-press-archive.ts` (sitemap/CDX/archive enumeration), `backfill-dhs-press.ts` driver (`--host/--period/--from/--to/--dry-run/--skip-existing/--no-cdx/--canary`), full pipeline wiring (backfill groups, incremental fetcher, ACTIVE_SOURCES, fetch_log, silence detection, validate:ingest, data dictionary, origin-aware press_release labels, `dhs_press` boilerplate stripper). 4 signals: 3 in immigrationEnforcement + `dhspress://ice?filter=hsi-criminal` fan-out in lawEnforcement (signal-level fan-out mirrors `oig://dhs?components=immigration` — the weekly cron dual-stores with zero extra machinery). CBP local-media-release URL class excluded at fetch (owner decision; deterministic → parity-safe). 50 new tests; suite 2,767 green.

**Key decisions (owner, 2026-08-07)**: current-term + historical gated (runbooks #680/#681 separately approved); ICE full + DHS + CBP national-only; immigrationEnforcement primary + HSI-criminal fan-out to lawEnforcement; purge finding → research issue. Constraint amendment signed off: PROJECT_KNOWLEDGE data-source rule now names a probe-gated newsroom-HTML exception list instead of a blanket scraping ban.

**Markup traps (live-capture verified, all regression-tested)**:

- ICE article bodies live in `.nr-body`, NOT the Drupal `.field--name-body` convention — the largest `.field--name-body` on ICE pages is an 807-char standing mission blurb. Naive selection stored boilerplate as content.
- CBP listing `<time datetime>` is a static template placeholder (same 2020-09-30 value on every row); real dates are in the visible spans, whose month/day classes are mislabeled upstream.
- `document-store.inferSourceOrigin` maps `press_release` → `'doj'`; the fetcher must set sourceOrigin explicitly (tested + rehearsal-verified 0 mis-origined rows).

**Live-measured infra facts**: Wayback CDX `limit=20000` 504s at the gateway (~60s); `limit=3000` answers in ~25s (10,270 ICE first-captures in ~6 requests). Gov hosts throw transient undici connect timeouts (host answering in <100ms moments later) — enumeration fetches retry 3× with linear backoff; canary hosts are fault-isolated so one host's outage is a result, not a crash.

**Rehearsal (local DB, week 2026-07-27)**: 30 releases stored (DHS 22/ICE 5/CBP-national 3), median body 2.2k chars, 0 stubs; 2 HSI releases fan-out to lawEnforcement, both verified genuinely HSI-criminal; validate:ingest shows the origin with only the expected T2-start warning; generic backfill + weekly group-fetcher paths smoke-tested.

**Deviation from plan**: cross-host title+day dedup found ZERO mirrors in rehearsal — DHS rewrites component headlines rather than reposting, so both versions store as distinct documents (arguably correct: the HQ rewrite is its own rhetoric artifact). The post-backfill residue audit carries the dedup burden. HSI predicate calibrated against live samples (10/10 correct on inspection) instead of the planned 50-release labeled set; formal calibration deferred to #680's canary week.

**Lessons learned**:

- **Purged listings ≠ purged content.** All three newsrooms delisted pre-2025 releases, but the documents remain live at their URLs, enumerable via sitemap/archive side channels. Check sitemaps and /archive subsites before declaring a baseline unrecoverable (or reaching for Wayback content).
- **Verify parsers against saved live captures before writing tests** — two of three hosts had markup traps (bogus datetime attrs, decoy body nodes) that inline-fixture tests written from assumptions would have enshrined as green.
- **Baseline-period runbook shape matters**: the 8 baseline periods are contiguous; one driver invocation over 2017-01-20→2025-01-19 does one enumeration + one detail pass instead of 8 (and never re-fetches the ~5k date-unknown sitemap URLs per period).

**Spec deviations**: none against V3 (new source class; methodology unchanged — press releases enter the standard L2 review path).
