# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev            # Start dev server at http://localhost:3000
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # ESLint (extends next/core-web-vitals)
pnpm lint:patterns  # OpenGrep custom pattern rules (.opengrep/)
pnpm lint:unused    # Knip — find unused files, exports, and dependencies
pnpm test           # Run Vitest test suite
pnpm test:coverage  # Run tests with coverage thresholds
pnpm test:watch     # Run Vitest in watch mode
pnpm db:generate    # Generate Drizzle migrations from schema
pnpm db:migrate     # Apply migrations to PostgreSQL
pnpm snapshot              # Run weekly snapshot cron (incremental fetch + full assessment)
pnpm backfill              # Backfill historical data (fetch → score → aggregate → embed)
pnpm backfill:gaps         # Show incomplete/failed fetches from backfill pipeline
pnpm db:prewarm          # Re-warm search indexes after the weekly dump evicts them (pg_prewarm)
pnpm aliases:replay      # Pre-pay last data week's cache-miss arms + counts into the fresh week, budgeted (#729/#788)
pnpm backfill:content      # Backfill null-content docs (--source fr|govinfo|oig|fec|doj, --dry-run, --limit N)
pnpm validate:ingest       # Ingest health: source coverage, content gaps, pagination fitness
pnpm validate:data         # Data readiness: scores, embeddings, baselines, L2 coverage, layer scores
pnpm validate:detection    # Detection correctness: known events, negative controls, layer attribution
pnpm validate:narratives   # Narrative quality: 3-pass generation + spec criteria (--type, --category, --week, --output)
pnpm eval:completeness     # Journalist-test ground-truth eval (#738; --skip-capture, --baseline FILE, --out FILE)
pnpm validate:graph        # Derivation-graph edge contract (G1a..G5); nonzero exit on error-severity violations
pnpm pipeline:repair       # DAG-aware re-derivation for --from/--to with built-in gates (--expect-flips, --confirm-baseline)
pnpm digest:send           # Manually release a held weekly digest (--week YYYY-MM-DD) after reviewing the narrative
pnpm baselines:compute # Compute baseline statistics from existing aggregates/embeddings
pnpm scores:recompute  # Re-score documents + re-aggregate (analysis periods only; --all-dates for everything)
pnpm demo:seed      # DEV ONLY: generate deterministic demo snapshots
pnpm seed:review    # Generate AI Skeptic disagreement report for human review
pnpm embeddings:backfill # Embed documents missing embeddings (analysis periods only; --all-dates for everything)
pnpm scores:enrich      # Recompute structural/AI/thematic/concern scores from updated data
pnpm review:backfill    # Backfill AI document review assessments (defaults to analysis periods; --baseline or --from/--to for custom)
pnpm legiscan:bulk      # Download LegiScan bulk datasets (Congress baseline periods)
pnpm cl:purge-noise     # Analyze/purge CL noise docs from civilLiberties (--confirm to delete)
pnpm cl:dedupe-revisions # Mark superseded CourtListener revision rows (same case/category/day; --dry-run | --confirm; current term only) then pipeline:repair the touched weeks (#741)
pnpm seed:apply     # Apply keyword changes from review decisions to assessment-rules.ts
pnpm backtest       # Run historical backtesting
pnpm structural:distributions  # Show per-category structural score distributions (Biden 2022)
pnpm retrospective     # Re-run detection pipeline on known events (--event, --all, --period)
pnpm scores:backfill   # Score docs missing document_scores rows + re-aggregate affected weeks (--from, --dry-run)
pnpm scores:purge-stubs        # Delete score rows for ineligible/stub docs + re-aggregate (--dry-run)
pnpm docs:purge-stubs          # Purge retired CL docket-stub docs after tracked_cases parity check (--confirm)
pnpm cases:seed                # LOCAL ONLY: seed tracked_cases from stubs + CL bulk staging (--confirm, --verify)
pnpm aggregates:backfill-gaps  # Create missing zero-doc weekly aggregate rows (--from, --to, --dry-run)
pnpm nc:margins        # Capture/diff negative-control margins (--out FILE, --diff FILE)
pnpm actor:backfill    # Erosion-actor attribution light pass (--baseline, --dry-run; baseline writes need approval)
pnpm narratives:regenerate     # Regenerate narratives (--type weekly|term|all, --week)
pnpm narratives:verify         # Deterministic number check over stored weekly summaries vs current data (#700; --from --to, --baseline, --json)
pnpm backfill:opinions # Opinion-first CL backfill (bulk staging locally, CL API in prod; --from, --to, --dry-run)
pnpm search:backfill-rank      # Backfill documents.search_rank_vector (keyset; trigger maintains new rows)
pnpm audit:annotations         # Sampled P2 annotation-vs-document audit (#711; --confirm, --sample N, --out FILE)
pnpm audit:symmetry            # Swap audit of P2 verdicts — administration tokens exchanged vs control re-run (#772; --sample N, --max-calls N, --confirm, --out FILE)
pnpm crec:build-fragments      # Split multi-topic CREC granules into fragment docs (#704; --confirm, --limit N)
pnpm crec:rehearse-split       # CREC splitter rehearsal (dual-mode boundary comparison)
pnpm crec:canary-l2            # No-persist L2 canary on split CREC fragments (--blobs N)
pnpm validate:mf-drops # Audit mediaFreedom drop ledger against the live filter (--days N)
pnpm dev:status | dev:suspend | dev:resume  # Dev web+DB lifecycle via the Render API (#791; RENDER_API_KEY)
pnpm verify:enrichment-sql # Execute the passage-excerpt SQL (every masthead branch) against DATABASE_URL — enrichment swallows SQL errors, so this is the only loud check (#744)
pnpm retrieval:golden  # Retrieval-shape golden capture/diff via ?debug=1 (#782; --base URL --out FILE [--loadtest N] [--eval] | --diff A B)
```

Package manager is **pnpm**. Test framework is **Vitest** with jsdom environment.

## Environment

Copy `.env.example` to `.env.local` for local overrides. Variables:

- `ALLOWED_PROXY_HOSTS` — comma-separated hostname whitelist (defaults defined in `lib/allowedHosts.ts`)
- `PROXY_CACHE_TTL` — cache duration in seconds (default 600)
- `DATABASE_URL` — PostgreSQL connection string (required for persistence features)
- `REDIS_URL` — Redis connection string (optional; falls back to in-memory cache)
- `OPENAI_API_KEY` — OpenAI API key (optional; enables AI-enhanced assessment)
- `ANTHROPIC_API_KEY` — Anthropic API key (optional; enables AI-enhanced assessment)
- `COURTLISTENER_API_TOKEN` — CourtListener API token (optional; enables court docket fetching)
- `GOVINFO_API_KEY` — GovInfo API key (optional; enables Congressional/Public Law/CPD/CREC/CHRG fetching. NOT GAO: GovInfo's GAOREPORTS collection is a dead pre-2009 archive and the fetcher was removed in #529; see #739 for the Wayback-based ingest proposal)
- `FEC_API_KEY` — FEC API key (optional; enables advisory opinion and MUR fetching)
- `LEGISCAN_API_KEY` — LegiScan API key (optional; enables legislative bill tracking via bulk datasets)
- `RESEND_API_KEY` — Resend API key (optional; enables email newsletter)
- `RESEND_FROM_EMAIL` — Sender address for emails (default: `Democracy Monitor <updates@democracymonitor.us>`)
- `CRON_SECRET` — Bearer token shared between web service and dump cron job
- `SEARCH_MACHINE_TOKEN` — Bearer token that lets our own harnesses (prewarm workflow, eval, loadtest, golden) through the search front door (#792); humans get a Turnstile-issued pass instead
- `SEARCH_PASS_SECRET` — HMAC secret for the `dm_pass` cookie (falls back to `CRON_SECRET`)

### Local development

Local PostgreSQL is available at `localhost:5432/democracy_monitor` (configured in `.env.local`). The database contains backfilled baseline data and assessment snapshots. CLI scripts like `pnpm seed:review`, `pnpm backfill`, and `pnpm snapshot` can be run directly against it.

### Production access

**NEVER read `.env.prod.local` or any `.env*.local` file with the Read, Grep, or Glob tools.** These files contain secrets (API keys, database URLs). Reading them exposes credentials in the conversation context.

To run commands against production, use `source .env.prod.local && export VAR && command` in a Bash tool call. Environment variable values flow through the shell and do not appear in the conversation context unless a command prints them to stdout/stderr.

### File reads

With 1M context, file contents from earlier in the conversation are still available. Do not re-read a file unless it has been modified since the last read. Reference the earlier read instead.

### Production data operations

Runbook proposals must list each production command with its **exact scope flags**. Never rely on a command's default scope in production — `scores:recompute`, `scores:enrich`, and `review:backfill` default to ALL analysis periods, **including baseline periods**.

Any command that writes to baseline-period data (before 2025-01-20) — documents, assessments, aggregates, or recompute/enrich of derived values — requires **explicit user approval per invocation**. Baselines are the calibrated reference for negative controls; whether a baseline write is "safe" is the user's decision, not Claude's.

### AI spend protocol (#563/#564 — mandatory for every AI-spending runbook)

Spend is a gated quantity, like data integrity. A wrong estimate must cost the cap, not the night.

1. **Precheck models calls, not documents.** Estimate what the pipeline will _call_ (per pass, incl. audit samples and retries), not what it will store. Record expected calls and dollars on the runbook issue. Every repair proposal quotes **three numbers**: source-matched, net-new after anti-join against current prod, and assessable after eligibility filters (#565's estimate fell $220→$0.02 across four passes for lack of the last two).
2. **Every AI step runs capped**: `review:backfill ... --max-calls <expected × 3>`. Cap trip exits 3; chain scripts must NOT retry exit 3 — a human reviews the estimate first.
3. **Canary before fleet** for any step the rehearsal skipped: run one baseline/category-week, reconcile calls vs rows-written vs dollars against the precheck, then proceed.
4. **Spend sentinel in every long chain**: recount calls from the run's log every 15 min; alert at 1.5x expected, kill-marker at 3x. Template: `scripts/prod-chain-template.sh`.
5. **Post-run**: post actuals vs estimate to the issue. A calls≫writes ratio means duplicate work — stop and diagnose.

## Database migrations

**Schema-first workflow** — NEVER manually create SQL files in `drizzle/`. Always follow this process:

1. Modify the schema in `lib/db/schema.ts`
2. Run `pnpm db:generate` — this creates the SQL migration file, snapshot, AND journal entry in `drizzle/meta/_journal.json`
3. Run `pnpm db:migrate` — this applies the migration to the database

Why: Manually created SQL files won't be registered in the Drizzle journal, causing `pnpm db:migrate` to silently skip them. This has caused production failures where columns appeared to exist in the SQL file but were never actually added to the database.

**Zero-downtime migration compatibility (#730)**: Render swaps traffic only after the new instance passes `/api/health/live`, so during every deploy the OLD code briefly runs against the NEW schema (migrations apply in `buildCommand`, before cutover). Additive changes (new tables/columns/indexes) are always safe. Destructive changes (DROP/RENAME of anything the old code reads) must ship in a LATER release than the code that stops using them (expand–contract).

## Architecture

Next.js 14 app using **Pages Router** (not App Router), TypeScript strict mode, Tailwind CSS.

### Data flow

The dashboard monitors executive-power signals across 14 institutional categories. Each category defines multiple **signals** (JSON APIs, Federal Register queries, CourtListener, DOJ press releases, DHS/ICE/CBP newsrooms, GovInfo, OIG reports, FEC filings; GAO is NOT ingested — see #529/#739). The flow is:

1. **Cron/backfill** fetches data from external sources (FR, CourtListener, DOJ, DHS/ICE/CBP press, GovInfo/CPD, FEC, CREC, CHRG, LegiScan, OIG incl. oversight.gov) and stores full documents in PostgreSQL
2. **Snapshot pipeline** (`lib/cron/snapshot.ts`) runs assessment (structural anomaly + AI two-pass + thematic drift) → convergence synthesis → stores assessment snapshots
3. **API routes** (`/api/proxy`, `/api/federal-register`, `/api/scrape-tracker`) act as server-side proxies with Redis caching (in-memory fallback)
4. **UI** reads stored snapshots and documents via API routes; progressive disclosure surfaces assessment details on demand
5. Assessment returns a convergence status (Stable → Elevated → ConfirmedConcern) driven by L2 AI content assessment, with descriptive context from structural, silence, and thematic layers

### Directory structure

```
lib/
  types/          # TypeScript type definitions (categories, assessment, AI)
  data/           # Static data (CATEGORIES array, ASSESSMENT_RULES, DOJ taxonomy, chart colors)
  parsers/        # Feed response parsers
  hooks/          # React hooks (useLocalStorage, useAutoRefresh)
  services/       # Business logic (assessment, concern synthesis, structural, narrative, document review, fetchers)
  db/             # Drizzle ORM (schema, client, migrations)
  cache/          # Redis + in-memory fallback cache layer
  ai/             # AI provider abstraction (OpenAI, Anthropic) + prompt templates
  cron/           # Scheduled tasks (snapshot, backfill, embeddings, scores, enrichment)
  methodology/    # Scoring config, named constants, thresholds
  utils/          # Pure utility functions (async, collections, date, math, ai)
  seed/           # AI assessment review pipeline (seed:review, seed:apply)
  validation/     # Historical backtesting and known-event validation
  allowedHosts.ts # Proxy host whitelist

