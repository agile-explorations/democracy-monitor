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
pnpm snapshot       # Run daily snapshot cron (real data)
pnpm backfill       # Backfill historical data (FR + WH + GDELT)
pnpm demo:seed      # DEV ONLY: generate deterministic demo snapshots from fixtures
pnpm seed:export    # Export seed data fixtures from DB to lib/seed/fixtures/
pnpm seed:import    # Import seed data fixtures into DB (no API keys needed)
pnpm seed:review    # Generate AI Skeptic disagreement report for human review
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

## Architecture

Next.js 14 app using **Pages Router** (not App Router), TypeScript strict mode, Tailwind CSS.

### Data flow

The dashboard monitors executive-power signals across 11 institutional categories. Each category defines multiple **signals** (RSS feeds, JSON APIs, HTML pages, Federal Register queries, scraped trackers). The flow is:

1. **Cron/backfill** fetches data from external sources (FR, WH, GDELT, RSS) and stores documents in PostgreSQL
2. **Snapshot pipeline** (`lib/cron/snapshot.ts`) runs keyword assessment → AI Skeptic review → stores assessment snapshots
3. **API routes** (`/api/proxy`, `/api/federal-register`, `/api/scrape-tracker`) act as server-side proxies with Redis caching (in-memory fallback)
4. **UI** reads stored snapshots and documents via API routes; progressive disclosure surfaces assessment details on demand
5. Assessment returns a status level (Stable → Warning → Drift → Capture) with matched keywords, AI review, and reasoning

> **Note:** The UI is being rebuilt from scratch per `UI DESIGN SPECIFICATION V3.md`. The current component tree will be replaced.

### Directory structure

```
lib/
  types/          # TypeScript type definitions (categories, assessment, AI)
  data/           # Static data (CATEGORIES array, ASSESSMENT_RULES, P2025 seeds)
  parsers/        # Feed response parsers
  hooks/          # React hooks (useLocalStorage, useAutoRefresh)
  services/       # Business logic (assessment, convergence, rhetoric, proxy-parser, tracker)
  db/             # Drizzle ORM (schema, client, migrations)
  cache/          # Redis + in-memory fallback cache layer
  ai/             # AI provider abstraction (OpenAI, Anthropic) + prompt templates
  cron/           # Scheduled tasks (snapshot, backfill, backfill-baseline)
  methodology/    # Scoring config, named constants, thresholds
  utils/          # Pure utility functions (async, collections, date, math, ai)
  seed/           # Seed data export/import pipeline + fixtures
  allowedHosts.ts # Proxy host whitelist

components/       # UI components (being rebuilt — see UI DESIGN SPECIFICATION V3.md)

pages/
  api/            # API routes (proxy, federal-register, scrape-tracker, assess-status)

drizzle/          # SQL migration files
__tests__/        # Vitest test files mirroring lib/ structure
```

### Key files

- **`lib/data/categories.ts`** — All 11 category and signal definitions. This is where signals are added/removed.
- **`lib/data/assessment-rules.ts`** — Keyword dictionaries per category and severity tier.
- **`lib/services/assessment-service.ts`** — Keyword-based assessment engine with authority weighting and volume thresholds.
- **`lib/services/ai-assessment-service.ts`** — AI Skeptic review layer (runs after keyword assessment).
- **`lib/methodology/scoring-config.ts`** — Tier weights, class multipliers, volume thresholds, named constants.
- **`lib/cron/snapshot.ts`** — Daily snapshot pipeline: fetch → keyword assess → AI Skeptic → store.
- **`lib/cron/backfill.ts`** — Historical backfill (FR + WH + GDELT) with AI assessment.
- **`lib/cache/index.ts`** — Redis cache with automatic in-memory fallback when Redis is unavailable.
- **`lib/ai/provider.ts`** — AI provider factory (OpenAI, Anthropic) with availability checks.
- **`lib/db/schema.ts`** — Drizzle ORM table definitions (documents, assessments, baselines, weekly_aggregates, etc.).
- **`pages/api/proxy.ts`** — CORS proxy with host whitelist, content-type detection, Redis caching.
- **`pages/api/assess-status.ts`** — Assessment endpoint delegating to assessment-service.

### Client-side patterns

- The dashboard is loaded via `next/dynamic` with SSR disabled (client-only rendering)
- `useLocalStorage` custom hook persists refresh interval and status map
- Status pills and assessment details stored in localStorage

