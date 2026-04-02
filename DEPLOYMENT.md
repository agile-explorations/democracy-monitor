# Deployment

Democracy Monitor deploys on **Render.com** via `render.yaml`. This guide covers initial setup, data strategy, and disaster recovery.

## Initial Deployment

### 1. Bootstrap data for first deploy

On first deploy, `db:init` needs a data source to populate the empty database. Upload a bootstrap dump to GitHub Releases:

```bash
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" > data-dump.pgdump
gh release delete data-latest --yes --cleanup-tag 2>/dev/null
gh release create data-latest \
  --title "Database bootstrap" \
  --notes "Bootstrap dump for first deploy." \
  data-dump.pgdump
```

After the first deploy, the weekly dump cron writes to the persistent disk and `db:init` is no longer needed. GitHub Releases serves only as a bootstrap fallback.

### 2. Deploy to Render

Connect the repo in the Render dashboard. `render.yaml` provisions: web service (with 5GB persistent disk), PostgreSQL, Redis, and cron jobs.

Set these secrets in the Render dashboard:

- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` — Layer 2 AI assessment
- `CRON_SECRET` — shared between the web service and dump cron job (generate with `openssl rand -hex 32`)

### 3. First build auto-restores

The build command runs `pnpm install && pnpm db:init && pnpm build`. On first deploy, `db:init` detects an empty database, tries to download from the app endpoint (which won't exist yet), falls back to GitHub Releases, restores the dump, and runs Drizzle migrations. Subsequent deploys skip the restore and only run migrations.

### 4. Trigger the first dump

After the app is running, trigger the first dump to populate the persistent disk:

```bash
curl -X POST https://democracymonitor.us/api/cron/dump \
  -H "Authorization: Bearer $CRON_SECRET"
```

This runs `pg_dump -Fc` on the web service and saves the result to `/var/data/database.pgdump`. The file is then available at `GET /api/data/dump` for contributor downloads and `db:init --force`.

### 5. Verify

Check that the app loads with historical data, the dump is downloadable at `/api/data/dump`, and cron jobs produce fresh assessment data.

## Data Strategy

### Persistent disk — Weekly dumps

The web service has a 5GB persistent disk mounted at `/var/data`. Every Monday at 05:00 UTC, the dump cron triggers `POST /api/cron/dump`, which runs `pg_dump -Fc` (single file, includes all tables and embeddings) and saves it to the disk. The file is served at `GET /api/data/dump` for public download.

### GitHub Releases — Bootstrap fallback

A GitHub Release (`data-latest`) holds a bootstrap dump for first-deploy scenarios. This is updated manually or infrequently — the persistent disk is the primary source for ongoing dumps.

### Render PostgreSQL — Production data

Live production database. Render provides automatic daily backups (point-in-time recovery on paid plans). This is the primary disaster recovery mechanism.

## Disaster Recovery

In order of preference:

1. **Render automatic backups** — Daily PostgreSQL backups with point-in-time recovery. Fastest option, no data loss on paid plans.

2. **Persistent disk dump** — The latest `pg_dump` on the web service's persistent disk. Re-create the Render database and restore from `GET /api/data/dump`. Loses data since the last weekly dump.

3. **GitHub Release bootstrap** — Delete and recreate the Render database; the next deploy auto-restores from the GitHub Release. May be older than the persistent disk dump.

4. **Re-run pipelines from scratch** — Last resort. Run baseline and backfill pipelines to rebuild data. AI re-assessment costs ~$80+.

## Cron Jobs

| Job               | Schedule         | Purpose                                               |
| ----------------- | ---------------- | ----------------------------------------------------- |
| `weekly-legiscan` | Monday 01:00 UTC | Download bulk legislative datasets from LegiScan      |
| `weekly-snapshot` | Monday 03:00 UTC | Fetch sources, AI assessment, aggregation, narratives |
| `weekly-dump`     | Monday 05:00 UTC | Trigger `pg_dump` on web service → persistent disk    |

## Ongoing Operations

- **Adding schema changes** — Modify `lib/db/schema.ts`, run `pnpm db:generate`, commit the migration. It applies automatically on next deploy.
- **Updating the bootstrap dump** — Only needed if the persistent disk is lost and you need to redeploy from scratch. Run `pg_dump -Fc` and upload to a new GitHub Release.

## Dev Environment

The `develop` branch deploys to a separate Render environment for database-intensive work (backfills, new source ingestion, re-scoring). See `render-dev.yaml` for the service configuration (created manually in the Render dashboard, not via Blueprint).

### Safety controls

- **No emails**: `RESEND_API_KEY` is omitted on dev — the email service gracefully degrades
- **No indexing**: `SEOHead` adds `noindex` when `NEXT_PUBLIC_SITE_URL` isn't the production domain. `robots.txt` blocks all crawlers on non-production sites.
- **No cron jobs**: Pipelines run manually. Use `--dry-run` and `--limit N` for AI pipeline testing to avoid unnecessary API costs.
- **Maintenance mode**: Set `NEXT_PUBLIC_MAINTENANCE_MODE=true` on the production web service before full database pushes.

### Pull production data to dev

Before starting database work, pull the latest production data:

```bash
DATABASE_URL=<dev-db-url> pnpm db:pull-prod
```

Downloads the latest production dump, restores it into the dev database, and runs pending migrations. Set `PROD_URL` to override the production site URL (defaults to `https://democracymonitor.us`).

### Promote dev data to production

Two paths depending on the nature of changes:

**Path 1: Selective promotion (additive changes)**

For new tables, new columns, backfill data. Most common path.

1. Edit `promotion-manifest.json` (copy from `promotion-manifest.json.example`) specifying which tables and date ranges to promote
2. Dry-run to verify: `DATABASE_URL=<dev> PROD_DATABASE_URL=<prod> pnpm db:promote:dry-run`
3. Merge `develop` → `main` — Render deploys, migrations create new tables/columns
4. Promote data: `DATABASE_URL=<dev> PROD_DATABASE_URL=<prod> pnpm db:promote`

The promote script backs up production before making changes, then upserts rows per the manifest. It does NOT run migrations — those are handled by the deploy.

**Path 2: Full database push (destructive changes)**

For dropping tables, removing columns, or changes too broad for a manifest.

1. Set `NEXT_PUBLIC_MAINTENANCE_MODE=true` on Render production web service
2. Push: `DATABASE_URL=<dev> PROD_DATABASE_URL=<prod> pnpm db:push-prod`
3. Merge `develop` → `main` — Render deploys (migrations are a no-op)
4. Remove `NEXT_PUBLIC_MAINTENANCE_MODE` from Render

## For Contributors

To work with the full production dataset locally:

**Automatic (recommended):**

```bash
createdb democracy_monitor   # first time only
pnpm db:init                 # empty DB: downloads dump, restores, migrates
pnpm db:init --force         # existing DB: overwrites with latest production data
```

`db:init` downloads the latest dump from `https://democracymonitor.us/api/data/dump` (a single `pg_dump -Fc` file including all tables and embeddings), restores it, and runs migrations. Falls back to GitHub Releases if the app endpoint is unavailable.

**Manual:**

```bash
curl -LO https://democracymonitor.us/api/data/dump -o democracy-monitor.pgdump
createdb democracy_monitor
pg_restore --clean --if-exists --no-owner --no-privileges -d democracy_monitor democracy-monitor.pgdump
pnpm db:migrate
```
