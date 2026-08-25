# Load-test harness (#781, R-LOAD)

Measures search performance against the **dev environment only** — a hard
guard refuses any target matching the prod stack. The lead metric is the
wall-clock a first-time user waits for a **non-cached novel Research
search**, uncontended (owner-defined, 2026-08-25).

## Environment (never committed)

```
LOADTEST_BASE_URL   dev web service URL (https://democracy-monitor-dev...)
LOADTEST_REDIS_URL  dev keyvalue EXTERNAL connection string (enable external
                    access + IP allowlist in the Render dashboard)
CRON_SECRET         dev value — lets collect.ts read /api/health/search-timings
```

## Runbook (one measurement round)

1. Restore + standardize the dev DB: `DATABASE_URL=<dev> pnpm db:pull-prod`
   (verifies row count), then `DATABASE_URL=<dev> pnpm db:prewarm`. Record
   the DB tier — it goes in the report and every comparison.
2. Per profile: `pnpm loadtest:reset` → `pnpm loadtest --profile=p0 --label=<tier>`
   → `pnpm loadtest:collect scripts/loadtest/reports/<run>.json`.
   Profiles: `p0` (lead metric, 5 sequential cold probes), `p1` (browse-only
   baseline), `p2` (browse + one build), `p3` (distinct-build ramp,
   `--questions=0:50`).
3. Commit the finalized report JSONs. Two-tier comparison:
   `pnpm loadtest:collect --compare reports/A.json reports/B.json`.

## Rules

- **Never against prod.** The guard fails closed; don't work around it.
- The 14 eval questions and 12 prewarm questions are measurement
  instruments — the bank asserts disjointness at startup; never add them.
- Synthetic `cf-connecting-ip` headers are a dev-only rate-limit bypass
  (dev sits off Cloudflare, so the header is client-controlled there).
- A probe still 202-polling at 900s is an **incident** (wedged inflight
  slot or dead build), not a data point.
- Deploys during a run invalidate it (cutover kills in-flight builds and
  wedges their questions for the slot TTL).
