# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-VALIDATION-RECONCILE: rationalize the validation surface (#646–650, milestone 102) — ✅ deployed 2026-08-01 (v1.4.0, main @ 1c006c0)

**Origin**: while triaging Data Readiness warnings, the owner noticed its "745 stale narratives" flatly contradicted the Derivation Graph's G4h=0, and that the reports overlapped and drifted out of sync. The reframe: stop patching individual warnings and rationalize the whole validation surface so each report answers one distinct question with no duplicated (or contradictory) checks.

**The phantom**: `validate:data` measured narrative staleness against `weekly_aggregates.computed_at` and ignored acceptance, so a _no-op re-derivation_ (R-\* sprints bumped `computed_at` without changing the assessments a narrative describes) flagged 741. G4h measures against the newest `ai_document_assessments.assessed_at` **and** honors `staleness_accepted_at`, so it correctly reported 0. Empirically: 741 (vs computed_at) → 382 (vs assessed_at) → 0 (unaccepted). This drove ~$5 of narrative regen (R-DATA-READINESS #101) before the G4h analysis caught that the regen was cosmetic — the lesson that motivated this sprint.

**Planned vs built**: 5 issues filed, all 5 shipped.

- **#646** boundary map (design gate) — one question per report (Ingest=acquisition, Data Readiness=processing backlog + reference sufficiency, Derivation Graph=derived-vs-inputs correctness, Detection=efficacy now, Backtest=historical efficacy); committed as `docs/internal/VALIDATION-SURFACE-BOUNDARY.md`, approved before any implementation.
- **#647** DR ↔ Graph — deleted the `computed_at` staleness phantom (staleness now solely G4/G4h); moved integrity checks to the Graph, finding 3 of 4 were already covered (non-Monday=G2c, aggregate-presence=G2a, #544-resurrection=G1b+G5) so only orphan-categories needed a new invariant (**G6**); deleted `data-integrity-queries.ts`.
- **#648** metadata classification → Ingest (acquisition concern); signal-coverage vs stage-completeness were already distinct, so no dedup needed there.
- **#649** `action`/`limitation` severity split (mirroring Ingest's IngestWarning) + known-issues rendering via the existing SeverityWarnings; baseline L2 gaps / audit-recall / steady-state coverage → `limitation`; CLI exits non-zero only on `action`. Added one-question name+description headers per report.
- **#650** split graph invariants into live (G2/G3/G4/G4h — cheap joins, run on each request) vs cached heavy (G1a/G1b/G5/G6 — doc/score scans); freshness signals are now up-to-the-minute. As-of stamp + Refresh button on every panel.

**Key decisions:**

- **Missing vs stale narratives split**: missing = a processing backlog → stays Data Readiness; stale = a freshness/correctness concern → Graph (G4/G4h). Cleaner than "all narrative coverage → Graph" (G4/G4h only check freshness of existing narratives).
- **Refresh = client refetch, not a server-regen button**: `/system/health` is public, so a button triggering the 1–3 min `refresh-reports` job is a DoS surface. The client refetch instantly re-runs the _live_ invariants (the freshness signals that matter); cache regeneration stays with the weekly cron / owner-triggered `refresh-reports`. Filed as an optional rate-limited fast-follow.
- **Live/cached invariant tiering by cost**: the freshness invariants the owner cares about (G3/G4/G4h) are the cheap ones, so "live" was achievable without touching the heavy scans.

**Lessons learned:**

- **A staleness metric is only as good as its reference timestamp.** Two overlapping validators with inconsistent definitions produced a phantom that drove real, nearly-wasted work. The fix was architectural (delete the inferior check), not data (regen/accept-stale).
- **When consolidating checks, look for existing coverage first** — 3 of 4 "integrity moves" were deletions, not ports, because the Graph already covered them.
- **Tests aren't tsc-checked** (vitest uses esbuild), so an incomplete report fixture surfaced only at runtime ("not iterable") — completed the fixtures + added a defensive guard.

**Spec deviations**: none against the approved #646 boundary map; the missing/stale narrative split above is a refinement noted in the boundary doc.

## Sprint R-CODE-PROTECT: code-side resilience + repo/account hardening (#624–631, milestone 99) — ✅ 7 of 8 complete 2026-07-31

**Origin**: after the database gained off-site immutable backups (B2, #617), the owner asked "what protects the _code_?" The reframe drove the sprint — code and data have different threat models. Data is expensive-to-recreate and lives in two places, so off-site copies are the whole game; code is distributed by git (every clone is full history), so the real risks are **integrity/tampering** (a credential pushing code that auto-deploys) and **canonical-host loss**, not data loss. Issues were ranked by likelihood × blast-radius ÷ effort, which put the free secret-scanning toggle and the live push→prod hole above the high-effort origin Tunnel.

**Planned vs built**: filed 8 issues, **shipped 7**, parked 1.

- **#625** secret scanning + push protection (public repo, free) — enabled; historical scan clean.
- **#628** tag-gated prod deploys — `autoDeploy:false` + a `v*`-tag Action that verifies the tagged commit's CI is green, then deploys via the Render API (shipped as v1.0.0).
- **#631** DB TLS pinned to explicit verification for external Render endpoints, durable against pg's upcoming `sslmode=require` default change (v1.1.0).
- **#630** pagination host guard — `isSameHostHttps` on the `next`/`nextPage` follow in three fetchers; CREC validates before appending the API key (v1.1.0).
- **#624** weekly off-site repo backup — a scheduled Action `--mirror` clones + `git bundle --all` → B2 `code-backups/`; verified end-to-end (33 MB bundle, "records a complete history") (v1.1.0).
- **#629** org 2FA required (secure methods only), verified with a live Render deploy.
- **#626** branch protection — one clean ruleset (`deletion` + `non_fast_forward`, no bypass) on `main` + `develop`, replacing the old bypassed PR/checks rules.
- **#627** signed commits — **parked**: marginal value for a solo committer given the above, and recurring signing friction on every push environment.

**Key decisions:**

- **CI gate at deploy, not merge (no PRs).** The owner works fully solo + AI-reviewed, so PR-as-human-review adds nothing, and required status checks on `main` would _force_ a PR-and-wait flow. Instead the tag Action refuses to ship a commit whose CI isn't green — a red commit can sit on `main` but can never reach prod.
- **Deploy pinned per-commit; crons can't be.** The Render API accepts `commitId` for web services but rejects it for cron jobs ("cannot deploy cron job service by commit reference ID") — found during rollout; the Action omits it for `crn-*` (crons deploy branch HEAD, which equals the tag).
- **Repo backup on GitHub Actions, not a Render cron** — Actions gives full history via `--mirror`; a Render cron's shallow build clone can't produce a complete bundle.
- **DB TLS fixed in code, not the connection string** — an explicit `ssl:{rejectUnauthorized:true}` for `*postgres.render.com` survives a pg major bump; internal/local return `undefined` (unchanged), so prod runtime is untouched.
- **Ruleset rebuilt, not patched** — the old "Core Rules" ruleset wasn't editable via the repo API token (org-governed); a new repo-level ruleset was created and the old one deleted, reaching the target state directly.

**Corrections / deviations:**

- **The 2FA-broke-Render root cause was misdiagnosed twice** before #629 landed. "Render's outside collaborator was removed" and "migrate Render to the 2FA-exempt GitHub App" were both wrong — the App was installed and correct throughout. Render's git rides the **`BabyYoda-AE` org _member_ account**, which lacked 2FA; org-wide 2FA-require restricted it. Fix: secure 2FA on that account, verified via the People 2FA-disabled filter + a real deploy. Retro and memory corrected.
- **The #620 origin-secret enforcement stayed removed** (from R-HARDEN-FF) — proven unenforceable on Render; #623 (Cloudflare Tunnel) is the only real fix, deferred as a standalone infra project.

**Lessons learned:**

- **Rank hardening by likelihood × blast-radius ÷ effort, not intuition.** It surfaced that a free toggle (secret scanning) and the tag-gate outrank the expensive Tunnel, and that a latent-but-cheap DB-link MITM outranks code-loss insurance.
- **Verify security controls empirically before calling them done.** The 2FA fix was only real after a Render deploy cloned _under_ the requirement — two confident prior explanations were wrong. Likewise the deploy Action: two live bugs (var-or-secret, cron `commitId`) surfaced only when a real tag ran the pipeline.
- **Integration auth can ride a human member account, not just an App.** "The App is installed" is not evidence an org-wide policy is safe — check which _account_ the integration authenticates as.
- **A provably-unenforceable control should be deleted, not parked** (the origin secret) — dead middleware carries complexity and a leaked-secret liability.

---

## Sprint R-HARDEN-FF: security fast-follows (#619 R10–R14, #620, milestone 98) — ✅ complete 2026-07-31 (⚠️ #620 origin gate later reverted — see follow-up below)

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

### Follow-up: the #620 origin gate was reverted and fully removed (2026-07-31)

The origin-secret portion of this sprint did **not** hold up. Recorded here in full because the failure — and why the mechanism was never viable on this platform — is the real lesson.

**What happened, in order:**

1. **First enforcing deploy caused a total outage.** The `main@b7abc34` deploy ran the middleware fail-**closed** the instant `ORIGIN_SHARED_SECRET` was set; the running instance's secret didn't match Cloudflare's injected header (Render env changes need a redeploy to take effect, and the value never reconciled), so every request 403'd. It couldn't fail-open because the fix required a redeploy — and **Render deploys were simultaneously broken** ("Access to Git repository denied"). Recovered via Render **Rollback** (Git-independent; replays a cached image).
2. **Root cause of the broken deploy pipeline**: enabling GitHub org "Require 2FA for everyone" restricted the **`BabyYoda-AE` org member account** that Render's git access rides on, because that account lacked 2FA. Disabling the requirement restored deploys. (Corrected 2026-07-31, #629 — the initial "Render's outside collaborator / migrate to the GitHub App" theory was wrong: the App was installed and correct all along; the clone authenticates via the connecting member account, so the fix was enabling secure 2FA on `BabyYoda-AE`, then re-enabling the requirement and verifying a real deploy.)
3. **Rebuilt fail-safe** (#622): a log-only→enforce two-stage guard (enforces only when `ORIGIN_ENFORCE=true`, after logs confirm the header matches) so a deploy can never self-outage again. Redeployed in log-only mode.
4. **Then proved the mechanism is unenforceable on Render at all.** A temporary `/api/origin-debug` probe through Cloudflare returned `hasOriginHeader:false` while `cf-ray` + `cdn-loop` + Render's `rndr-id`/`render-proxy-ttl` were all present — i.e. **orange-to-orange**: our Cloudflare → Render's _own_ Cloudflare → app. The second (Render-owned) Cloudflare strips the custom `x-dm-origin` header before it reaches the app. The Transform Rule fires correctly; the header simply never survives the hop. mTLS / Authenticated Origin Pulls / inbound-IP firewall are all unavailable on a public Render web service, and the bypass (shared IP `216.24.57.1` + `Host` header) is inherent to the platform.
5. **Removed all of it** (commit `244461d` → merged `0021e86`, deployed + verified 2026-07-31): `middleware.ts`, `lib/utils/origin-guard.ts` + tests, `pages/api/origin-debug.ts`, `pages/api/health/live.ts`, and the `render.yaml` `ORIGIN_SHARED_SECRET`/`ORIGIN_ENFORCE`/`healthCheckPath`. Owner deleted the matching Render env vars + Cloudflare Transform Rule. **All R10–R14 hardening was kept and re-verified live** (headers, CSP + report sink, admin, proxy, dep pin). `DEPLOYMENT.md` now documents why direct-origin protection is deferred, so nobody re-implements the dead approach.

**The real fix — deferred**: **#623 (Cloudflare Tunnel)**. A Tunnel gives the origin no public ingress at all, closing the bypass _by construction_ — which also means no in-app header check is ever needed. Until then the bypass stays open by design; residual risk is bounded by in-app rate-limiting + Render's edge (no unauthenticated write paths on the origin).

**Lessons learned (this arc):**

- **Never deploy a fail-closed guard at the HTTP edge.** A single wrong/if-absent secret 403'd 100% of traffic, and the remedy (redeploy) was itself blocked. Any edge auth must fail-**open** and gate enforcement behind an explicit, separately-flipped switch that only activates after logs confirm the happy path.
- **Verify the deployment platform's proxy topology _before_ designing header-injection auth.** Render fronts every service with its own Cloudflare; the orange-to-orange hop strips custom request headers, so a CF→origin shared-header scheme can't work here. One `dig`/header probe up front would have killed the design before it shipped an outage. (Render's own Cloudflare also _spoofs_ the "behind CF" signal — `server: cloudflare`/`cf-ray` on responses does not mean your zone is in-path; verify with `dig +short NS` + the CF dashboard "Active" state.)
- **Org-wide 2FA enforcement can sever platform integrations — via the member account they authenticate as, not the App.** "Require 2FA for everyone" broke Render because Render's git rides the `BabyYoda-AE` org member account, which lacked 2FA; the installed GitHub App was a red herring. Before enforcing org-wide 2FA, ensure **every member account any integration connects as** has a _secure_ 2FA method — verify with org People → the 2FA-disabled filter, then confirm with a real deploy. Don't reason from "the App is installed."
- **When a control is provably unenforceable, remove it — don't park it.** Leaving dead middleware "just in case" carries real complexity and a leaked-secret liability; the correct end state was deletion + a documented pointer to the actual fix.

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
