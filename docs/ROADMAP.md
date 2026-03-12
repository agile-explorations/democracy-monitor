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
- **Dashboard UI** — Overview page (heatmap, timeline, synchrony chart), category detail (3-layer panels), week detail (document table with AI assessment data, CSV export), search (research + explore modes), system pages (health, architecture, methodology), left nav, responsive layout. (Sprints 16–19, R4a–R4c, R-UI1, Search, R-RESP)
- **AI narratives** — 3-pass multi-model pipeline (Opus draft → GPT-4o feedback → Opus revision), weekly summaries, term summaries, editorial transparency. Spec-compliant prompts with safety-net criteria for "why this might matter," small-sample caveats, counter-argument limits. validate:narratives QA script. (Sprints R4a, R-NAR1, R-NAR3)
- **Validation** — Three validation commands (`validate:ingest`, `validate:data`, `validate:detection`), historical backtesting, known-event detection. (Sprints R-VAL1, R-AP1)
- **Calibration** — Layer 2 P1 calibration (civilLiberties), NC-3 convergence calibration, L3 reinforcement-only mode. (Sprints R-CAL1, R-CAL2)
- **Infrastructure** — Render.com config, deployment guide, fault-tolerant fetching, cron overlap protection, analysis period safeguards. (Sprints R3.1, R-S1c, R-S1e, R-AP1)
- **Test coverage** — 2006 tests across 138 files. Branch coverage 68%+. (Sprint R-COV1)
- **SEO** — robots.txt, dynamic sitemap, slug mapping, SEOHead, SSR narrative pages (category-week + weekly hub), Playwright E2E tests. (Sprints R-SEO1, R-SEO2)
- **CPD gate + source cleanup** — CPD detection validated, WH/GDELT excluded via ACTIVE_SOURCES, crossfeed pipeline removed, validation commands updated. (Issues #243–#246)
- **OIG content pipeline** — DOJ/HHS/SSA OIG HTML fetchers, oig_html signal type, PDF text extraction, OIG content backfill. DOD OIG removed (Akamai WAF blocks). (Issues #247–#253)
- **Legacy assessment cleanup** — getCategorySummaries() uses weekly_aggregates, assessments table removed from APIs, convergence status in UI, snapshot pipeline modernized, T2 narratives via layers:enrich. (Issues #256–#260)
- **FEC MUR enrichment** — Dispositions, commission votes, participant data extracted. AO/MUR PDF extraction via pdf-parse. Backfill integration with rate limiting.
- **Dead code removal** — Crossfeed pipeline (rhetoric-crossfeed, rhetoric-fetcher, backfill-rhetoric, recrossfeed-rhetoric), deep-analysis.ts orphaned code removed.
- **Data quality safeguards** — fetch_log source_origin naming normalized (snapshot signal IDs → canonical source types), narrative pipeline completeness guard (aborts when weekly_aggregates covers <50% of document categories). (Sprint R-DQ1, Issues #362–#364)

---

## Remaining Work

### 1. Cron Jobs + Production Pipeline (Issues #261–#263)

The daily monitoring pipeline needs to work end-to-end:

1. **Verify `pnpm snapshot` runs successfully** against the current database. The snapshot pipeline (`lib/cron/snapshot.ts`) exists but hasn't been run as a daily cron in production.
2. **Uncomment cron jobs in `render.yaml`** once snapshot is verified. Five jobs are defined but commented out:
   - `daily-snapshot` (06:00 UTC) — fetch sources, run three-layer assessment
   - `daily-digest` (07:00 UTC) — AI summary of findings
   - `hourly-uptime` — source availability monitoring
   - `weekly-clustering` (Sun 03:00 UTC) — semantic clustering
3. **Test the full cycle**: snapshot → layer scoring → narrative generation → UI displays fresh data.

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
