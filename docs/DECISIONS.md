# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-HARDEN-FF: security fast-follows (#619 R10–R14, #620, milestone 98) — ✅ complete 2026-07-31

**Origin**: Post-launch, with Cloudflare live in front of prod. Closes the R-HARDEN threat register's non-catastrophic items, filed as #619/#620 when the blockers shipped. The origin-bypass was confirmed reachable (Render IP `216.24.57.1` + Host header → 200).

**Shipped**: R10 static security headers (HSTS/X-Frame/nosniff/Referrer/Permissions) + a pragmatic enforcing CSP (production-only) + `/api/csp-report` sink + `serializeJsonLd()` escaping the `</script>` breakout in the JSON-LD SEO blocks; R11 admin login per-IP rate limit + constant-time password compare + HMAC-authenticated session expiry; R12 proxy https-only + `redirect:'manual'` with a re-validated single hop + dropped `ACAO:*` + generic error; R13 `next` 14.2.5→14.2.35 + CI OpenGrep pinned to v1.26.0 + sha256 checksum; R14 shared timing-safe `safeEqual()` across the CRON_SECRET checks + admin cookie/password; #620 `middleware.ts` origin-secret gate + `/api/health/live` + render.yaml `ORIGIN_SHARED_SECRET`/`healthCheckPath` + DEPLOYMENT.md rollout runbook.

**Key decisions:**

- **CSP = pragmatic-enforcing + JSON-LD escaping + reporting, not strict-nonce** (owner). An injection-sink audit found exactly one real XSS vector — `JSON.stringify` into `<script type="application/ld+json">` doesn't escape `</script>`, and ingested titles / AI headlines flow into that `data`. Fixing it directly with output-escaping (`serializeJsonLd`) closes the actual hole and reframes a nonce-strict CSP as defense against _future_ sinks — not worth the Pages-Router nonce plumbing + breakage risk on a live site. The pragmatic policy is strict on frame-ancestors/object-src/base-uri/form-action and permissive (`unsafe-inline`) on script/style; `report-uri`→`/api/csp-report` gathers telemetry to inform a later strict migration. Applied production-only so it doesn't fight `next dev`.
- **#620 fails OPEN, not closed** — enforces only when `NODE_ENV=production` AND `ORIGIN_SHARED_SECRET` is set, so a forgotten env (or dev/local without Cloudflare) can never self-outage. The Edge runtime lacks `crypto.timingSafeEqual`, so the middleware carries its own manual constant-time compare (a deliberate second `safeEqual` alongside the Node one). Rollout order is load-bearing: Cloudflare Transform Rule (inject `x-dm-origin`) → set the Render env → deploy. Owner completed the CF rule + env; enforcement activates on the next `develop→main` deploy.
- **Session token now carries an HMAC-authenticated expiry** (`<expiresAtMs>.<HMAC>`) — the previous token was static (identical every login, no real expiry). Tamper-evident: extending the expiry breaks the HMAC.

**Lessons learned:**

- **Ground a CSP decision in the actual sink inventory, not generic threat theory.** Strict-vs-pragmatic looked like a big call until the audit showed one escapable sink; fixing it directly made the low-risk pragmatic option correct and deferred the expensive nonce work to defense-in-depth.
- **A security control's severity and rollout are product decisions.** #620's fail-open design + the documented CF-before-env ordering are what make an origin-lockdown deployable without an outage — the safety lives in the sequencing, not just the code.
- **`JSON.stringify` into a `<script>` is an XSS sink even for `application/ld+json`** (it doesn't escape `</script>`). Any `dangerouslySetInnerHTML` carrying serialized, externally-influenced data needs output-escaping regardless of CSP.
- **Origin-secret defense is a shared secret, not obscurity** — the mechanism is public (open-source middleware); security rests on a 256-bit value that never appears in browser-visible responses (a request header injected on the encrypted CF→origin hop). It holds only as long as the value stays unlogged and unreflected.

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
