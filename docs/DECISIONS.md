# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-FEEDBACK-RESPOND and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint arc R-JOURNALIST → R-DECOMP → R-SALIENCE: journalist-test retrieval (#733–#760, milestones 116–117, v1.10.0–v1.12.0) — ✅ deployed + flag-on prod eval 2026-08-19

**Origin**: the 2026-08-18 Journalist Test found the corpus 97% complete but answers passing only 47% of CORE ground-truth items. Outreach paused; a ≥70% CORE gate was set. One continuous three-sprint arc followed (2026-08-18→19), including one production incident and two architecture pivots — all owner-gated at each turn.

**Planned vs built**: R-JOURNALIST's six fixes (expansion entities, instrument dedup, rerank instruction, content repairs incl. ~22.5k doc re-extraction/re-embed, coverage manifest, committed eval harness) shipped v1.10.0/v1.10.1 and improved the frozen-matcher holdout 120→130 — but the answer-level score stayed ~50%. The measured ceiling of the whole single-query architecture (depth-60, no rerank cut, enumeration prompting) was 64%: 38 of 39 remaining misses never reached the retrieval pool at any depth. R-DECOMP built aspect decomposition, then a read-and-follow-up loop; instrumented tracing killed both (below). R-SALIENCE — a weekly offline hot-entity index (novelty-ranked: term recurrence ÷ baseline recurrence), judge-selected salience arms into guaranteed slots, enumeration synthesis (60 docs/8192) behind an ENUMERATION_MODE flag — is what shipped: **local acceptance 70/107 (65%), prod 63/107 (59%), vs 53/107 corrected baseline; zero per-question regressions; prod stable**. Gate path to ≥70%: #760 (era-path salience + per-era index + extraction classes + judge stability) → #740 (criminal dockets; H3 is unreachable without it) → #739 (GAO).

**Production incident (2026-08-19)**: v1.11.0's loop builds crashed prod instances (prewarm verified 0/12; builds died uncached); the v1.11.1 "kill-switch" release ALSO destabilized prod because the flag gated only the classifier while widened mining ran in every build's common path. Resolved by v1.11.2 full revert (tree verified == v1.10.1). Lessons now standing: **a kill-switch must cover every shared-path change or the release must be additive-only outside the flag**; **local probe wall-times are deploy gates, not link artifacts**; the hardened prewarm's verify-or-fail pass caught the incident and later greenlit the safe rollout — alerting-by-default pays.

