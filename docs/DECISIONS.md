# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-NAR-QUALITY and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-METHODOLOGY-CALC: show concern-status calculation in both methodology views (#673, milestone 107) — ✅ deployed 2026-08-04 (v1.5.8, main @ 56a22ce)

**Origin**: recurring user feedback (the khluerken item #1) asked how a category-week's concern score is calculated. Diagnostic: the site's one methodology page (`/system/methodology`) described the three statuses _qualitatively_ in the Concern Synthesis section of **both** reading levels, but the actual count-based calculation lived only in the detailed view's separate "AI Document Review" section. A reader looking at Concern Synthesis — the section literally about how status is set — found no numbers.

**Planned vs built**: shipped as planned.

- New `CONCERN_LEVEL_THRESHOLDS` in `lib/data/concern-level-explanations.ts` (single source of truth for the count-rule copy; typed `Exclude<ConcernLevel, 'Divergent'>` — the retired status has no live threshold).
- Summary Concern Synthesis: a per-status "Set when: …" line under each status card. Detailed Concern Synthesis: a third `How it's set (Pass 2 counts)` table column. Both read the shared constant.
- Render test asserting all three thresholds appear in **both** views (exported `SummaryContent`/`DetailedContent` to test each without the reading-level provider).

**Key framing (product):** the honest answer to "how is the concern _score_ calculated" is that there is no composite numeric score — there's a _status_ (Stable/Elevated/ConfirmedConcern) derived from absolute Pass 2 document counts, with structural/silence/thematic signals deliberately descriptive-only. The copy makes that derivation visible rather than implying a weighted multi-signal score.

**Lessons learned:**

- **Put the "how" where the reader asks the question.** The thresholds already existed on the page — just in a different section from the one titled "Concern Synthesis." Surfacing the calculation _at the definition_ is what closed the feedback, not adding new facts.
- `ASSESSMENT_METHODOLOGY.md` is a repo-only doc — grep shows zero site references; the public methodology copy is entirely hardcoded in `methodology.tsx`. Worth remembering before editing one and assuming the other updates.
- Exporting page-internal content components for a behavior render-test is an acceptable encapsulation trade vs. driving the whole page through the `ReadingLevelProvider` and toggling (heavier, more brittle); knip counts the test import as usage.

**Spec deviations**: none. Display copy only; no data/pipeline touch.

## Sprint R-FEEDBACK-RESPOND: reply to feedback — CLI response + publish + email submitter (#672, milestone 106) — ✅ deployed 2026-08-04 (v1.5.7, main @ 88c47c7)

**Origin**: R-FEEDBACK-MOD gave approve/reject but no way to _reply_. The owner needed to answer questions and acknowledge feedback. The display half already existed — the `feedback_responses` table, `attachResponses` join, and the public "Response from Democracy Monitor" block (escaped JSX). Only the write path was missing.

**Planned vs built**: shipped as planned, plus an interactive picker the owner asked for mid-sprint.

- `pnpm feedback:moderate -- --respond <id> "msg"` — insert a `feedback_responses` row, set `approved=true` (auto-publish so the reply is visible), and email the submitter the reply when they left an address. Scriptable / non-interactive.
- `pnpm feedback:moderate -- --respond` (no id) — **interactive numbered menu** of _every_ post (pending + public, each status-tagged), pick a number, then a **multi-line** reply terminated by a lone `.`. This closed a real gap: `--list` shows pending only, so an already-public post had no convenient id source. The menu makes any post reachable without id-hunting.
- `buildSubmitterResponseHtml` / `notifySubmitterOfResponse` (escaped both original + reply, non-fatal send); pure `parseSelection` + `formatSelectableRow` (unit-tested).

**Key decisions (owner):** responding auto-publishes the item (a reply implies it's been vetted); email the submitter when an address is present; **numbered menu over an arrow-key TUI** — the deciding factor was the Render browser shell, where raw-mode TUIs misbehave and a readline numbered menu works identically to a local terminal (and adds no dependency); multi-line replies (real answers need paragraphs).

**Lessons learned:**

- **Match the interaction model to the worst runtime, not the best.** The owner runs moderation from a Render web shell; that alone ruled out a raw-mode arrow-key picker in favor of a dependency-free readline numbered menu. The "nicer" local UX would have been the fragile one where it actually runs.
- **Interactive CLIs must guard `!process.stdin.isTTY`** and fail with a clear message instead of hanging — verified via a piped run (clean error, exit 1) and a real-TTY run through a Python `pty` harness (menu → select → two-line reply stored with the newline preserved → item published).
- Assert on **observable state, not mock calls** — the OpenGrep `no-mock-call-assertions` / `no-negative-mock-assertions` rules tripped my first `toHaveBeenCalledWith`/`.not.toHaveBeenCalled()` draft; captured the email effect into a state object and asserted on that instead (the project's own house rule, re-learned).

**Spec deviations**: none. Reused the existing Resend config; no new owner actions.

## Sprint R-FEEDBACK-MOD: moderated feedback — approval gate + Turnstile + notify + CLI (#668–671, milestone 105) — ✅ deployed 2026-08-04 (v1.5.6, main @ c372f58)

**Origin**: the owner asked whether the feedback path (the only user→DB write) was secure. Audit: the write and display were already safe (Zod-validated, parameterized inserts, rate-limited, email kept out of the public GET, message rendered as escaped plain JSX — no XSS/injection). The real gap was moderation: `GET /api/feedback` displayed the latest 100 submissions publicly and immediately, so spam/abuse could appear until manually removed.

**Planned vs built**: all 4 shipped.

- **#668** `feedback.approved` (default false); the generated migration was augmented with `UPDATE feedback SET approved=true` so existing (already-public) rows are grandfathered atomically — no window where current feedback vanishes. Verified in prod (1/1 grandfathered).
- **#669** GET filters `approved=true`; POST verifies Cloudflare Turnstile (`turnstile.ts`, skips when `TURNSTILE_SECRET_KEY` unset) then emails `OPS_ALERT_EMAIL` the approve/reject command (`feedback-notify.ts`, user message HTML-escaped).
- **#670** Turnstile widget on the form (hidden when the site key is absent, so dev is unblocked; submit disabled until the token arrives); CSP adds `challenges.cloudflare.com` to script-src/connect-src/frame-src.
- **#671** `pnpm feedback:moderate --list/--approve/--reject` — moderation is a CLI, so **DB credentials are the authorization** and the website needs no auth surface.

**Key decisions (owner):** Turnstile over a honeypot (robust, CF-native — the approval gate already stops spam from displaying, so this mainly keeps the moderation queue clean); grandfather existing feedback; moderation via CLI not web-auth.

**Lessons learned:**

- **The `NEXT_PUBLIC_` build-time gotcha**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is baked at build, so the keys must be in Render before the build for the widget to appear — sequencing the owner needed to know (they're GitHub-Actions-vs-Render-env-easy-to-confuse, like #665's secrets).
- **A moderation gate shrinks the CAPTCHA's job**: since unapproved feedback never displays, the bot check only reduces queue noise, not public-facing risk — which made the honeypot-vs-Turnstile call a preference, not a security necessity.
- Augmenting a _generated, journal-registered_ migration with a data `UPDATE` is safe (not the hand-created-SQL trap CLAUDE.md warns about) and the cleanest way to grandfather without a deploy-window gap.

**Also**: v1.5.6 was the first deploy to run the green **self-verifying** path cleanly (R-DEPLOY-HARDEN) after its two false-failures were fixed — workflow went green on its own, `/api/version` confirmed the SHA, no false alert.

**Spec deviations**: none. Owner set the Turnstile keys in Render before deploy (option 1).

## Sprint R-DEPLOY-HARDEN: self-verifying deploys + failure alerting (#664–666, milestone 104) — ✅ deployed 2026-08-03 (v1.5.4, main @ 74a7fe4)

**Origin**: the v1.5.0 deploy failed silently (CI coverage gate red → Render never deployed → prod on stale code ~3h, unnoticed) because "deployed" was claimed on tag-push, the deploy workflow is async (triggers Render and exits without confirming the new code came up), there was no failure alert, and the pre-push CI-mirror gate had been bypassed with `--no-verify`.

**Planned vs built**: all 3 shipped.

- **#664** `pages/api/version.ts` returns the running commit from `RENDER_GIT_COMMIT` (confirmed populated with the full SHA); `deploy.yml` polls it after triggering Render and only goes green once the web service serves the tagged SHA (prefix-tolerant match). "Workflow green" now means "confirmed live," not "queued."
- **#665** `notify-failure` job emails the ops inbox via Resend on any deploy-job failure — CI-gate, Render-trigger, or the #664 verify timeout. Safe no-op (warn + skip) when the GitHub Actions secrets `RESEND_API_KEY`/`OPS_ALERT_EMAIL` are unset.
- **#666** DEPLOYMENT.md deploy definition-of-done: never `git push --no-verify` (the hook runs the exact CI suite incl. `test:coverage`); worktree husky symlink error documented as Task-agent-only, must not auto-skip.

**Key decision**: the verify step is fatal (a post-trigger build failure fails the workflow) rather than advisory — that is the whole point of closing the silent-stale class.

**Lessons learned:**

- **Deploy-verification timeouts must be calibrated to real platform build time.** The first run (v1.5.4) false-failed: Render's build+cutover took ~13 min but the verify timeout was 10, so the step gave up ~3 min before the _successful_ deploy finished. A too-tight verify is worse than none — it cries wolf on good deploys. Raised to 25 min. Measured Render build ≈ 13 min.
- **The false failure validated the feature end-to-end** — verify-live correctly detected "not yet serving the SHA," and notify-failure correctly ran (no-op, since the alert secrets weren't set yet). Enabling alerting _after_ fixing the timeout means a slow-but-successful build won't false-alarm.
- **Config lives where the consumer runs**: the alert secrets are GitHub Actions secrets (the workflow runs there), not Render env vars — easy to put in the wrong place.

**Spec deviations**: none. Owner sets `RESEND_API_KEY`/`OPS_ALERT_EMAIL` as Actions secrets to activate alerting (done post-sprint); the next release will exercise the clean green self-verifying path.

## Sprint R-OVERSIGHT-GOV: oversight.gov (CIGIE) multi-OIG source (#652–655, milestone 103) — ✅ complete 2026-08-02

**Origin**: #606 research (sequenced after CHRG/press-releases at the 7/29 review; owner re-prioritized it 8/1 as the one completable overnight — all unknowns pre-resolved, DHS-OIG machinery reusable end-to-end).

**Planned vs built**: plan executed nearly verbatim; all 4 issues shipped. One fetcher (`oversight-gov-fetcher.ts`) covering 7 OIGs via server-side date-range + submitting-OIG facet queries; 5 signals (OPM→civilService, Treasury+TIGTA→fiscal, State+ICIG→executiveOversight, EAC+FEC→elections); dedicated quarterly-chunk backfill driver with SQL three-numbers precheck and a fetch_log allowlist (never executiveOversight — DOJ/HHS/SSA/DHS own those ledger rows). **2,823 reports 2017→now** (live-verified counts reconciled exactly at dry-run, fetch, and store: 377/1,184/1,262), 95.0% full-text (matching the assessable estimate), scored, assessed (2,680 P1 / 208 flags 7.8% / 215 P2 / 71 concerning), embedded. **31 status flips owner-accepted** (all upward; per-era fairness verified — OIG confirmation rates T1 2.01% / Biden 1.49% / T2 9.63%, differential preserved, NC-4 holds). Completeness spot-checks beat the DHS 75–80% prior: TIGTA FY2025 and OPM FY2024 both 100% parity.

**Key decisions:**

- **State OIG discovery → `ContentItem.contentType`**: State stopped depositing PDFs with CIGIE in **July 2024** (dated to the month from our own corpus; six months pre-transition — attribution matters). Its site 403s us, so those reports are body-unobtainable. Rather than repeat #645 (full_text-labeled stubs), fetchers can now declare `metadata_only` at ingest and document-store honors it; External-Link URLs stored for provenance. 137 rows marked (incl. 32 fiscal). Filed **#656** (per-OIG availability/silence/removal surface — the discontinuity itself is an institutional signal) and **#657** (umbrella: sub-signal publication-discontinuity detection across all sources).
- **NC-3 12% → 14%** (owner-approved): attribution of the new concerning docs put Biden-2022 executiveOversight at 13.5% — 7/52 fed-exec-elevating weeks, every one verified substantive (tipping doc: State OIG NEA `noncompliance_refusal`, ~2,000-day-open recommendations). Raise trajectory (5→8→12→14) recorded on #419 as recalibration evidence. NC-1 elections now 19.9%/20% — calibration watch.
- **Genre disclosure** (owner direction): methodology now states that recurring statutory oversight genres always raise concerns to different degrees at different times, with the cross-era differential (1.5–2% vs ~10%) as evidence content drives classification.
- **Narratives regenerated for flipped T2 weeks only** (12 weeks); baseline flips accept-staled (350) — baseline narratives aren't user-visible.

**Incident (#658, p0)**: `review:backfill --dry-run` makes real AI calls (only the store is gated), blinds itself to existing assessments (assesses MORE than a real run), and its "assessed" summary over-reports even in real runs. A 70-minute elections "preview" burned ≈$20–25 with zero rows. Contained by --category scope; ground-truth reconciliation moved to `ai_document_assessments` row counts. **Total sprint AI spend ≈ $45–55 vs $100 authorization** (legit ≈ $17 vs $15–25 precheck ✓).

**Lessons learned:**

- **A dry-run flag is only a preview if it gates the spend call, not just the store call.** Precheck call-modeling must come from SQL against the eligibility predicate; never trust a tool's --dry-run until its cost path is read.
- **Harness-tracked background tasks were killed three separate times mid-run**; every long prod step now runs `nohup`+`disown`+`caffeinate` with DONE/FAILED marker files and a Monitor covering markers _and_ process-disappearance. Per-unit-idempotent designs (per-week, per-signal-chunk) made every resume clean.
- **Aggregators need per-member availability checks, not just presence checks** — a member OIG can silently stop depositing content while listings continue. Now permanently visible in our own corpus via content_type per submittingOig over time.
- **Uniform instrument + preserved differential = cross-term fairness.** Baselines are a calibrated reference, not a fixed floor; 19 baseline-era upward flips were accepted because the same pipeline moved every era and T2's signal rate (9.63%/doc) stayed 5–6× baselines.

**Spec deviations**: none vs the approved plan; scope additions mid-sprint (contentType plumbing, NC-3 recalibration, #656–658) were each owner-approved or filed as issues.

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
