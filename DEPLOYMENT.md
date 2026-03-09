# Deployment

Democracy Monitor deploys on **Render.com** via `render.yaml`. This guide covers initial setup, data strategy, and disaster recovery.

## Initial Deployment

### 1. Create the database dump

From a machine with the full local database:

```bash
./scripts/dump-db.sh
```

This creates `data-dump.pgdump` (~600 MB–1.2 GB compressed). Then upload it to a GitHub Release:

```bash
gh release delete data-latest --yes --cleanup-tag 2>/dev/null
gh release create data-latest \
  --title "Database snapshot" \
  --notes "Full database dump for deployment and contributor setup." \
  data-dump.pgdump
```

### 2. Deploy to Render

Connect the repo in the Render dashboard. `render.yaml` provisions: web service, PostgreSQL, and Redis.

Set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the Render dashboard. Both are needed for Layer 2 AI assessment.

### 3. First build auto-restores

The build command runs `pnpm install && pnpm db:init && pnpm build`. On first deploy, `db:init` detects an empty database, downloads the dump from the latest GitHub Release, restores it with `pg_restore`, then runs Drizzle migrations. Subsequent deploys skip the restore and only run migrations.

### 4. Enable cron jobs

Once the app is running, uncomment the cron job definitions in `render.yaml` and redeploy.

### 5. Verify

Check that the app loads with historical data and that cron jobs (once enabled) produce fresh assessment data.

## Data Strategy

Data lives in two places:

### In GitHub Releases (~600 MB–1.2 GB compressed) — Full database dump

Complete `pg_dump` including all tables. The build command auto-restores from the latest release on first deploy. Contributors can also download it to run the full app locally.

This is the authoritative backup of expensive-to-reproduce AI assessment data (~$47–97 to regenerate).

### In Render PostgreSQL — Production data

Live production database. Render provides automatic daily backups (point-in-time recovery on paid plans). This is the primary disaster recovery mechanism.

## Disaster Recovery

In order of preference:

1. **Render automatic backups** — Daily PostgreSQL backups with point-in-time recovery. Fastest option, no data loss on paid plans.

2. **GitHub Release pg_dump** — Delete and recreate the Render database; the next deploy auto-restores from the latest release. Loses data since the dump was created, but preserves all AI assessment work.

3. **Re-run pipelines from scratch** — Last resort. Run baseline and backfill pipelines to rebuild data. AI re-assessment costs ~$47–97.

## Cron Jobs

Cron jobs are defined in `render.yaml` but commented out until the initial deployment is verified. Once enabled:

| Job                 | Schedule          | Purpose                                                        |
| ------------------- | ----------------- | -------------------------------------------------------------- |
| `daily-snapshot`    | 06:00 UTC daily   | Fetch sources, run Layer 1 + 2 + 3 assessment, store snapshots |
| `hourly-uptime`     | Every hour        | Source availability monitoring                                 |
| `weekly-clustering` | 03:00 UTC Sundays | Semantic clustering analysis                                   |

## Ongoing Operations

- **Adding schema changes** — Modify `lib/db/schema.ts`, run `pnpm db:generate`, commit the migration. It applies automatically on next deploy.
- **Updating the database dump** — Run `./scripts/dump-db.sh` locally and upload to a new GitHub Release.

## For Contributors

To work with the full production dataset locally:

1. Download the latest dump from [GitHub Releases](https://github.com/agile-explorations/democracy-monitor/releases)
2. Create a local database: `createdb democracy_monitor`
3. Restore: `pg_restore --no-owner --no-privileges -d democracy_monitor data-dump.pgdump`
4. Run migrations: `pnpm db:migrate`
