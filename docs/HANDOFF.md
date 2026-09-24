# Handoff — 2026-09-24

Written on the interim laptop before moving back to the primary machine. Everything below was verified against production, GitHub and the Render logs on 2026-09-21 and 2026-09-24. Older sprint history lives in `docs/DECISIONS.md`; standing rules in `docs/PROJECT_KNOWLEDGE.md`; this file is the "what is in flight right now" view.

## 1. Release and repo state

| Item                   | State                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production             | v1.33.0 (`main` = a85ae4f, tag pushed 2026-09-18). All crons run this build.                                                                                                                                                |
| `develop`              | Two commits ahead of `main`, both unreleased: 49b0383 (hygiene thresholds re-based to the v1.33.0 prod level, #915) and fdeabd9 (R-ALIAS-TAIL retrospective + docs). Nothing runtime-affecting; ship with the next release. |
| Local working tree     | Clean and equal to `origin/develop`. On 2026-09-24 the index on this laptop was stale (built from an older tree: 94 phantom deletions, 99 phantom modifications). `git reset` fixed it without touching the worktree.       |
| Dev environment        | `democracy-monitor-dev` web + `epd-db-dev` both SUSPENDED (`pnpm dev:resume` to use; `pnpm db:prewarm` after). Dev DB data ends 2026-08-24 and is not refreshed by the cron.                                                |
| Interim-laptop caveats | No local `psql` (query prod/dev through the repo's node `pg` driver). `.env.local` and `.env.prod.local` were recreated from Render env vars; `RESEND_API_KEY` is blank locally on purpose, so digest sends are owner-run.  |

## 2. Monday 2026-09-21 cron — first live run on the late-arrival fix (v1.31)

All three jobs finished. Snapshot status "partial" means advisories only; no category failed.

| Job                                   | Result                                                                                                      | Duration                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| LegiScan (01:00 UTC)                  | success, 2,488 bills, 5 sessions                                                                            | 1.5 min                                                                                                     |
| Snapshot (03:00 UTC, cron_runs id 81) | partial, 14/14 categories, 41 embeddings, narratives stored (14 categories + weekly summary + term summary) | 124 min (reference clean run: 112)                                                                          |
| Dump (05:00 UTC, dump_runs id 10)     | complete, verified, 8.30 GB, offsite uploads OK                                                             | 21 min, then alias replay 25 min (763 arms warmed, 3 failed, 4,114 skipped at the 1,500 s budget) + prewarm |

Stage timings: category fetch + L2 03:01→03:45; CPD/CREC/CHRG 03:45→03:55; final L2 pass →04:13; narratives 04:14→04:28; parity + validations 04:35→04:40; hot entities 04:39→05:05 (26 min, 343,837 docs scanned, 2,197 entity rows).

L2 spend: 688 Pass-1 + 235 Pass-2 rows written vs 581 + 155 the previous Monday. The increase is the late-arrival re-derivation (executiveOversight alone re-derived 38 prior weeks from 102 late GAO Wayback captures).

Current-week statuses (week of 2026-09-14):

| Status           | Categories                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ConfirmedConcern | civilLiberties (52 docs), executiveActions (70), immigrationEnforcement (121), rulemaking (61)                                                                |
| Elevated         | civilService, elections, executiveOversight, judicialIndependence, lawEnforcement (CC gate applied: 6 discussion-confirmed, 0 action), mediaFreedom, military |
| Stable           | fiscal, hatch, infoAvailability                                                                                                                               |

### 2a. The late-arrival runner worked — ✅ all four flips accepted 2026-09-24 (issue 825 comment; ledger entries committed e48a3ff)

Late items were re-derived into their own weeks (the `late-arrival:` log lines). Four status flips resulted. **None is ledgered yet** — each needs a `lib/data/reversals-ledger.ts` entry before the next release (this is a ledger requirement, not a digest hold):

1. **immigrationEnforcement 2026-09-07: Stable → Elevated.** OIG unannounced inspection of ICE's Florida soft-sided facility ("Alligator Alcatraz"), published 09-11, fetched 09-21. Pass 2: `noncompliance_refusal` 0.92 — DHS refused all ten recommendations. Solid.
2. **lawEnforcement 2026-08-10: Stable → Elevated.** EO 14420 (childhood vaccine recommendations) + the signing remarks, late CPD arrivals (CPD lags ~6 weeks). `formal_override` 0.85 / 0.72 on the clause directing the Attorney General to litigate against state exemption laws.
3. **rulemaking 2026-08-10: Stable → Elevated.** Same signing remarks, `formal_override` 0.88 (bypasses ACIP).
4. **judicialIndependence 2026-08-10: Stable → Elevated.** Same EO 14420, `formal_override` 0.85. Weakest of the four: the reasoning is federal-vs-state override, not the judiciary. Owner should eyeball before ledgering.

### 2b. Baseline writes — ✅ all four run 2026-09-24 with `--confirm-baseline` (0 flips each, NC 6/6, parity 217/217)

The runner correctly refused to touch baseline weeks. Seven late GAO reports dated Oct 2024–Jan 2025 want these repairs (each an owner-approved baseline write):

```
pnpm pipeline:repair --from 2024-10-14 --to 2024-10-20 --confirm-baseline
pnpm pipeline:repair --from 2024-12-09 --to 2024-12-15 --confirm-baseline
pnpm pipeline:repair --from 2024-12-16 --to 2024-12-22 --confirm-baseline   # also fixes parity agg=216 / scores=217
pnpm pipeline:repair --from 2025-01-06 --to 2025-01-12 --confirm-baseline
```

### 2c. Digest for 2026-09-14 — ✅ RELEASED 2026-09-24 (row fix + repair 2025-10-20..11-23, 0 flips, G7 = 0, summary regenerated to 621 docs, sent to 3; code follow-ups filed as #918 / #919)

Original note kept for the record:

`validate:graph` reported **G7 = 1 (gao)**: one assessment sits in the wrong week. Still unfixed as of 2026-09-24 (row unchanged; no repair run since Monday).

- Row: `ai_document_assessments` id **1688319** (audit-sample Pass 2, `routine` 0.95) stamped `week_of = 2025-10-20`.
- Document: id 2139748, GAO report gao-26-108784 "340B Drug Discount Program…", stored `published_at = 2025-11-18` (first ingested 2026-08-21; the Pass-1 row from then is correctly stamped 2025-11-17).
- The Wayback capture used on 09-21 reads: `Published: Oct 23, 2025. Publicly Released: Nov 17, 2025.`
- `parseReleaseDate` in `lib/services/gao-parsers.ts` takes the first date it finds — GAO's internal "Published" (embargo) date — although the fetcher header says items carry their true release date.
- The document-store upsert never refreshes `published_at` on re-fetch, so the late-arrival grouping (keyed on the fetched item's date, 2025-10-23 → week 2025-10-20) diverged from the stored document (2025-11-18 → week 2025-11-17). The 2025-10-20 aggregate was also recomputed needlessly (26 docs, harmless).

**Fix path (owner-run prod writes, current term only, no baseline rows):**

```sql
UPDATE ai_document_assessments SET week_of = '2025-11-17' WHERE id = 1688319;
```

```
pnpm pipeline:repair --from 2025-10-20 --to 2025-11-23      # expect 0 flips, NC 6/6
pnpm validate:graph                                          # G7 must read 0
pnpm digest:send --week 2026-09-14                           # after reviewing the summary
```

**Code follow-up to file (not yet an issue):** (a) prefer "Publicly Released" over "Published" in the GAO parser, with a test on the two-date line above; (b) make the late-arrival grouping use the STORED `published_at` after the upsert, not the fetched item's date, so parser drift can never produce a G7 again. Related open issue #905 (ledger unparseable GAO captures).

### 2d. Minor noise from the run

- SSA OIG `/audit-reports/2026/` 404 after 4 attempts — already tracked as **#849** (site restructured; unhealthy since 2026-09-07).
- Wayback CDX 504 once (retried OK); two GAO replay 500s (skipped).
- `robots.txt fetch failed for api.gdeltproject.org` at startup (GDELT reachability from Render is the open #867 question).
- 2 CPD documents unrouted (corpus only), 64 unmapped CPD subjects logged.

Tipwire daily polls (21:30 UTC) ran clean every night 09-18 → 09-23; one tip judged and sent on 09-19, zero otherwise.

## 3. Owner decisions outstanding (in priority order) — items 1–3 DONE 2026-09-24; item 4 ran (packet in `~/democracy-monitor-gates/tipwire-beat-2026-09-24/`, owner scoring pending); item 5 superseded by R-TIPWIRE-5 (milestone 144, Brave Search provider built on develop 6c2e77b, gate #924 pending)

1. Run the G7 fix + repair, then release the 2026-09-14 digest (§2c).
2. Accept or reject the four flips; then the ledger entries get written (§2a).
3. Approve or defer the four baseline repairs (§2b).
4. **R-TIPWIRE-4 gate #878** (milestone 139): the beat dry run over all 11 reporters has not been run/scored on prod. On PASS: flip the eight feedless reporters active, release, close #878 + milestone 139.
5. **#867 / #861** (milestone 138): GDELT reachability from Render — open until a scheduled poll reads `ok`; no reply from GDELT as of last check.
6. **#851**: seven baseline eras still carry pre-filter infoAvailability / executiveOversight baseline stats (`baselines:compute` × 7, each a baseline write).
7. 81 informational document-total drifts in older weekly summaries (from the #884 restamp) — regenerate or accept.
8. Queued product idea (owner, 2026-09-07): per-category narrative subscriptions in addition to the weekly summary. Not scoped. Subscriber count was 3 at the time; measure demand before building.

## 4. Corpus backfill still to do

Context: R-SEARCH-ORTHOGONAL (v1.32.0, runbook #897 closed 2026-09-16) made the corpus independent of the analysis and recovered what the fetchers had discarded. Phase 1 (forward ingest stores unrouted rows under `corpus`) and Phase 2 (recovery) are DONE on prod: FR 325, CL 15, CHRG 903, CPD 3,042, DOJ 1,386, CREC current term 10,371 documents (16,042 rows), then 17,329 embeddings; hero count 299,935 → 315,860. Everything below is what was deliberately deferred or was never in scope. None of it has started.

**Phase 3 — milestone 142 (#898–#906), all p2, deferred by owner decision 2026-09-15.** The issue bodies are one-liners; the plan and inventory are in the R-SEARCH-ORTHOGONAL entry of `docs/DECISIONS.md` (diagnostic paragraph) and on the milestone.

| Issue | Backfill                                                                                                          | Size / cost                              | Blocker or note                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| #898  | CREC 2017–2024 re-enumeration into corpus (the drops were never recorded, so re-enumeration is the only recovery) | ~4.5 GB, ~$10 embeddings                 | Disk decision. Storage autoscaling is on, but the dump (8.3 GB, 21 min) and prewarm grow with it. |
| #899  | CREC procedural/amendment subclasses (`SAMENDMENTTEXT*`, appropriations text) as corpus rows                      | not sized                                | Forward + historical; needs the splitter to skip them as it does other corpus granules.           |
| #900  | LegiScan zero-category bills as corpus rows                                                                       | ~37k thin title+description rows, 0.6 GB | Low search value per row; owner deferred.                                                         |
| #901  | DHS CBP local-media-release port roundups                                                                         | not sized                                | Falls under the scraping exception; needs the same robots/canary discipline as tipwire.           |
| #902  | RECAP short court orders (`skip_short_order`) as corpus rows; party papers stay drops                             | not sized                                | Forward change in the CL fetcher plus a bounded historical pass.                                  |
| #903  | CHRG `no_text` hearings: retry when GPO publishes the text                                                        | ledgered in `chrg_seen_ledger`           | Analysis gap, not just corpus: those hearings never get scored either.                            |
| #904  | Corpus promotion: routing-reapply treats corpus rows as candidates when routing terms expand                      | code change, no data run                 | Without it, a row stored as `corpus` never becomes evidence even after the keyword lists grow.    |
| #905  | GAO unparseable Wayback captures: ledger the productId instead of console-only                                    | code change                              | Closely related to the G7 parser finding in §2c; do them together.                                |
| #906  | DOJ full feed: drop the component allowlist (Tax/ENRD/Civil routine case releases)                                | ~48% of the DOJ feed                     | Gated on measuring pool hygiene with the allowlist in place first (#916/#917 metric).             |

**Content repairs outside milestone 142 (older, still open):**

- **#742 (p1)** — 10,932 CourtListener opinions stored truncated at exactly 8,000/8,001 chars (pre-cap-removal vintage). Their search vectors and embeddings were built from the truncated text, so retrieval is blind past char 8,000. Work: a `cl` handler for `backfill:content`, re-fetch via the CL API or local bulk staging, null `embedded_at` for re-embedding. No AI re-assessment expected; verify on a sample first.
- **#736 (p1)** — CPD CSS re-extract and the legacy 8k truncation refetch for FR/CPD (same vintage as #742), plus the synthesis excerpt budget.
- **#903** above is also an analysis-coverage backfill once the text exists.

**Sources never ingested (research proposals, not backfills of existing sources):** #770 GAO B-number decisions (impoundment/appropriations), #732 OMB memoranda (M-25-xx/M-26-xx), #771 verify minority views in congressional reports. GAO reports themselves are ingested via Wayback since #739 (closed).

**Baseline-era caveat for any of the above:** historical runs that touch weeks before 2025-01-20 (all of #898, parts of #900/#906 with `--baselines`) need one owner approval per `--confirm` run and an `nc:margins` diff before/after, as the #897 runbook did. Restores go through `pnpm corpus:restore --source … --max-docs N` (dry-run default, exit 3 on cap), then `embeddings:backfill --all-dates --dry-run` and a capped run, then `pnpm cache:bust --key document-count` as a Render one-off job.

## 5. Other open work by theme (see `gh issue list` for the full 60)

- **Milestone 133 R-DETECT-HEALTH** (#836 audit index, #838 P1 recalibration, #839 rollup double-count).
- **Milestone 124 R-LOAD** (#779–#782): pre-outreach load testing, outreach-gate.
- **Search quality follow-ups** from R-ALIAS-TAIL: #916 (seed-sweep overlap), #917 (earned vs question-blind recurrence metric); older: #807–#811, #831, #746–#750.
- **Data bugs p1**: #742 (10,932 truncated CL opinions), #785 (db:init destructive fallback), #797 (SCOTUS removal-power opinions unrouted), #849 (SSA OIG), #860 (Google News RSS robots).
- **Late-arrival follow-ups**: #885 (2,423 non-Monday `week_of` rows: CL 2,306, LegiScan 105), #886 (term series for the summary writer).
- **Not yet filed**: GAO parser/grouping fix (§2c); pg pool has no TCP keepalive or query timeout, so a network drop leaves CLI runs hung forever (seen during #897 embeddings); pre-push hook load flakes on the interim laptop (environmental, may not apply on the primary machine).

## 6. How-tos that were re-learned on the interim laptop

- **Read-only prod probe without psql**: write a small `.cjs` that requires `node_modules/pg`, `source .env.prod.local && export DATABASE_URL && node --no-warnings probe.cjs`. Use `ssl: { rejectUnauthorized: false }`. Never print the URL.
- **Cron logs**: `render logs -r <crn> --start <ISO> --end <ISO> -o text --confirm --limit 1000`. Ids: snapshot `crn-d6pikr3h46gs73c76h00`, dump `crn-d6n645haae7s73b77aa0`, legiscan `crn-d6n645haae7s73b77ac0`, tipwire `crn-dafk5s740ujc73blh0jg`. `render services get` does not work for cron ids.
- **Redis-touching CLIs against prod** (`aliases:replay`, `cache:bust`): prod Redis is internal-only, so run them as Render one-off jobs: `render jobs create srv-d6mli9fgi27c73bvinhg --start-command "pnpm <script>" --confirm`. The logs API returns nothing for jobs; check effects in the DB/UI.
- **Dev lifecycle**: `pnpm dev:status | dev:suspend | dev:resume` (needs `RENDER_API_KEY`). Env-var changes restart dev without a deploy record.
- **Hygiene gate**: `pnpm retrieval:hygiene --base https://democracymonitor.us --out FILE --refresh --gate` (`--refresh` is required after any deploy; pools cache 7 days). Prior captures live in `~/democracy-monitor-gates/` on the interim laptop — copy them if the numbers matter (at-prod-post-2026-09-18.json is the v1.33.0 gate result: shared 60 / recurring 66 / arm share 14% / cosine 0.50).
- **Snapshot "partial"** is expected whenever any advisory is recorded (held digest, baseline skips, flips). Look at `cron_runs.errors` for the list; it is not a failure.
