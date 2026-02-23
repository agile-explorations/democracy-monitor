# Deployment

Democracy Monitor deploys on **Render.com** via `render.yaml`. This guide covers initial setup, data strategy, and disaster recovery.

## Initial Deployment

1. **Create services** — Connect the repo in the Render dashboard. `render.yaml` provisions: web service, PostgreSQL, Redis, and 4 cron jobs.

2. **Set API keys** — In the Render dashboard, set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` on the web service (these sync to crons via `render.yaml`). Both are needed for Layer 2 AI assessment.

3. **Deploy** — The build command runs `pnpm install && pnpm db:migrate && pnpm build`, so schema changes apply automatically on every deploy.

4. **Restore database** — One-time restore from the latest GitHub Release:

   ```bash
   pg_restore -h <render-host> -U <user> -d epd data-dump.pgdump
   ```

   This loads all historical data including AI assessments. Without this step, the app starts empty and builds data from daily cron runs.

5. **Verify** — Check that `daily-snapshot` fires at 06:00 UTC and produces assessment data.

## Data Strategy

Data lives in three places, each serving a different purpose:

### In git (~93MB) — Local dev fixtures

Lightweight fixtures for local development: assessments, baselines, document scores, weekly aggregates, intent weekly, and a document manifest. Updated via `pnpm seed:export`.

These let any contributor run the full app without API keys (`pnpm seed:import`).

### In GitHub Releases (~500MB-1GB compressed) — Full database dump

Complete `pg_dump` including `documents` and `ai_document_assessments` tables. Updated after major baseline runs (e.g., after paying for Layer 2 AI assessment).

This is the authoritative backup of expensive-to-reproduce AI assessment data.

### In Render PostgreSQL — Production data

Live production database. Render provides automatic daily backups (point-in-time recovery on paid plans). This is the primary disaster recovery mechanism.

## Disaster Recovery

In order of preference:

1. **Render automatic backups** — Daily PostgreSQL backups with point-in-time recovery. Fastest option, no data loss on paid plans.

2. **GitHub Release pg_dump** — Restore the latest release dump. Loses data since the dump was created, but preserves all AI assessment work.

   ```bash
   pg_restore -h <render-host> -U <user> -d epd data-dump.pgdump
   ```

3. **Seed fixtures + re-run** — Last resort. Import fixtures (`pnpm seed:import`) then re-run baseline and backfill pipelines. AI re-assessment costs ~$47-97.

## Cron Jobs

| Job                 | Schedule          | Purpose                                                        |
| ------------------- | ----------------- | -------------------------------------------------------------- |
| `daily-snapshot`    | 06:00 UTC daily   | Fetch sources, run Layer 1 + 2 + 3 assessment, store snapshots |
| `daily-digest`      | 07:00 UTC daily   | Generate AI summary of the day's findings                      |
| `weekly-clustering` | 03:00 UTC Sundays | Semantic clustering analysis                                   |
| `hourly-uptime`     | Every hour        | Source availability monitoring                                 |

`daily-digest` runs one hour after `daily-snapshot` so it has fresh data to summarize.

## Ongoing Operations

- **Adding schema changes** — Modify `lib/db/schema.ts`, run `pnpm db:generate`, commit the migration. It applies automatically on next deploy.
- **After baseline runs** — Export a fresh pg_dump and attach it to a new GitHub Release.
- **Updating fixtures** — Run `pnpm seed:export` locally and commit the updated fixture files.
