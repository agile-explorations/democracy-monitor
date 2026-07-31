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

Connect the repo in the Render dashboard. `render.yaml` provisions: web service (with a persistent disk — size it to hold one full dump, currently ~6.2 GB and growing; 15 GB recommended), PostgreSQL, Redis, and cron jobs.

Set these secrets in the Render dashboard:

- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` — Layer 2 AI assessment
- `CRON_SECRET` — shared between the web service and dump cron job (generate with `openssl rand -hex 32`)
- `ORIGIN_SHARED_SECRET` — origin↔Cloudflare shared secret (#620); see below

### Cloudflare origin protection (#620)

The origin (Render) is directly reachable by IP + Host header, which would bypass Cloudflare's WAF/rate-limiting. `middleware.ts` rejects requests lacking the Cloudflare-injected `x-dm-origin` header — but **only once enforcement is explicitly enabled** (#622). Two independent safety gates mean a deploy can never take the site down: it's inert unless `NODE_ENV=production` AND `ORIGIN_SHARED_SECRET` is set, and even then it only **logs** mismatches until `ORIGIN_ENFORCE=true`. `/api/health/live`, `/api/cron/*`, and `/api/csp-report` are allowlisted.

**Two-stage rollout (deploying is always safe; enforcement is a deliberate switch):**

1. Cloudflare → Rules → Transform Rules → Modify Request Header → **Set** `x-dm-origin` = `<secret>` on all incoming requests.
2. Set `ORIGIN_SHARED_SECRET` (same value) in the Render dashboard. `openssl rand -hex 32`. **Leave `ORIGIN_ENFORCE` unset.**
3. Deploy. The guard runs in **log-only** mode: watch the logs — `[origin-guard] log-only: x-dm-origin missing/mismatch …` warnings mean Cloudflare's header isn't matching yet. Quiet logs (with real traffic flowing) mean it matches.
4. **Only after the logs are quiet**, set `ORIGIN_ENFORCE=true` in Render. Now direct-to-origin hits get 403. Verify: a request to the Render origin IP without the header → 403; normal Cloudflare traffic → 200.

> A prior version fail-closed the instant the secret was set; a value mismatch 403'd all traffic on deploy (2026-07-31). The log-only stage removes that failure mode — never set `ORIGIN_ENFORCE=true` before the logs confirm a match.

Rotate the secret on the same cadence as `CRON_SECRET` (update Render + the Transform Rule together; the log-only stage re-confirms the match after a rotation).

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

The web service has a persistent disk mounted at `/var/data` (must hold one full dump — ~6.2 GB and growing; the previous dump is deleted before each new one is written, so peak usage is a single dump). Every Monday at 05:00 UTC, the dump cron triggers `POST /api/cron/dump`, which runs `pg_dump -Fc` (single file, includes all tables and embeddings) and saves it to the disk. The file is served at `GET /api/data/dump` for public download.

### GitHub Releases — Bootstrap fallback

A GitHub Release (`data-latest`) holds a bootstrap dump for first-deploy scenarios. This is updated manually or infrequently — the persistent disk is the primary source for ongoing dumps.

### Render PostgreSQL — Production data

Live production database. Render provides automatic daily backups (point-in-time recovery on paid plans). This is the primary disaster recovery mechanism.

## Disaster Recovery

In order of preference:

1. **Render automatic backups** — Daily PostgreSQL backups with point-in-time recovery. Fastest option, no data loss on paid plans. Only survives if the Render account is intact.

2. **Persistent disk dump** — The latest `pg_dump` on the web service's persistent disk. Re-create the Render database and restore from `GET /api/data/dump`. Loses data since the last weekly dump. Also tied to the Render account.

3. **Backblaze B2 off-site backup** — The only copy that survives losing the entire Render account (billing lapse, compromise, deletion). See the step-by-step below. Backups are retained ~360 days; the most recent ~30 days are Object-Lock immutable and cannot be deleted even with a compromised key.

4. **GitHub Release bootstrap** — Delete and recreate the Render database; the next deploy auto-restores from the GitHub Release. May be months stale — bootstrap only.

5. **Re-run pipelines from scratch** — Last resort. Run baseline and backfill pipelines to rebuild data. AI re-assessment costs ~$80+.

### Restoring from Backblaze B2 (off-site — read this first if you are a successor)

If Democracy Monitor's operator is unavailable and the Render account is gone, the durable copy lives in a Backblaze B2 bucket. **A complete restore needs BOTH objects** for each date: `database-YYYY-MM-DD.pgdump` (the full corpus and analysis, no PII) **and** `pii-tables-YYYY-MM-DD.pgdump` (the subscriber list and feedback). Restoring only the first brings the site back but loses the newsletter audience.

**Credentials required** (in the operator's password manager / emergency access, and mirrored as `B2_*` in the Render dashboard): the B2 bucket name and either the B2 account login or an application key (`B2_KEY_ID` + `B2_APP_KEY`), plus the S3 endpoint (`B2_ENDPOINT`, e.g. `https://s3.us-west-004.backblazeb2.com`).

**Steps:**

1. Download the newest pair from the bucket's `db-backups/` prefix — via the B2 web UI, or any S3 client pointed at `B2_ENDPOINT` with the key (e.g. `aws s3 --endpoint-url "$B2_ENDPOINT" cp s3://<bucket>/db-backups/database-<date>.pgdump .` and the matching `pii-tables-<date>.pgdump`).
2. Create a fresh PostgreSQL 17 database (Render or anywhere) and enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Restore the corpus (creates all tables, including empty `subscribers`/`feedback`), then load the PII data into them (the companion dump is data-only):
   ```
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" database-<date>.pgdump
   pg_restore --data-only --no-owner --no-privileges -d "$DATABASE_URL" pii-tables-<date>.pgdump
   ```
4. Apply any newer migrations: `pnpm db:migrate` (see the destructive-migration gate note under Ongoing Operations).
5. Point a new deploy at the restored database.

**Succession note:** this runbook is only usable if a successor can reach the B2 and Render credentials. Keep them in the password manager's emergency-access feature (or a sealed document) so recovery is possible within the ~360-day retention window.

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

`db:init` downloads the latest dump from `https://democracymonitor.us/api/data/dump` (a single `pg_dump -Fc` file including all tables and embeddings), restores it, and runs migrations. If the app endpoint is unavailable it falls back to the GitHub Releases archive **only when the database is empty** (first-deploy bootstrap); on a non-empty database `db:init --force` aborts instead — the release archive can be months stale and must never overwrite real data.

**Manual:**

```bash
curl -LO https://democracymonitor.us/api/data/dump -o democracy-monitor.pgdump
createdb democracy_monitor
pg_restore --clean --if-exists --no-owner --no-privileges -d democracy_monitor democracy-monitor.pgdump
pnpm db:migrate
```
