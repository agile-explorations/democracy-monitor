# Democracy Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A real-time dashboard that monitors signals of executive-power centralization across US government institutions. It reads official government documents, RSS feeds, and public APIs, then uses three-layer triangulated detection (structural anomaly, AI assessment, thematic drift) to assess whether democratic checks and balances are functioning normally.

## What It Does

The dashboard tracks **11 institutional categories** — civil service neutrality, fiscal independence, inspector general oversight, judicial compliance, military constraints, rulemaking autonomy, Hatch Act enforcement, executive actions, information availability, elections, and media freedom — and assigns each a status:

| Status      | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| **Stable**  | No warning signs — institutions functioning normally       |
| **Warning** | Some concerns found, but checks and balances appear intact |
| **Drift**   | Multiple warning signs — power becoming more centralized   |
| **Capture** | Serious violations — laws or court orders being ignored    |

Assessments are fully transparent: every status shows the exact keywords matched, the number of sources reviewed, and the reasoning behind the determination.

## How It Works

1. **Data collection** — Cron jobs fetch from ~30 official sources (Federal Register API, White House, GDELT, GAO reports, IG feeds, etc.) and store documents in PostgreSQL
2. **Layer 1 — Structural anomaly** — Deterministic, metadata-only analysis: volume spikes, timing shifts, agency concentration, document-class distribution, and source convergence
3. **Layer 2 — AI assessment** — Two-pass AI review (GPT-4o-mini + Claude Sonnet) with epistemic independence between providers, per-document concern classification
4. **Layer 3 — Thematic drift** — Embedding-based intra-administration rolling window comparison detecting semantic shifts in government output
5. **Convergence synthesis** — Combines all three layers into a single status (Stable → Elevated → Divergent → Confirmed Concern), requiring multi-layer agreement for escalation

For full methodology details, see [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md).

## Quickstart

```bash
pnpm install
cp .env.example .env.local    # optional — works without it
pnpm db:migrate               # create tables (requires PostgreSQL)
pnpm seed:import              # load fixture data (~93MB, no API keys needed)
pnpm dev                      # http://localhost:3000
```

**Requirements:** Node.js 18+, pnpm, PostgreSQL

See [CONTRIBUTING.md](CONTRIBUTING.md) for data setup tiers (quick start, with AI, full dataset).

### Running tests

```bash
pnpm test          # Run full test suite (Vitest)
pnpm test:watch    # Watch mode
```

### Building for production

```bash
pnpm build
pnpm start
```

## Environment Variables

All optional except `DATABASE_URL` for persistence features. See [.env.example](.env.example) for the full list.

| Variable              | Required        | Description                                  |
| --------------------- | --------------- | -------------------------------------------- |
| `DATABASE_URL`        | For persistence | PostgreSQL connection string                 |
| `REDIS_URL`           | No              | Redis for caching (falls back to in-memory)  |
| `OPENAI_API_KEY`      | No              | Enables AI-enhanced assessment               |
| `ANTHROPIC_API_KEY`   | No              | Enables AI-enhanced assessment               |
| `ALLOWED_PROXY_HOSTS` | No              | Comma-separated hostname whitelist for proxy |

## Architecture

Next.js 14 (Pages Router), TypeScript strict mode, Tailwind CSS.

```
lib/
  data/           # Category definitions, keyword dictionaries, assessment rules
  services/       # Assessment engine, AI services, convergence, feed processing
  parsers/        # RSS/JSON/HTML feed parsers
  cache/          # Redis + in-memory fallback
  ai/             # OpenAI/Anthropic provider abstraction
  db/             # Drizzle ORM schema and migrations
  cron/           # Scheduled tasks (snapshot, backfill, digest, clustering)
  methodology/    # Scoring config, named constants, thresholds
  seed/           # Seed data export/import pipeline + fixtures
  types/          # TypeScript type definitions
  utils/          # Pure utility functions

components/       # UI components (CategoryCard, TrendChart, StatusPill, etc.)
pages/api/        # Server-side API routes (proxy, assessment, health, history)
__tests__/        # Vitest tests mirroring lib/ structure (1221 tests)
```

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Contributing

We welcome contributions — especially from people with expertise in political science, constitutional law, data journalism, or government transparency.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and PR guidelines.

### Areas where help is needed

- **Assessment methodology** — Reducing false positives/negatives in keyword analysis
- **Signal coverage** — Adding data sources for under-monitored institutions
- **Authoritarian infrastructure tracking** — Detention facilities, surveillance contracts, opposition criminalization (see [TODO.md](TODO.md) for details)
- **Test coverage** — 1221 tests across 96 files; UI components and newer services need coverage
- **Accessibility** — WCAG compliance audit

## Limitations

This is an automated keyword analysis tool, not a substitute for expert judgment. See [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md#limitations--caveats) for known false positive/negative risks.

## License

[MIT](LICENSE) — Copyright (c) 2025 Michael Kelly
