# Democracy Monitor — Roadmap

This document tracks what remains to be done before launch. For completed sprint details, see `DECISIONS.md` (retrospectives) and `PROJECT_KNOWLEDGE.md` (sprint log).

Post-launch features and improvements are tracked in `FUTURE_ROADMAP.md`.

**Specification documents** (in `docs/internal/`):

- `ARCHITECTURE.md` — Three-layer triangulated detection across 14 categories
- `FUTURE_ROADMAP.md` — Post-launch features (Phases 5–10, R-F1–R-F11)
- `TEST_SPECIFICATION.md` — Ship/no-ship gate checklist
- Other internal specs: `CATEGORY_FRAMEWORK_ANALYSIS.md`, `SPIKE_FINDINGS.md`, `SYSTEM SPECIFICATION V3 ADDENDUM.md`, `UI DESIGN SPECIFICATION V3.md`, `SIGNAL_GAP_REMEDIATION.md`

---

## Completed Work

For the full sprint-by-sprint history, see `PROJECT_KNOWLEDGE.md` (sprint log) and `DECISIONS.md` / `DECISIONS-ARCHIVE.md` (retrospectives).

**Summary:** Three-layer detection pipeline (structural + AI two-pass + thematic drift), 8 source types across 14 categories, 4 baselines with AI assessment, dashboard UI (overview + category + week detail + search + system pages), 3-pass AI narratives, validation harness, SEO, researcher data access, cron job resilience. 2000+ tests, 68%+ branch coverage.

---

## Remaining Work

### 1. Cron Jobs + Production Pipeline (Issues #261–#263)

The weekly monitoring pipeline needs to work end-to-end:

1. **Verify `pnpm snapshot` runs successfully** against the current database. The snapshot pipeline (`lib/cron/snapshot.ts`) exists but hasn't been run as a weekly cron in production.
2. **Uncomment cron jobs in `render.yaml`** once snapshot is verified. Active weekly jobs:
   - `weekly-legiscan` (Mon 01:00 UTC) — download bulk legislative datasets
   - `weekly-snapshot` (Mon 03:00 UTC) — fetch sources, score, L2 assessment, aggregate, narratives
   - `weekly-dump` (Mon 05:00 UTC) — database backup to GitHub Release
   - Commented out: `hourly-uptime`, `weekly-clustering`
3. **Test the full cycle**: LegiScan fetch → snapshot (fetch + score + aggregate + narratives) → UI displays fresh data for completed week.

**Cron resilience (Sprint R-CRON)**: All three jobs now record execution to `cron_runs` table, with exit codes (0=success, 1=failure, 2=skipped), error collection, and self-healing (inline narrative retry, aggregate retry). `/api/health/cron` endpoint exposes job status for monitoring.

### 2. Database Dump + GitHub Release

The deployment strategy (`DEPLOYMENT.md`) depends on database dumps stored in GitHub Release assets:

1. **Run `./scripts/dump-db.sh`** to create `data-dump.pgdump` from the local database.
2. **Upload to GitHub Releases** as `data-latest`. This serves as:
   - Bootstrap data for new deployments (`pnpm db:init` auto-restores on first deploy)
   - Contributor setup (download dump, `pg_restore`, `pnpm db:migrate`)
   - Disaster recovery backup of expensive AI assessment data (~$50–100 to regenerate)
3. **Establish a cadence** for dump updates (weekly or after significant data changes).

### 3. Launch Prep

- [ ] Verify all 14 categories have current-period data (T2: Jan 2025–present)
- [ ] Run `pnpm validate:ingest`, `pnpm validate:data`, `pnpm validate:detection` — all clean
- [ ] Create initial GitHub Release with database dump
- [ ] Deploy to Render, verify app loads with data
- [ ] Enable cron jobs, verify first daily snapshot completes
- [ ] Smoke test: overview page shows current data, category drill-down works, search returns results

---

## Ongoing Costs

| Component            | Weekly        | Notes                         |
| -------------------- | ------------- | ----------------------------- |
| Layer 1 (Structural) | ~$0           | CPU computation               |
| Layer 2 Pass 1       | ~$0.10–0.30   | gpt-4o-mini on all docs       |
| Layer 2 Pass 2       | ~$0.50–3.00   | Claude Sonnet on flagged docs |
| Layer 2 Audit        | ~$0.50–2.00   | 2–5% unflagged sample         |
| Layer 3 (Thematic)   | ~$0.02        | Embeddings + CPU              |
| Narrative Generation | ~$1–5         | Claude Opus on Elevated+ cats |
| **Weekly total**     | **~$2.50–10** |                               |

---

## Post-Launch

All post-launch items are tracked in `FUTURE_ROADMAP.md`:

- **R-F1–R-F11**: Architecture improvements (pre-filtering, synchrony detection, semantic variance decomposition, event retrospective harness, per-category L1 calibration, L3 embedding cleanup, etc.)
- **Phase 5**: Deferred sources (Oversight.gov, VRL, CBO, DHS statistical tables)
- **Phase 6–10**: Primary-source rhetoric, media coverage, rhetoric vs. action analysis, Project 2025 tracking, authoritarian infrastructure build-out
