# Load-test harness (#781, R-LOAD)

Measures search performance against the **dev environment only** — a hard
guard refuses any target matching the prod stack. The lead metric is the
wall-clock a first-time user waits for a **non-cached novel Research
search**, uncontended (owner-defined, 2026-08-25).

## Budget and gate (owner decision 2026-08-27, #786)

`LEAD_BUDGET` (`profiles.ts`): **cold-novel p50 ≤ 120s, p95 ≤ 240s, zero
DNF probes**, evaluated on per-probe medians across interleaved runs. The
suite is the pre-outreach and post-retrieval-change regression gate:

```
pnpm loadtest:collect --gate reports/A1.json,reports/A2.json   # PASS/FAIL, nonzero exit on FAIL
pnpm loadtest:collect --compare reports/A1.json,reports/A2.json reports/B1.json,reports/B2.json
```

Why medians and interleaving: the tier is storage-I/O-bound, and identical
work varied 35–103s between runs 25 minutes apart (WO-5, 2026-08-27). An
A/B comparison is `reset → A → reset → B → reset → A → reset → B` in one
session with a same-day control of the old code; one run each, or
today-vs-yesterday, is not an experiment.

## Environment (never committed)

```
LOADTEST_BASE_URL   dev web service URL (https://democracy-monitor-dev...)
LOADTEST_REDIS_URL  dev keyvalue EXTERNAL connection string (enable external
                    access + IP allowlist in the Render dashboard)
CRON_SECRET         dev value — lets collect.ts read /api/health/search-timings
```

## Dev-parity pre-flight (before any round)

Same tag as prod, same DB tier, `plan: standard` web, `healthCheckPath`
set — and the **same behavior flags**: `ENUMERATION_MODE=on` must be set
on the dev service (prod runs it; without it every "What documents…"
probe silently takes the 30-doc analytical path and the round measures
the wrong system — caught on the first Round A, 2026-08-26). When
setting env vars via the API: a PUT stores the value but does NOT
restart the service — trigger an explicit deploy
(`POST /v1/services/<id>/deploys`) and wait for it to reach `live`.

## Dev deploys do NOT run migrations

The dev web service's effective build command is `pnpm install && pnpm build`
(no `db:init`, whatever the API reports — verified in the build log
2026-08-27). After deploying a schema change to dev, apply it yourself:
`source .env.dev.local && export DATABASE_URL && pnpm db:migrate` (retry on
`lock timeout` — the index-drop migration waits at most 5s for its lock).

## Runbook (one measurement round)

1. Restore + standardize the dev DB **via an internal Render job** (the
   default — restores over Render's private network in ~25-40 min):

   ```
   curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"startCommand":"NEXT_PUBLIC_SITE_URL=https://democracymonitor.us pnpm db:init --force && pnpm db:prewarm"}' \
     https://api.render.com/v1/services/<dev-service-id>/jobs
   ```

   The `NEXT_PUBLIC_SITE_URL` override is REQUIRED: `db:init` streams the
   dump from `$NEXT_PUBLIC_SITE_URL/api/data/dump`, and the dev service's
   own env points that at dev itself, which 404s (no dump cron on dev) and
   then falls back to a stale GitHub Releases archive whose schema predates
   current columns — a hard `\copy` failure (first attempt, 2026-08-26).
   Prod's endpoint 302s to the current B2 dump object; curl -fL follows it.

   Poll the job via `GET .../jobs/<id>` until `succeeded`, then verify:
   `psql <dev-url> -c 'SELECT count(*) FROM documents'` ≥ 100k. Record the
   DB tier — it goes in the report and every comparison.

   (`DATABASE_URL=<dev> pnpm db:pull-prod` remains for when you want the
   dump locally — but it pushes ~8.5GB of COPY upstream through your uplink
   at ~2.5MB/s: a ~2.5h operation, measured 2026-08-25, with the VPN as an
   extra failure mode. The dev DB disk must be ≥30GB either way — a 15GB
   disk filled mid-restore and Postgres dropped every connection.)

2. Per profile: `pnpm loadtest:reset` → `pnpm loadtest --profile=p0 --label=<tier>`
   → `pnpm loadtest:collect scripts/loadtest/reports/<run>.json`.
   Profiles: `p0` (lead metric, 5 sequential cold probes), `p1` (browse-only
   baseline), `p2` (browse + one build), `p3` (distinct-build ramp,
   `--questions=0:50`).
3. Commit the finalized report JSONs. Two-tier comparison:
   `pnpm loadtest:collect --compare reports/A.json reports/B.json`.

## Retrieval-shape golden guard (#782 WO-5)

`pnpm retrieval:golden --base <dev url> --out FILE [--loadtest N] [--eval]`
captures each question's `?debug=1` retrieval shape; `--diff A B` classifies
differences. **Drift** (exit 1) = `candidatesPreRerank` (ids + arm
provenance, era-order-invariant) or the `alsoSearched` term SET.
**Noise** (reported, not gating) = final `documents` order (uncached
gpt-4o-mini reranker) and the trace's `validated` list (the trace re-runs
the uncached narrowing proposal). Capture with the LLM-draw namespaces WARM — `search:qemb:*` (question
embedding), `search:qexp:*` (proposal), `search:qexpv:*` (validated terms; a
cold one re-runs the uncached narrowing proposal) and `search:qjudge:*`
(salience picks): when arms must be cold, reset with
`--keep=search:qemb:*,search:qexp:*,search:qexpv:*,search:qjudge:*`. A full
reset re-rolls every draw and reports 0/19 "drift" that is pure noise
(learned 2026-08-27); same-code warm pairs are the stability check. Known limit: on multi-era comparative questions the salience
judge's shortlist moves with the reranked pool, so `alsoSearched` can gain
or lose a few salience picks between runs of identical code (measured
2026-08-27: 1 of 19 questions per pair) — read a lone `alsoSearched` drift
on a comparative question against `candidatesPreRerank` before acting.
Baselines + WO-5 captures live in `reports/golden/`.

