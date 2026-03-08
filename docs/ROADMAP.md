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

The following is complete and working:

- **Three-layer detection pipeline** — Layer 1 (structural anomaly), Layer 2 (AI two-pass: GPT-4o-mini + Claude Sonnet), Layer 3 (thematic drift). Convergence synthesis. (Sprints R1–R3)
- **Source expansion** — 7 source types: Federal Register, GovInfo/GAO/CPD, CourtListener, DOJ, FEC, LegiScan, RSS (IG/FCC). 14 categories with signals. (Sprints R-S1a–R-S1g, R-CPD1–R-CPD2)
- **Baselines** — 4 baselines (Biden 2021/2022, Trump 2017/2018) with AI assessment. Cycle-aware adjustments. (Sprints 14–15.1, R3-RUN)
- **Dashboard UI** — Overview page (heatmap, timeline, synchrony chart), category detail (3-layer panels), week detail (document table, CSV export), search (research + explore modes), system pages (health, architecture, methodology), left nav, responsive layout. (Sprints 16–19, R4a–R4c, R-UI1, Search, R-RESP)
- **AI narratives** — 3-pass multi-model pipeline (Opus draft → GPT-4o feedback → Opus revision), weekly summaries, term summaries, editorial transparency. (Sprints R4a, R-NAR1)
- **Validation** — Three validation commands (`validate:ingest`, `validate:data`, `validate:detection`), historical backtesting, known-event detection. (Sprints R-VAL1, R-AP1)
- **Calibration** — Layer 2 P1 calibration (civilLiberties), NC-3 convergence calibration, L3 reinforcement-only mode. (Sprints R-CAL1, R-CAL2)
- **Infrastructure** — Render.com config, deployment guide, fault-tolerant fetching, cron overlap protection, analysis period safeguards. (Sprints R3.1, R-S1c, R-S1e, R-AP1)
- **Test coverage** — 2030 tests across 142 files. Branch coverage 68%+. (Sprint R-COV1)

---

## Remaining Work

### 1. CPD Gate + Source Cleanup (Issues #243–#246)

Sprint R-CPD1 shipped the GovInfo CPD fetcher and `ACTIVE_SOURCES` filter, but the validation gate and cleanup remain:

- **#243 — GATE: Validate CPD detection quality vs known events.** Run backtest against known events with CPD data to confirm detection quality is maintained or improved.
- **#244 — Exclude WH + GDELT documents and recompute baselines.** ACTIVE_SOURCES filter excludes them from scoring but old data remains in tables. Clean recompute needed.
- **#245 — Deprecate crossfeed pipeline from active codebase.** Remove rhetoric cross-feed code paths now that CPD replaces WH/GDELT as the presidential document source.
- **#246 — Update validation commands for new source stack.** Validation checks still reference retired sources.

### 2. OIG Content Pipeline (Issues #247–#253)

Inspector General reports are a key source for executiveOversight. HTML fetchers and content extraction needed:

- **#247–#249 — OIG HTML fetchers** (DOJ, HHS, SSA). Scrape IG report pages, extract report metadata.
- **#250 — Pipeline wiring.** `oig_html` signal type + backfill integration.
- **#251 — DOD OIG RSS diagnostic.** Investigate why DOD OIG RSS isn't producing documents.
- **#252 — PDF text extraction utility.** Many IG reports are PDF-only. `lib/utils/pdf-extractor.ts` needed for content extraction.
- **#253 — Add OIG content backfill to backfill-content.ts.**

### 3. Legacy Assessment Cleanup (Issues #256–#260)

The UI and APIs still partially depend on the legacy `assessments` table (pre-three-layer architecture). These issues remove that dependency:

- **#256 — Rewrite getCategorySummaries() to use weekly_aggregates.** The landing page data source still reads from the legacy table.
- **#257 — Remove assessments table dependency from category detail + snapshot APIs.**
- **#258 — Replace legacy status mapping with convergence status in UI.**
- **#259 — Remove legacy assessment steps from snapshot pipeline.**
- **#260 — Generate T2 narratives via layers:enrich --narratives.**

### 4. Cron Jobs + Production Pipeline

The daily monitoring pipeline needs to work end-to-end:

1. **Verify `pnpm snapshot` runs successfully** against the current database. The snapshot pipeline (`lib/cron/snapshot.ts`) exists but hasn't been run as a daily cron in production.
2. **Uncomment cron jobs in `render.yaml`** once snapshot is verified. Five jobs are defined but commented out:
   - `daily-snapshot` (06:00 UTC) — fetch sources, run three-layer assessment
   - `daily-digest` (07:00 UTC) — AI summary of findings
   - `retry-failed-signals` (11:00 UTC) — retry failed signal fetches
   - `hourly-uptime` — source availability monitoring
   - `weekly-clustering` (Sun 03:00 UTC) — semantic clustering
3. **Test the full cycle**: snapshot → layer scoring → narrative generation → UI displays fresh data.

### 5. Database Dump + GitHub Release

The deployment strategy (`DEPLOYMENT.md`) depends on database dumps stored in GitHub Release assets:

1. **Run `./scripts/dump-db.sh`** to create `data-dump.pgdump` from the local database.
2. **Upload to GitHub Releases** as `data-latest`. This serves as:
   - Bootstrap data for new deployments (`pnpm db:init` auto-restores on first deploy)
   - Contributor setup (download dump, `pg_restore`, `pnpm db:migrate`)
   - Disaster recovery backup of expensive AI assessment data (~$50–100 to regenerate)
3. **Establish a cadence** for dump updates (weekly or after significant data changes).

### 6. Launch Prep

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
