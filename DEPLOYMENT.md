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

### Direct-origin reachability (not solved in-app — see #623)

The Render origin is reachable by shared IP + `Host` header, which bypasses Cloudflare's WAF/rate-limiting. A shared-secret header approach (`x-dm-origin` injected by a Cloudflare Transform Rule, checked in `middleware.ts`) was built and **removed** (2026-07-31): Render fronts every service with _its own_ Cloudflare, so requests arrive orange-to-orange and that second Cloudflare strips custom request headers before they reach the app — the injected header never survives, making the check unenforceable. Do not re-implement it. The real fix is a **Cloudflare Tunnel** (#623), which removes the origin's public ingress entirely so there is no bypass to guard against. Until then, the residual risk is bounded by in-app rate-limiting and Render's own edge; the origin has no un-authenticated write paths.

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

The web service has a persistent disk mounted at `/var/data` (must hold one full dump — ~6.2 GB and growing; the previous dump is deleted before each new one is written, so peak usage is a single dump). Every Monday at 05:00 UTC, the dump cron triggers `POST /api/cron/dump`, which runs `pg_dump -Fc` (single file, includes all tables and embeddings) and saves it to the disk.

The dump is served at `GET /api/data/dump`. To keep 6.2 GB of egress off the origin (#636), the cron also uploads the corpus dump to a **public B2 download bucket** (a separate bucket from the backup one, public-read, no Object Lock, stable key `database.pgdump`, its own write-only key that can't read the PII backups), and `/api/data/dump` **302-redirects** there when the object exists — falling back to streaming the local file if the B2 copy isn't configured or present yet. Env: `B2_DOWNLOAD_BUCKET`, `B2_DOWNLOAD_KEY_ID`, `B2_DOWNLOAD_APP_KEY` (dashboard).

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

### Off-site repo backup — the code (#624)

The **code** has its own off-platform backup, parallel to the database's. The `Off-site repo backup` GitHub Action (`.github/workflows/backup-repo.yml`) runs weekly (Mondays 06:00 UTC) and on manual dispatch: it `--mirror` clones the repo, creates a full-history `git bundle --all` (every branch + tag), and uploads it to the **same B2 bucket** under `code-backups/repo-<date>.bundle`. Object Lock makes it immutable for the retention window, so the repository survives losing the GitHub org entirely.

**One-time setup** — add the B2 credentials as repo **Actions secrets** (GitHub → Settings → Secrets and variables → Actions): `B2_ENDPOINT`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APP_KEY` (the same values already on Render for the DB backup). Confirm the bucket's Object-Lock / lifecycle rules are bucket-wide (or also cover the `code-backups/` prefix). The Action fails loudly if a secret is missing.

**Restore** — download the newest bundle from B2 and clone it; no GitHub required:

```
aws s3 --endpoint-url "$B2_ENDPOINT" cp s3://<bucket>/code-backups/repo-<date>.bundle .
git clone repo-<date>.bundle democracy-monitor   # working repo (main checked out)
# or, to re-seed a new remote exactly:
git clone --mirror repo-<date>.bundle democracy-monitor.git
```

## Cron Jobs

| Job               | Schedule         | Purpose                                               |
| ----------------- | ---------------- | ----------------------------------------------------- |
| `weekly-legiscan` | Monday 01:00 UTC | Download bulk legislative datasets from LegiScan      |
| `weekly-snapshot` | Monday 03:00 UTC | Fetch sources, AI assessment, aggregation, narratives |
| `weekly-dump`     | Monday 05:00 UTC | Trigger `pg_dump` on web service → persistent disk    |

### Feedback moderation (#668–671)

User feedback is **not shown publicly until approved** — new submissions land with `approved=false`, gated out of `GET /api/feedback`. The feedback form is protected by **Cloudflare Turnstile**, and each submission emails `OPS_ALERT_EMAIL` with the approve/reject command. Moderation is a **CLI** — no web auth surface; **DB credentials are the authorization**.

**One-time setup:**

1. **Cloudflare dashboard → Turnstile** → add a widget for `democracymonitor.us`; copy the **site key** and **secret key**.
2. **Render env**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, build-time) and `TURNSTILE_SECRET_KEY` (secret). Without them, the widget hides and server verification is skipped (fine for dev; do set them in prod). `OPS_ALERT_EMAIL` is reused from the ops-alert config.

**Moderating** (locally or from a Render shell, against prod):

```bash
pnpm feedback:moderate                          # list pending submissions
pnpm feedback:moderate -- --approve <id>        # reveal on the public page
pnpm feedback:moderate -- --reject <id>         # delete
pnpm feedback:moderate -- --respond <id> "..."  # public reply + publish + email the submitter
pnpm feedback:moderate -- --respond             # interactive: pick a post, then type a reply
```

`--respond` posts a reply that appears under the item on the public feedback page, auto-publishes the item (so the reply is visible), and emails the submitter the reply when they left an address. The email reuses the Resend config.

Run with a bare `--respond` (no id) for an interactive numbered menu of **every** post — pending and already-public, each tagged — so you can find and reply to any item without hunting for its id. Pick a number, then type your reply and finish with a single `.` on its own line. This form needs a real terminal (works in a local shell or the Render web shell); the `--respond <id> "..."` form stays available for scripting.

## Ongoing Operations

- **Adding schema changes** — Modify `lib/db/schema.ts`, run `pnpm db:generate`, commit the migration. It applies automatically on next deploy.
- **Updating the bootstrap dump** — Only needed if the persistent disk is lost and you need to redeploy from scratch. Run `pg_dump -Fc` and upload to a new GitHub Release.

### Tag-gated production deploys (#628)

Production **does not auto-deploy on push to `main`** (`autoDeploy: false` in `render.yaml` for the web service and all crons). A push to `main` — or a compromised credential that lands code there — cannot reach production on its own. Instead, `.github/workflows/deploy.yml` fires on a **`v*` tag**, verifies the tagged commit's CI (`lint`/`build`/`test`) is green, and only then triggers a Render deploy pinned to that commit. Shipping is a deliberate, CI-verified act.

> The `develop` → dev-environment auto-deploy is unaffected — that runs from `render-dev.yaml` (a separate blueprint). This gate applies to **production only**.

**Ship a release:**

```bash
# after merging develop → main (CI runs on the push):
git tag v1.4.0          # semantic version; annotate/sign if desired (#627)
git push origin v1.4.0  # → deploy.yml waits for green CI, then deploys prod
```

A raw `git push origin main` builds nothing in prod. Only the tag deploys, and only if CI passed on that commit (a red build is refused).

**One-time setup** (owner, GitHub → repo Settings → Secrets and variables → Actions):

1. **Secret `RENDER_API_KEY`** — a Render API key (Render dashboard → Account Settings → API Keys).
2. **`RENDER_SERVICE_IDS`** (repo **variable** preferred, or a secret — the Action accepts either) — comma-separated Render service IDs to deploy: the web service **and** all three crons (find each `srv-…`/`crn-…` ID in the service's dashboard URL), e.g. `srv-web,crn-dump,crn-snapshot,crn-legiscan`. Omitting a cron means it never picks up new code — include all of them. A variable keeps the IDs readable in Action logs; a secret masks them (harmless, just harder to eyeball).
3. **Secrets `RESEND_API_KEY` + `OPS_ALERT_EMAIL`** (#665) — used by the `notify-failure` job to email the ops inbox when a deploy fails. Same values as the app's Resend key and cron ops-alert address. Until both are set, the notify job logs a warning and no-ops (it never fails the workflow itself). Optional `RESEND_FROM_EMAIL` overrides the default `updates@democracymonitor.us` sender.
4. Confirm **auto-deploy is off** for each service in the Render dashboard (the `render.yaml` blueprint sets it, but verify after the next blueprint sync).
5. Verify on first tag: push a `v0.0.1`-style tag, watch the Action gate on CI then deploy, and confirm all services show a new deploy of the tagged commit in Render. (First-tag note: confirm Render honors the `commitId` field; if not, it deploys `main` HEAD, which equals the tag when you tag HEAD.)

### Deploy definition-of-done (#664/#666)

A release is **not "deployed" until confirmed live**, not when the tag is pushed. The `Deploy to production` workflow now enforces this itself: after triggering the Render deploy it **polls `/api/version`** (which returns the running commit from `RENDER_GIT_COMMIT`) until the web service reports the tagged SHA, timing out after 10 minutes. So a green workflow means the new code is confirmed serving; a Render build failure after the trigger now **fails the workflow** (and pages ops via #665) instead of silently leaving prod on old code — the v1.5.0 incident (coverage-gate red → 3h on stale code, unnoticed).

**Bump `package.json` version to match the tag before tagging.** `/api/version` returns `version` from `package.json` (baked into the build — Render exposes the commit, not the tag), and the Architecture page shows it as the running release. So a release is: edit `package.json` `"version"` to `X.Y.Z` → commit → `git tag vX.Y.Z` → push. If they drift, the deploy's verify step logs a non-fatal warning (`/api/version reports vA.B.C but the tag is vX.Y.Z`) — the commit match is still the deploy gate, but the displayed version would lag until corrected.

**Never `git push --no-verify`.** The `.husky/pre-push` hook runs the exact CI suite (`format:check`, `tsc`, `lint:unused`, **`test:coverage`**); bypassing it is what let v1.5.0's coverage failure reach a tag. If the hook itself errors, **fix the hook, don't bypass it.** (Known limitation: inside a Task-agent git _worktree_, husky can fail on symlinked-`node_modules` bin resolution — that is isolated to agent worktrees; the main working copy is unaffected, and the hook must not be auto-skipped there or the gate silently disappears.)

**Hotfix lane:** same flow — commit the fix to `main`, tag it (`v1.4.1`), push the tag. For an emergency where CI is the problem, use the Render dashboard's **Rollback** to the last-good deploy (Git-independent, unaffected by this gate) while you sort the fix.

**Rollback:** unchanged — Render dashboard → the service → Rollback to a prior deploy. This replays a cached image and does not depend on `main` or the deploy Action.

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

### Runbook: tracked_cases rollout + docket-stub retirement (R-CASE-TRACKER, 2026-08)

One-time sequence — order matters because the deploy stops new stubs from being minted before the purge removes the old ones:

1. **Deploy first**: merge `develop` → `main`, tag, push. The migration creates the empty `tracked_cases` table and the new ingest routes court_opinion items there instead of persisting stub documents. The Litigation panel shows a clean empty state until step 2.
2. **Promote the seeded universe**: `tracked_cases: {"where": "true"}` in `promotion-manifest.json`, then `pnpm db:promote` (~202k rows, seeded locally by `pnpm cases:seed` from CL bulk staging — the 71M-row staging tables never touch production). Promote before the next weekly snapshot: the upsert conflicts on `case_id` and overwrites row fields, so any category an ingest run merged in the interim would be replaced by the seed's category set.
3. **Purge stubs**: `pnpm docs:purge-stubs` (dry run — pre-flight asserts every stub case exists in tracked_cases and no stub carries score/assessment rows), review the printed counts (~283k documents), then `--confirm`. No aggregate repair is needed; stubs were never scored.
4. **Drop local staging** tables when done (`search_docket`, `search_court`, `search_opinioncluster`).
5. The next weekly dump ships the new format; the format change is noted in the data dictionary (`table_tracked_cases`, `table_documents`).

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