### Assessment methodology

Two-layer assessment pipeline:

1. **Keyword assessment** (`assessment-service.ts`) — keyword dictionaries organized by category and severity tier (capture/drift/warning). Normalizes text, searches for keyword matches, weights by source authority, detects pattern language, applies volume thresholds.
2. **AI Skeptic review** (`ai-assessment-service.ts`) — LLM reviews keyword matches and renders per-keyword verdicts (`genuine_concern`, `false_positive`, `ambiguous`). Can recommend status changes with confidence scores and evidence.

Both layers run during snapshot creation and backfill. AI assessment subsumes keyword assessment — the UI shows the single best-available result (AI preferred, keyword fallback). Documented in `ASSESSMENT_METHODOLOGY.md`.

## Sprint process

Every sprint **MUST** follow this process. It may **ONLY** be skipped with explicit approval from the user.

1. **Analysis** — Research the problem space, read relevant code, identify what needs to change
2. **Propose** — Present findings and a numbered list of issues/changes to the user for review
3. **Approval** — Wait for user approval before writing any code. User may adjust scope.
4. **Create milestone & issues** — Create a GitHub Milestone for the sprint (if it doesn't exist). Create one GitHub Issue per work item with appropriate labels and assign it to the milestone. This must happen **before** implementation begins.
5. **Sprint number** — Update the sprint log in `MEMORY.md` with the new sprint number and summary
6. **Implementation** — Do the work. Reference GitHub Issue numbers in commits (e.g., `Fixes #12`).
7. **Post-sprint code review** — Review all files created or modified in the sprint against the checklist below. Report findings to the user before making fixes.
8. **Commit** — Stage, format, and commit only after the review is clean
9. **Close issues & milestone** — Close each completed GitHub Issue (with commit SHA in the close comment). Close the milestone once all issues are resolved. Detach any remaining open issues from the milestone before closing it.

### What to check

1. **Clean code** — functions are short, single-purpose, and readable at a glance
2. **Naming** — constants, variables, functions, and types have clear, descriptive names; no magic numbers or unnamed thresholds
3. **SOLID principles** — especially Single Responsibility (one reason to change per module) and Dependency Inversion (depend on abstractions, not concretions)
4. **DRY** — no duplicated logic, constants, or type definitions across files; shared code lives in `lib/data/`, `lib/utils/`, or `lib/types/`
5. **Testability** — pure functions extractable from I/O; business logic not buried inside API routes or components
6. **OpenGrep rule candidates** — for any issue that represents a recurring anti-pattern, evaluate whether a new `.opengrep/security.yml` rule could prevent it. Write and test the rule before fixing the code.
7. **Test Quality** - All automated tests must test functionality, not implementation.
8. **File and function length** — ESLint `max-lines` and `max-lines-per-function` rules are enforced (see `.eslintrc.json`). Data/fixture files and tests are exempt via overrides.

### Where shared code lives

| What                           | Where                               |
| ------------------------------ | ----------------------------------- |
| Static data / config arrays    | `lib/data/`                         |
| Pure utility functions         | `lib/utils/`                        |
| Type definitions               | `lib/types/`                        |
| Scoring constants / thresholds | `lib/methodology/scoring-config.ts` |

### Infrastructure

Configured for **Render.com** deployment via `render.yaml`:

- Web Service (Next.js app)
- PostgreSQL (Drizzle ORM, future pgvector)
- Redis Key-Value store (caching)
- 3 Cron jobs (stubs for future phases)

## Project management

- **ROADMAP.md** — Strategic sprint plan (Sprints 11–24) with goals, dependencies, cost estimates, and parallel-track opportunities. This is the source of truth for what's planned.
- **GitHub Milestones** — One per sprint. Close when all issues in the sprint are done.
- **GitHub Issues** — Individual work items within a sprint. Reference issue numbers in commit messages (`Fixes #N`).
- **Labels** — `stream:{data-pipeline,backend,ui,infra}`, `type:{feature,bug,research,review-gate}`, `priority:{p0,p1,p2}`

### Spec documents

- **`SYSTEM SPECIFICATION V3 ADDENDUM.md`** — Backend requirements (Sprints A–J), risk reminders, schema changes
- **`UI DESIGN SPECIFICATION V3.md`** — Full UI redesign spec (Phases 1–5), component specs, API endpoint requirements
- **`ASSESSMENT_METHODOLOGY.md`** — Public-facing methodology documentation