components/       # UI components (overview, category detail, week detail, shared)

pages/
  api/            # API routes (proxy, federal-register, scrape-tracker, assess-status)

drizzle/          # SQL migration files
__tests__/        # Vitest test files mirroring lib/ structure
```

### Key files

- **`lib/data/categories.ts`** — All 14 category and signal definitions. This is where signals are added/removed.
- **`lib/data/assessment-rules.ts`** — Keyword dictionaries per category and severity tier (annotation layer).
- **`lib/services/assessment-service.ts`** — Keyword-based assessment engine with authority weighting and volume thresholds.
- **`lib/services/ai-assessment-service.ts`** — AI Skeptic review (runs after keyword assessment).
- **`lib/services/structural-scoring-service.ts`** — Structural anomaly detection (JSD, z-scores, 6 dimensions).
- **`lib/services/thematic-drift-service.ts`** — Rolling thematic drift (8-week intra-admin window).
- **`lib/services/concern-synthesis.ts`** — Concern synthesis (AI review drives status; structural/silence/thematic provide context).
- **`lib/services/narrative-generation-service.ts`** — AI narrative generation (dual-audience: expert + public).
- **`lib/methodology/scoring-config.ts`** — Tier weights, class multipliers, volume thresholds, named constants.
- **`lib/cron/snapshot.ts`** — Weekly snapshot pipeline: fetch → assess → concern synthesis → store.
- **`lib/cron/backfill.ts`** — Historical backfill (FR + CourtListener + DOJ + GovInfo + FEC + DHS press + OIG) with AI assessment.
- **`lib/cache/index.ts`** — Redis cache with automatic in-memory fallback when Redis is unavailable.
- **`lib/ai/provider.ts`** — AI provider factory (OpenAI, Anthropic) with availability checks.
- **`lib/db/schema.ts`** — Drizzle ORM table definitions (documents, assessments, baselines, weekly_aggregates, ai_document_assessments, narratives, etc.).
- **`pages/api/proxy.ts`** — CORS proxy with host whitelist, content-type detection, Redis caching.
- **`pages/api/assess-status.ts`** — Assessment endpoint delegating to assessment-service.

### Client-side patterns

- The dashboard is loaded via `next/dynamic` with SSR disabled (client-only rendering)
- `useLocalStorage` custom hook persists refresh interval and status map
- Status pills and assessment details stored in localStorage

### Assessment methodology

Detection pipeline with AI document review as sole active detection mechanism:

1. **Structural anomaly** (`structural-scoring-service.ts`) — deterministic, metadata-only. Descriptive context only — does not drive concern status.
2. **AI document review** (`document-review-orchestrator.ts`, `ai_document_assessments`) — Pass 1 (gpt-4o-mini) flags potentially concerning documents, Pass 2 (Claude Sonnet) classifies flagged docs. Different providers for epistemic independence. **Sole active detection mechanism driving concern status.**
3. **Thematic drift** (`thematic-drift-service.ts`) — rolling 8-week intra-admin window. Descriptive context only — does not drive concern status.

**Concern synthesis** (`concern-synthesis.ts`) — AI review drives status: Stable → Elevated → ConfirmedConcern. Structural, silence, and thematic scores provide descriptive context. Keywords serve as annotations only (not detection gates). Documented in `ASSESSMENT_METHODOLOGY.md`.

## Sprint process

Every sprint **MUST** follow this process. It may **ONLY** be skipped with explicit approval from the user.

**IMPORTANT:** Always use Plan Mode (`/plan`) for sprint work. The diagnostic, analysis, proposal, and approval steps (1–4) should happen inside plan mode. Exit plan mode only when moving to implementation (step 6).

1. **Diagnostic** — Before proposing fixes, query production data to understand the actual problem. Sample documents, check content quality, verify assumptions with evidence. Classify root causes (data gap vs. scoring vs. routing vs. content truncation) before designing solutions. Check `docs/PROJECT_KNOWLEDGE.md` "Standing constraints" section for project-level invariants that affect the approach.
2. **Analysis** — Research the problem space, read relevant code, identify what needs to change. Search `docs/DECISIONS.md` (and `docs/DECISIONS-ARCHIVE.md` if needed) for relevant prior decisions, spec deviations, and lessons learned from related sprints. Use Grep to find relevant entries by keyword rather than reading the full file.
3. **Propose** — Present findings and a numbered list of issues/changes to the user for review. Every proposal must lead with a product-level summary: value delivered, cost, risks with mitigations, and an explicit list of the decisions that belong to the user (scope, data policy, spend, direction tradeoffs) versus technical calls Claude will make. Mid-sprint discoveries that change scope, data, or direction get the same product-level framing before proceeding.
4. **Approval** — Wait for user approval before writing any code. User may adjust scope.
5. **Create milestone & issues** — Create a GitHub Milestone for the sprint (if it doesn't exist). Create one GitHub Issue per work item with appropriate labels and assign it to the milestone. This must happen **before** implementation begins.
6. **Implementation** — Do the work. Reference GitHub Issue numbers in commits (e.g., `Fixes #12`).
7. **Post-sprint code review** — First run `pnpm lint`, `pnpm lint:patterns`, and `pnpm lint:unused` to catch mechanical violations. Then review all files created or modified in the sprint against the checklist below (focusing on judgment items: naming, SOLID, DRY, testability). Report findings to the user before making fixes. The results of the code review **MUST** be presented to the user for approval.
8. **Commit** — Stage, format, and commit only after the review is clean
9. **Retrospective** — Update `docs/DECISIONS.md` with a sprint entry covering: what was planned vs what was built, spec deviations (with section refs), key decisions and rationale, lessons learned. Keep only the last ~5 sprints in `docs/DECISIONS.md`; move older entries to `docs/DECISIONS-ARCHIVE.md`. Annotate `FUTURE_ROADMAP.md` if the sprint delivered one of its items. Update the sprint log in `docs/PROJECT_KNOWLEDGE.md` and promote any reusable lessons to the "Lessons learned" section. The results of the retrospective **MUST** be presented to the user for approval.
10. **Push** — Push to remote. The retrospective may surface issues worth fixing before the code leaves local; if so, loop back to steps 7–8 first.
11. **Close issues & milestone** — Close each completed GitHub Issue (with commit SHA in the close comment). Close the milestone once all issues are resolved. Detach any remaining open issues from the milestone before closing it.

