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
pnpm backfill:content      # Backfill null-content docs (--source fr|govinfo|oig|fec|doj, --dry-run, --limit N)
pnpm validate:ingest       # Ingest health: source coverage, content gaps, pagination fitness
pnpm validate:data         # Data readiness: scores, embeddings, baselines, L2 coverage, layer scores
pnpm validate:detection    # Detection correctness: known events, negative controls, layer attribution
pnpm validate:narratives   # Narrative quality: 3-pass generation + spec criteria (--type, --category, --week, --output)
pnpm baselines:compute # Compute baseline statistics from existing aggregates/embeddings
pnpm scores:recompute  # Re-score documents + re-aggregate (analysis periods only; --all-dates for everything)
pnpm demo:seed      # DEV ONLY: generate deterministic demo snapshots
pnpm seed:review    # Generate AI Skeptic disagreement report for human review
pnpm embeddings:backfill # Embed documents missing embeddings (analysis periods only; --all-dates for everything)
pnpm layers:enrich      # Recompute L1/L2/L3/convergence from updated layer data
pnpm layer2:backfill    # Backfill Layer 2 AI assessments (defaults to analysis periods; --baseline or --from/--to for custom)
pnpm legiscan:bulk      # Download LegiScan bulk datasets (Congress baseline periods)
pnpm cl:purge-noise     # Analyze/purge CL noise docs from civilLiberties (--confirm to delete)
pnpm seed:apply     # Apply keyword changes from review decisions to assessment-rules.ts
pnpm backtest       # Run historical backtesting
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
- `GOVINFO_API_KEY` — GovInfo API key (optional; enables GAO/Congressional/Public Law fetching)
- `FEC_API_KEY` — FEC API key (optional; enables advisory opinion and MUR fetching)
- `LEGISCAN_API_KEY` — LegiScan API key (optional; enables legislative bill tracking via bulk datasets)

### Local development

Local PostgreSQL is available at `localhost:5432/democracy_monitor` (configured in `.env.local`). The database contains backfilled baseline data and assessment snapshots. CLI scripts like `pnpm seed:review`, `pnpm backfill`, and `pnpm snapshot` can be run directly against it.

### Production access

**NEVER read `.env.prod.local` or any `.env*.local` file with the Read, Grep, or Glob tools.** These files contain secrets (API keys, database URLs). Reading them exposes credentials in the conversation context.

To run commands against production, use `source .env.prod.local && export VAR && command` in a Bash tool call. Environment variable values flow through the shell and do not appear in the conversation context unless a command prints them to stdout/stderr.

## Database migrations

**Schema-first workflow** — NEVER manually create SQL files in `drizzle/`. Always follow this process:

1. Modify the schema in `lib/db/schema.ts`
2. Run `pnpm db:generate` — this creates the SQL migration file, snapshot, AND journal entry in `drizzle/meta/_journal.json`
3. Run `pnpm db:migrate` — this applies the migration to the database

Why: Manually created SQL files won't be registered in the Drizzle journal, causing `pnpm db:migrate` to silently skip them. This has caused production failures where columns appeared to exist in the SQL file but were never actually added to the database.

## Architecture

Next.js 14 app using **Pages Router** (not App Router), TypeScript strict mode, Tailwind CSS.

### Data flow

The dashboard monitors executive-power signals across 14 institutional categories. Each category defines multiple **signals** (RSS feeds, JSON APIs, Federal Register queries, CourtListener, DOJ press releases, GovInfo/GAO, FEC filings, GDELT news). The flow is:

1. **Cron/backfill** fetches data from external sources (FR, WH, GDELT, CourtListener, DOJ, GovInfo, FEC, RSS) and stores documents in PostgreSQL
2. **Snapshot pipeline** (`lib/cron/snapshot.ts`) runs three-layer assessment (structural anomaly → AI two-pass → thematic drift) → convergence synthesis → stores assessment snapshots
3. **API routes** (`/api/proxy`, `/api/federal-register`, `/api/scrape-tracker`) act as server-side proxies with Redis caching (in-memory fallback)
4. **UI** reads stored snapshots and documents via API routes; progressive disclosure surfaces assessment details on demand
5. Assessment returns a convergence status (Stable → Elevated → Divergent → Confirmed Concern) with layer scores, AI review, and reasoning

### Directory structure

