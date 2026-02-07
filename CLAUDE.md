# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint          # ESLint (extends next/core-web-vitals)
pnpm lint:patterns # OpenGrep custom pattern rules (.opengrep/)
pnpm test          # Run Vitest test suite
pnpm test:coverage # Run tests with coverage thresholds
pnpm test:watch    # Run Vitest in watch mode
pnpm db:generate  # Generate Drizzle migrations from schema
pnpm db:migrate   # Apply migrations to PostgreSQL
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

The dashboard monitors executive-power signals across 8 institutional categories. Each category defines multiple **signals** (RSS feeds, JSON APIs, HTML pages, Federal Register queries, scraped trackers). The flow is:

1. `ExecutivePowerDriftDashboard` renders a `CategoryCard` per category
2. Each `CategoryCard` renders `FeedBlock` components that call API routes to fetch data
3. API routes (`/api/proxy`, `/api/federal-register`, `/api/scrape-tracker`) act as server-side proxies to bypass CORS, with Redis caching (in-memory fallback)
4. Aggregated items are POSTed to `/api/assess-status` which runs keyword-based analysis
5. Assessment returns a status level (Stable → Warning → Drift → Capture) with matched keywords and reasoning

### Directory structure

```
lib/
  types/          # TypeScript type definitions (categories, assessment, AI)
  data/           # Static data (CATEGORIES array, ASSESSMENT_RULES)
  parsers/        # Feed response parsers
  hooks/          # React hooks (useLocalStorage, useAutoRefresh)
  services/       # Business logic (feed-service, assessment-service)
  db/             # Drizzle ORM (schema, client, migrations)
  cache/          # Redis + in-memory fallback cache layer
  ai/             # AI provider abstraction (OpenAI, Anthropic)
  allowedHosts.ts # Proxy host whitelist

components/
  ui/             # Reusable UI components (StatusPill, Card, ConfidenceBar)
  dashboard/      # Dashboard-specific components (FeedBlock, CategoryCard, Header, Footer, StatusLegend)
  ExecutivePowerDriftDashboard.tsx  # Main dashboard (~40 lines, imports everything)

pages/
  api/            # API routes (proxy, federal-register, scrape-tracker, assess-status)

drizzle/          # SQL migration files
__tests__/        # Vitest test files mirroring lib/ structure
```

### Key files

- **`lib/data/categories.ts`** — All category and signal definitions. This is where signals are added/removed.
- **`lib/data/assessment-rules.ts`** — Keyword dictionaries per category and severity tier.
- **`lib/services/assessment-service.ts`** — Keyword-based assessment engine with authority weighting and volume thresholds.
- **`lib/cache/index.ts`** — Redis cache with automatic in-memory fallback when Redis is unavailable.
- **`lib/ai/provider.ts`** — AI provider factory (OpenAI, Anthropic) with availability checks.
- **`lib/db/schema.ts`** — Drizzle ORM table definitions (cache_entries, documents, assessments, site_uptime).
- **`pages/api/proxy.ts`** — CORS proxy with host whitelist, content-type detection, Redis caching.
- **`pages/api/assess-status.ts`** — Assessment endpoint delegating to assessment-service.

### Client-side patterns

- The dashboard is loaded via `next/dynamic` with SSR disabled (client-only rendering)
- `useLocalStorage` custom hook persists refresh interval and status map
- Status pills and assessment details stored in localStorage

### Assessment methodology

The assessment in `assessment-service.ts` uses keyword dictionaries organized by category and severity tier (capture/drift/warning). It normalizes text, searches for keyword matches, weights by source authority, detects pattern language ("systematic", "repeated"), and applies volume thresholds. Documented in `ASSESSMENT_METHODOLOGY.md`.

### Infrastructure

Configured for **Render.com** deployment via `render.yaml`:

- Web Service (Next.js app)
- PostgreSQL (Drizzle ORM, future pgvector)
- Redis Key-Value store (caching)
- 3 Cron jobs (stubs for future phases)