### What to check

1. **Clean code** — functions are short, single-purpose, and readable at a glance
2. **Naming** — constants, variables, functions, and types have clear, descriptive names; no magic numbers or unnamed thresholds
3. **SOLID principles** — especially Single Responsibility (one reason to change per module) and Dependency Inversion (depend on abstractions, not concretions)
4. **DRY** — no duplicated logic, constants, or type definitions across files; shared code lives in `lib/data/`, `lib/utils/`, or `lib/types/`
5. **Testability** — pure functions extractable from I/O; business logic not buried inside API routes or components
6. **OpenGrep rule candidates** — for any issue that represents a recurring anti-pattern, evaluate whether a new `.opengrep/security.yml` rule could prevent it. Write and test the rule before fixing the code.
7. **Test Quality** - All automated tests must test functionality, not implementation.
8. **File and function length** — ESLint `max-lines` and `max-lines-per-function` rules are enforced (see `.eslintrc.json`). Data/fixture files and tests are exempt via overrides.
9. **Dead code** — run `pnpm lint:unused` (Knip) and remove unused files, exports, types, and dependencies introduced by the sprint. Exports planned for future sprints may be kept with justification.

### Where shared code lives

| What                           | Where                               |
| ------------------------------ | ----------------------------------- |
| Static data / config arrays    | `lib/data/`                         |
| Pure utility functions         | `lib/utils/`                        |
| Type definitions               | `lib/types/`                        |
| Scoring constants / thresholds | `lib/methodology/scoring-config.ts` |