```
lib/
  types/          # TypeScript type definitions (categories, assessment, AI)
  data/           # Static data (CATEGORIES array, ASSESSMENT_RULES, DOJ taxonomy, chart colors)
  parsers/        # Feed response parsers
  hooks/          # React hooks (useLocalStorage, useAutoRefresh)
  services/       # Business logic (assessment, convergence, structural, narrative, fetchers)
  db/             # Drizzle ORM (schema, client, migrations)
  cache/          # Redis + in-memory fallback cache layer
  ai/             # AI provider abstraction (OpenAI, Anthropic) + prompt templates
  cron/           # Scheduled tasks (snapshot, backfill, embeddings, scores, layers)
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
- **`lib/services/ai-assessment-service.ts`** — AI Skeptic review layer (runs after keyword assessment).
- **`lib/services/structural-scoring-service.ts`** — Layer 1: structural anomaly detection (JSD, z-scores, 5 dimensions).
- **`lib/services/thematic-drift-service.ts`** — Layer 3: rolling thematic drift (8-week intra-admin window).
- **`lib/services/convergence-service.ts`** — Convergence synthesis across all three layers.
- **`lib/services/narrative-generation-service.ts`** — AI narrative generation (dual-audience: expert + public).
- **`lib/methodology/scoring-config.ts`** — Tier weights, class multipliers, volume thresholds, named constants.
- **`lib/cron/snapshot.ts`** — Daily snapshot pipeline: fetch → three-layer assess → convergence → store.
- **`lib/cron/backfill.ts`** — Historical backfill (FR + WH + GDELT + CourtListener + DOJ + GovInfo + FEC) with AI assessment.
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

Three-layer triangulated detection pipeline:

1. **Layer 1: Structural anomaly** (`structural-scoring-service.ts`) — deterministic, metadata-only. Functional classifier (9 buckets, 4 tiers), 5+1 structural dimensions (volume, composition, authority, timing, velocity, source convergence), JSD + z-score against baselines.
2. **Layer 2: AI two-pass assessment** (`ai-assessment-service.ts`, `ai_document_assessments`) — Pass 1 (gpt-4o-mini) flags potentially concerning documents, Pass 2 (Claude Sonnet) classifies flagged docs. Different providers for epistemic independence.
3. **Layer 3: Thematic drift** (`thematic-drift-service.ts`) — rolling 8-week intra-admin window, detects topic distribution shifts.

**Convergence synthesis** (`convergence-service.ts`) combines all three layers into a single status: Stable → Elevated → Divergent → Confirmed Concern. Keywords serve as annotations only (not detection gates). Documented in `ASSESSMENT_METHODOLOGY.md`.

## Sprint process

Every sprint **MUST** follow this process. It may **ONLY** be skipped with explicit approval from the user.

1. **Analysis** — Research the problem space, read relevant code, identify what needs to change. Read `docs/DECISIONS.md` for relevant prior decisions, spec deviations, and lessons learned from related sprints.
2. **Propose** — Present findings and a numbered list of issues/changes to the user for review
3. **Approval** — Wait for user approval before writing any code. User may adjust scope.
4. **Create milestone & issues** — Create a GitHub Milestone for the sprint (if it doesn't exist). Create one GitHub Issue per work item with appropriate labels and assign it to the milestone. This must happen **before** implementation begins.
5. **Sprint number** — Update the sprint log in `docs/PROJECT_KNOWLEDGE.md` with the new sprint number and summary
6. **Implementation** — Do the work. Reference GitHub Issue numbers in commits (e.g., `Fixes #12`).
7. **Post-sprint code review** — Review all files created or modified in the sprint against the checklist below. Report findings to the user before making fixes. The results of the code review **MUST** be presented to the user for approval.
8. **Commit** — Stage, format, and commit only after the review is clean
9. **Retrospective** — Update `docs/DECISIONS.md` with a sprint entry covering: what was planned vs what was built, spec deviations (with section refs), key decisions and rationale, lessons learned. Then review the full document and condense or remove entries that are superseded, obsolete, or codified elsewhere (e.g., lessons already in `docs/PROJECT_KNOWLEDGE.md`, decisions overridden by later ones). Keep `docs/DECISIONS.md` lean. Annotate `docs/ROADMAP.md` for the completed sprint. Update `docs/PROJECT_KNOWLEDGE.md` if new persistent patterns were discovered. The results of the retrospective **MUST** be presented to the user for approval.
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

Database is bootstrapped from a `pg_dump` stored in GitHub Release assets. On first deploy, `pnpm db:init` detects an empty database, downloads the latest dump, restores it, then runs Drizzle migrations. See `DEPLOYMENT.md`.

## Project management

- **`docs/ROADMAP.md`** — Strategic sprint plan with goals, dependencies, cost estimates. Forward-looking; completed sprints get "Actual:" annotations.
- **`docs/DECISIONS.md`** — Sprint retrospectives: what was planned vs built, spec deviations, key decisions, lessons learned. Read before starting any sprint.
- **GitHub Milestones** — One per sprint. Close when all issues in the sprint are done.
- **GitHub Issues** — Individual work items within a sprint. Reference issue numbers in commit messages (`Fixes #N`).
- **Labels** — `stream:{data-pipeline,backend,ui,infra}`, `type:{feature,bug,research,review-gate}`, `priority:{p0,p1,p2}`

### Spec documents

- **`docs/PROJECT_KNOWLEDGE.md`** — Shared institutional knowledge: architecture decisions, sprint log, current state, module patterns, database gotchas
- **`docs/internal/SYSTEM SPECIFICATION V3 ADDENDUM.md`** — Backend requirements (Sprints A–J), risk reminders, schema changes
- **`docs/internal/UI DESIGN SPECIFICATION V3.md`** — Full UI redesign spec (Phases 1–5), component specs, API endpoint requirements
- **`ASSESSMENT_METHODOLOGY.md`** — Public-facing methodology documentation