**Key measured findings (the arc's real yield)**:

- Marquee-item discovery is a **salience problem, not similarity**: targets sat at vector sim 0.39–0.44 vs a 0.57 rank-60 cutoff; phrase-embedding sim ranked junk above J.G.G. v. Trump on the question about it; every query-time discovery channel (LLM expansion → cutoff-blind; pool mining/reading → self-referential) failed measurably. Corpus-wide recurrence, computed offline weekly, is the missing signal — and **novelty (term ÷ baseline recurrence) is what separates news from era-invariant legal boilerplate** (Ashcroft v. Iqbal, EO 12866 topped raw frequency).
- **Weighted RRF cannot be trusted to deliver entity arms**: a perfect arm carried targets at positions 0–8 and fusion dropped every one under co-validated generic-arm dilution → guaranteed slots, never a vote.
- **Four same-shaped cap-ordering bugs** (slice-before-validate, chunk concat-then-cap, freq-rank starving freq-1 gold, doc-join refilling its own genre) — when a system repeats one failure shape at every joint, it is a pipeline of compensations; replace, don't tune.
- The retrieval pipeline is **inherently nondeterministic** (old-vs-old doc overlap 10/30): equivalence gates must be band-form, and single eval runs carry ±4–6 aggregate items.

**Spend**: content repairs ~$1 embeddings; eval/ceiling/probe runs ≈ $15 total across the arc; salience index $0/week (no LLM); judge ~$0.001/question-week.

**Open follow-ups**: #760 (mechanisms incl. per-era index + judge stability + weekly validation-cost fix BEFORE the 08-24 cron), #740, #739, #742. Deferred by design: low-recurrence question-specific items (documented as out of scope — chasing them would overfit the eval).

## Sprint R-WITNESS: witness-stance editorial program + follow-ons (v1.9.51–v1.9.56) — ✅ deployed + prod-smoked 2026-08-18

**Origin**: owner: "The site feels decidedly partisan. I wish it were more solidly bearing witness to a shift away from Classic American Democracy … without judgement about that shift." The program reframed every reader-facing surface from danger vocabulary to **departure-from-documented-baseline** vocabulary — precision without valence, never euphemism — while leaving every stored enum, prompt baseline, and historical record untouched. Follow-ons the same night: owner screenshots flagged the overview chart's stale vocabulary and the heatmap's indistinguishable colors; owner asked for the same assessment info on Research cards and for the markdown docs to join the vocabulary; a smoke-test mishap surfaced a real API trap.

**Built (six releases)**:

- v1.9.51 — tier 1: owner-approved-verbatim epistemic charter at /why-this-matters#charter, echoed on About + methodology.
- v1.9.52 — tiers 2+3: central display-label mapping (`assessment-labels.ts`, `concern-level-explanations.ts`: Stable→"Consistent with baseline", Elevated→"Notable departure", ConfirmedConcern→"Sustained departure"; verdicts→"clear/possible departure") repointed across every status surface; narrative witness-tone rules (banned-valence list, "unprecedented" needs a supplied count) + deterministic validator check T-NAR-0.
- v1.9.53 — tier 4: magnitude palette — convergence tokens move from red/amber to a single-hue indigo ramp; tier 5: /api/intent/assess responses carry a `framing` field (governance labels are a pattern comparison against Levitsky & Way / V-Dem categories, not a judgment); "Authoritarian Infrastructure" → "Durable-Power Infrastructure" (roadmap page, anchor id preserved). Search-mode sweep: Explore tooltips/badges de-valenced ("strong/moderate keyword signal" with internal tier names in tooltips); research synthesis draft rule 13 WITNESS TONE.
- v1.9.54 — the last old-vocabulary surface: "Cumulative Concern Score" → "Cumulative Departure Score" (title, embed, tooltips, legend enum leaks "Elevated/Confirmed" → display labels with point values). Dark-mode ramp rebuilt to separate by **lightness** (slate → indigo-500 → violet-300); legacy Divergent moved to violet-500; Elevated _text_ token stays indigo-400 for contrast (indigo-500 is 3.8:1 on the card bg).
- v1.9.55 — Research doc cards show the AI verdict + confidence + mechanism of change (server already computed all three; payload gained only `p2Confidence`). Markdown witness pass: README + ASSESSMENT_METHODOLOGY lead with display labels, internal enums documented in backticks; "Concern Synthesis" → "Status Synthesis"; FUTURE_ROADMAP's "authoritarian threat" sentence reframed around durability; historical records (DECISIONS, PROJECT_KNOWLEDGE, archives) deliberately untouched.
- v1.9.56 — `parseBooleanParam` on /api/search: `docsOnly=1` had silently run the full synthesis pipeline (route compared `=== 'true'`); now true/false/1/0/yes/no parse leniently, anything else 400s, spellings canonicalized for downstream helpers.

**Key decisions (owner)**: the witness reframe itself and charter text (approved verbatim); tier sequencing (1 → 2+3 → 4+5); heatmap colors "not clear enough" (drove the lightness ramp); markdown scope (public docs yes, historical records no); Research-card parity; ship the docsOnly hardening. **(Claude)**: display-layer-only mapping (stored enums are 100+ weeks of data and eval baselines); single-hue magnitude ramps separate by lightness, not hue; text tokens may diverge from cell hexes where contrast demands; internal names stay _documented_ (backticks/tooltips) rather than hidden — the mapping is disclosed, not disguised.

**Lessons learned**:

1. A vocabulary program is a **sweep, not a feature**: the old words hid in chart titles, legend enum leaks, tooltip strings, embed snippets, API framing, markdown rendered on GitHub, and prompt rules. Grep for the old vocabulary is the completeness check; every follow-on the owner caught was a surface the initial pass had missed.
2. Single-hue magnitude ramps must step by lightness — indigo-400 vs violet-400 (hue-only) read as one color on the heatmap; the shipped-then-corrected palette cost one extra release.
3. Smoke with **exactly the parameters the UI sends**: `docsOnly=1` vs `'true'` produced an hour-long false alarm (full-pipeline hangs mimicking a prod regression through timings log, provider probes, and semaphore inspection) — and then became a real fix: booleans on public APIs parse leniently or 400, never silently pick a path.
4. Check the server before building UI parity: the Research-card request needed one payload field, one client type, one render block — the expensive part already existed for synthesis prompts.

**Spec deviations**: none — display, docs, and one API validation; detection pipeline, stored data, and thresholds byte-identical throughout. Stored narratives and cached syntheses adopt the tone rules as caches roll (Monday).

---

## Decision: Explore-mode lens model for future analyses (owner, 2026-08-16)

**Context**: Explore mode's "Category" filter and "Score" sort are not corpus properties — they are outputs of the erosion-monitoring analysis (the 14-category taxonomy and the weighted assessment score), welded onto the corpus explorer because that analysis was the only one. The owner asked whether each future analysis (Authoritarian Infrastructure Monitoring, Rhetoric vs. Action, Following the Money, …) should add its own filter/sort options to Explore.

**Decision**: Adopt the **lens model**. New analyses do NOT add bare filters/sorts to Explore. When the second analysis ships, Explore gains an explicit lens selector — _None (plain corpus)_ | _Institutional erosion_ | future lenses — and the active lens contributes its filters, sort options, and result-card badges; no lens means source/date/relevance only. Nothing is built until that trigger: a lens selector with one lens is ceremony.

**Deferred to lens implementation**: whether "Category" stays base corpus navigation or moves inside the erosion lens (routing happens at ingest, so it half-belongs to the corpus).

**Done now**: "Sort: Score" renamed to "Sort: Assessment score" (sort value/API unchanged); Explore tips wording matched.

---

## Sprint R-DEEP-MATCH: bare-citation retrieval + verifier normalization (#713 #715–#717, milestone 115, v1.9.22–v1.9.24) — ✅ deployed + outreach set re-validated 2026-08-13

**Origin**: owner asked whether the 287(g) query's "no floor speeches appear" was "the best the corpus has to offer" — corpus census: 208 floor speeches contain "287(g)". Owner called the pre-outreach priority ("I want the folks we reach out to to be wowed, not frustrated"), reversing the freeze-retrieval-through-outreach stance. Context: ran immediately after the #712 full-corpus annotation-correction operation (retro on the issue close-out — 47.6k screened, 8,362 corrections applied, thin-doc policy pass, ≈$515).

**Built (three releases)**:

- v1.9.22 — bare-citation alias extraction: citationVariants also emits each citation token alone, both spellings ("287(g) agreements" → +"287(g)", "287g"), corpus-validated like every alias; expansion cache key v3; rule 12 denial guard (never claim a document lacks a term its Matched Passage shows — characterize embedded/incidental mentions instead).
- v1.9.23 — citation-spelling tolerance in quote verification (answers now quote across 287(g)/287g).
- v1.9.24 — verifier normalization from how documents are actually typeset: hyphens deleted symmetrically (line-break hyphenation: "de- lineated" = "delineated"), fragment-boundary punctuation trimmed (American style tucks commas inside quotation marks), quote characters deleted (documents nest quotes answers omit). Owner found the class by reading Senate Report 118-85 against an amber badge.
- Plus: pg_stat_statements enabled in prod (DB-side latency accounting); tip 1 amended (kind-words are hints, the tier filter is the guarantee — v1.9.21); all 12 outreach caches regenerated post-change.

**The diagnostic that changed the sprint**: the planned "two-stage full-content arm" already existed — arms have always MATCHED on the full-content generated search_vector and RANKED on the compact rank vector (migrations 0031/0053). The measured blindness was phrase strictness: '287(g) agreements' as an adjacent websearch phrase = 71 docs; bare '287(g)' = 305 (134 floor speeches); nothing ever proposed the bare citation. ~25 lines fixed what a new retrieval stage would have re-solved. **Elasticsearch decision gate (recorded on #713): trigger NOT met — Postgres stays**; full-content ranking, per-type quotas, pg_ivm remain #713 residuals, post-outreach.

**Acceptance numbers**: unfiltered 287(g) answer "none appear" → opens with directly-addressing floor speeches (2–4 arm-surfaced in top-30, was 0); badge false alarms across the 12 outreach answers 21 → 4 genuine (9 green / 3 amber final); suite 12/12 locally + twice on prod; no latency regression (heaviest cold query 57s, pre-existing #705 edge caveat); sprint spend ~$4.

**Key decisions (owner)**: fix-before-outreach priority call; approved sprint + extension bundle (pg_stat_statements, pg_ivm prototype deferred); ES gate framing. **(Claude)**: diagnostic-before-build; bare-token extraction over phrase-relaxation (precision preserved — validation still gates); symmetric-deletion normalization over lookup tables.

**Lessons learned**:

1. Verify the mechanism story empirically before designing around it — the #713 "title/lead index blindness" narrative was wrong for a day and nearly bought a redundant build; one grep of the arm SQL killed it.
2. Every retrieval-vocabulary change needs its verifier-normalization twin in the same release, or the badge mints false alarms from the search's own synonyms.
3. docsOnly caches are blind to expansion changes (keyed on query, not code) — cache regeneration with refresh=true is part of shipping any expansion change.
4. Verifier normalization must derive from how documents are typeset (line-break hyphenation, nested quotes, punctuation-inside-quotes), not clean-text assumptions — and a human reading one source against one badge found what three automated audit rounds had not.
5. Killed background watchers must be checked for whether their terminal action fired (a tag push silently missing cost an overnight deploy gap, twice).

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