### Source fetcher pattern

All source fetchers (`lib/services/*-fetcher.ts`) follow the same module structure:

- `parseParams(signalUrl)` — parse pseudo-URL into API query params (pure, tested)
- `toContentItem(rawRecord)` — convert API response to `ContentItem` (pure, tested)
- `fetchRecent(params)` — fetch latest data for snapshot pipeline (I/O, excluded from coverage)
- `fetchHistorical(params)` — fetch date-ranged data for backfill pipeline (I/O, excluded from coverage)

### Infrastructure

Configured for **Render.com** deployment via `render.yaml`:

- Web Service (Next.js app)
- PostgreSQL (Drizzle ORM, pgvector embeddings)
- Redis Key-Value store (caching)
- 3 Weekly cron jobs: LegiScan fetch (Mon 01:00 UTC) → snapshot (Mon 03:00 UTC) → DB dump (Mon 05:00 UTC)

The weekly dump cron triggers `POST /api/cron/dump` which runs `pg_dump -Fc` to a persistent disk on the web service. The dump is served at `GET /api/data/dump`. On first deploy, `pnpm db:init` detects an empty database, downloads the dump (falls back to GitHub Releases if the endpoint isn't available yet), restores it, and runs Drizzle migrations. Use `pnpm db:init --force` to overwrite a local database with the latest production data. See `DEPLOYMENT.md`.

## Project management

- **`FUTURE_ROADMAP.md`** (repo root) — Post-launch feature roadmap; shipped items get ✅ annotations. (`docs/ROADMAP-ARCHIVE.md` is the retired pre-launch tracker.)
- **`docs/DECISIONS.md`** — Recent sprint retrospectives (last ~5 sprints). Older sprints archived in `docs/DECISIONS-ARCHIVE.md`.
- **GitHub Milestones** — One per sprint. Close when all issues in the sprint are done.
- **GitHub Issues** — Individual work items within a sprint. Reference issue numbers in commit messages (`Fixes #N`).
- **Labels** — `stream:{data-pipeline,backend,ui,infra}`, `type:{feature,bug,research,review-gate}`, `priority:{p0,p1,p2}`

### Spec documents

- **`docs/GLOSSARY.md`** — Plain-language definitions of measurement/search-perf shorthand (p50/p95, DNF, probe and eval question ids, run labels, stage names). Update it whenever a new label or id appears in a report; expand terms on first use in messages.
- **`docs/PROJECT_KNOWLEDGE.md`** — Shared institutional knowledge: architecture decisions, sprint log, current state, module patterns, database gotchas
- **`docs/internal/SYSTEM SPECIFICATION V3 ADDENDUM.md`** — Backend requirements (Sprints A–J), risk reminders, schema changes
- **`docs/internal/UI DESIGN SPECIFICATION V3.md`** — Full UI redesign spec (Phases 1–5), component specs, API endpoint requirements
- **`ASSESSMENT_METHODOLOGY.md`** — Public-facing methodology documentation