### Seed stage rows (since WO-5)

`seed-expansion` (LLM propose + validation counts; runs FIRST and alone —
usually a cache hit, the caller already expanded) · `seed-vector-<tier>` · `seed-mining-prep` (candidate text fetch +
extraction) · `seed-alias-arms` (LLM-alias arm execution) · `seed-mining`
(known-filter → mined validation → mined arms, alongside alias arms) ·
`seed-extra-arms` · `seed-fuse-hydrate` · `seed-snippets`. Alias arms
overlap the vectors → mining chain; era builds emit the same rows prefixed
`<era>:`.

### Cache telemetry (since #787)

Every build row in `search_timings` carries `cache_stats` (arm and validation-count hits/misses for that build); `collect` summarizes them as `cache.armHitRate` / `cache.countHitRate` over the run's build rows, and the Render log line `[search] build <hash>: … — arms h/n hit, counts h/n hit` shows it per build. The Monday post-dump replay (`pnpm aliases:replay`, #788) pre-pays every miss the previous data week ledgered, most recently demanded first, under `ALIAS_REPLAY_BUDGET_MS` (default 25 min) at `ALIAS_REPLAY_CONCURRENCY` (default 4) — a P0 on previously-seen questions should then report hit rates near 1.

### DB budget knobs (since WO-5)

`DB_CONCURRENCY_PER_WINDOW` (default 8, [1,16]): concurrent DB statements
one research window may hold across ALL its stages (validation counts,
vector scans, alias/mined arms, mining text fetch); a request's budget is
this × its window count, so a 3-era comparative gets 24 — the envelope
each path had before the overlap. `DB_WORK_CONCURRENCY` (default 0 = off):
optional process-wide ceiling on top, for incidents/sweeps. Measured
2026-08-27: ungated overlap oversubscribed the 2-vCPU DB; a process-wide
cap of 8 fixed single-window builds (1c finished for the first time) but
throttled the era path — hence per-window.

## Rules

- **Interleave A/B runs.** The tier is storage-I/O-bound (DB CPU ≤0.2 of 2
  vCPU during runs); identical work varied 35–103s between runs 25 min
  apart. Any perf comparison needs A/B/A/B in one session, medians
  compared, and a same-day control run of the old code — one run each, or
  today-vs-yesterday, is not an experiment (learned on WO-5, 2026-08-27).
- **Never against prod.** The guard fails closed; don't work around it.
- The 14 eval questions and 12 prewarm questions are measurement
  instruments — the bank asserts disjointness at startup; never add them.
- Rate limits are neutralized by the runner clearing `rl:*` every 30s
  (recorded as `rateLimitsNeutralized` in the run metadata). Synthetic
  `cf-connecting-ip` headers do NOT work: `onrender.com` transits
  Cloudflare, which 403s any client-supplied `cf-connecting-ip`
  (error 1000; learned on the first real P0, 2026-08-26) — so all
  harness traffic shares the runner's real IP.
- A probe still 202-polling at 900s is an **incident** (wedged inflight
  slot or dead build), not a data point.
- Deploys during a run invalidate it (cutover kills in-flight builds and
  wedges their questions for the slot TTL).
