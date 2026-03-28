# Deployment

Democracy Monitor deploys on **Render.com** via `render.yaml`. This guide covers initial setup, data strategy, and disaster recovery.

## Initial Deployment

### 1. Create the database dump

From a machine with the full local database:

```bash
./scripts/dump-db.sh
```

This creates `data-dump.tar.gz` — a compressed archive containing the database dump (without embedding vectors) and a CSV export of the documents table. Embeddings are excluded to keep the archive under GitHub's 2GB release asset limit. Then upload it to a GitHub Release:

```bash
gh release delete data-latest --yes --cleanup-tag 2>/dev/null
gh release create data-latest \
  --title "Database snapshot" \
  --notes "Database dump (embeddings excluded — run pnpm embeddings:backfill after restore)." \
  data-dump.tar.gz
```

### 2. Deploy to Render

Connect the repo in the Render dashboard. `render.yaml` provisions: web service, PostgreSQL, and Redis.

Set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the Render dashboard. Both are needed for Layer 2 AI assessment.

### 3. First build auto-restores

The build command runs `pnpm install && pnpm db:init && pnpm build`. On first deploy, `db:init` detects an empty database, downloads the archive from the latest GitHub Release, restores it (main dump via `pg_restore`, documents via `COPY`), then runs Drizzle migrations. Subsequent deploys skip the restore and only run migrations.

After initial deploy, run `pnpm embeddings:backfill` to regenerate embedding vectors (excluded from dump to reduce size).

### 4. Enable cron jobs

Once the app is running, enable the cron job definitions in `render.yaml` and redeploy.

### 5. Verify

Check that the app loads with historical data and that cron jobs (once enabled) produce fresh assessment data.

## Data Strategy

Data lives in two places:

### In GitHub Releases — Database archive (embeddings excluded)

Compressed archive (`data-dump.tar.gz`) containing:

- `data-dump.pgdump` — Full `pg_dump` of all tables except documents table data
- `documents-no-embedding.csv.gz` — Documents table without the embedding column

The build command auto-restores from the latest release on first deploy. Contributors can also download it to run the full app locally. Embeddings (~4GB) are excluded — they're regenerable via `pnpm embeddings:backfill`.

This is the authoritative backup of expensive-to-reproduce AI assessment data (~$80+ to regenerate).

### In Render PostgreSQL — Production data

Live production database. Render provides automatic daily backups (point-in-time recovery on paid plans). This is the primary disaster recovery mechanism.

## Disaster Recovery

In order of preference:

1. **Render automatic backups** — Daily PostgreSQL backups with point-in-time recovery. Fastest option, no data loss on paid plans.

2. **GitHub Release archive** — Delete and recreate the Render database; the next deploy auto-restores from the latest release. Loses data since the dump was created, but preserves all AI assessment work. Run `pnpm embeddings:backfill` after restore.

3. **Re-run pipelines from scratch** — Last resort. Run baseline and backfill pipelines to rebuild data. AI re-assessment costs ~$80+.

## Cron Jobs

| Job               | Schedule         | Purpose                                               |
| ----------------- | ---------------- | ----------------------------------------------------- |
| `weekly-legiscan` | Monday 01:00 UTC | Download bulk legislative datasets from LegiScan      |
| `weekly-snapshot` | Monday 03:00 UTC | Fetch sources, AI assessment, aggregation, narratives |
| `weekly-dump`     | Monday 05:00 UTC | Database dump to GitHub Release                       |

## Ongoing Operations

- **Adding schema changes** — Modify `lib/db/schema.ts`, run `pnpm db:generate`, commit the migration. It applies automatically on next deploy.
- **Updating the database dump** — Run `./scripts/dump-db.sh` locally and upload to a new GitHub Release.

## For Contributors

To work with the full production dataset locally:

1. Download the latest archive from [GitHub Releases](https://github.com/agile-explorations/democracy-monitor/releases)
2. Create a local database: `createdb democracy_monitor`
3. Extract and restore:
   ```bash
   tar -xzf data-dump.tar.gz
   pg_restore --clean --if-exists --no-owner --no-privileges -d democracy_monitor data-dump.pgdump
   gunzip -c documents-no-embedding.csv.gz | psql democracy_monitor -c "\copy documents(id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at) FROM STDIN WITH CSV HEADER"
   ```
4. Run migrations: `pnpm db:migrate`
5. Regenerate embeddings (optional, for search/similarity features): `pnpm embeddings:backfill`
