# Democracy Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A real-time dashboard that monitors signals of executive-power centralization across U.S. government institutions. It reads official government documents, court filings, press releases, and congressional records, then uses AI content assessment to identify when democratic checks and balances may be under pressure.

## What It Does

The dashboard tracks **14 institutional categories** — civil service protections, fiscal independence, executive oversight (inspectors general), Hatch Act enforcement, judicial independence, military constraints, rulemaking autonomy, executive actions, information availability, elections, media freedom, federal law enforcement, civil liberties, and immigration enforcement — and assigns each a concern status:

| Status                | Meaning                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| **Stable**            | AI content assessment found no concerning documents                                      |
| **Elevated**          | AI two-pass review identifies concerning documents with Pass 2 corroboration             |
| **Confirmed Concern** | AI assessment elevated with high Pass 2 concern rate (≥20%). Warrants close examination. |

Assessments are fully transparent: every status traces to specific documents, reproducible metrics, and published thresholds.

## How It Works

1. **Data collection** — Weekly cron jobs fetch from 9 source types (Federal Register, GovInfo/GAO, CourtListener, DOJ, OIG offices, LegiScan, FEC, Congressional Record, GDELT), storing full documents in PostgreSQL
2. **AI content assessment** (sole active detection) — Two-pass AI review with epistemic independence: GPT-4o-mini screens every document (8K chars, boilerplate-stripped), then Claude evaluates flagged documents with week-level context. Different providers ensure independent evaluation.
3. **Silence detection** (descriptive context) — Measures whether government-controlled sources have gone unusually quiet while independent-branch sources remain active. Provides narrative context but does not drive concern status.
4. **Structural anomaly** (descriptive context) — Deterministic, metadata-only analysis of volume, composition, timing, and agency patterns. Provides narrative grounding but does not drive concern status.
5. **Thematic drift** (descriptive context) — Embedding-based 8-week rolling window detecting semantic shifts in government output. Provides research context but does not drive concern status.
6. **Concern synthesis** — AI document review determines concern status via absolute Pass 2 thresholds. Structural, silence, and thematic data enrich narratives without influencing the status.

For full methodology details, see [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md).

## Quickstart

```bash
pnpm install
cp .env.example .env.local    # optional — works without it
pnpm db:migrate               # create tables (requires PostgreSQL)
pnpm dev                      # http://localhost:3000
```

**Requirements:** Node.js 18+, pnpm, PostgreSQL

See [CONTRIBUTING.md](CONTRIBUTING.md) for data setup — `pnpm db:init` restores the current production dataset (~6 GB) in one command.

### Running tests

```bash
pnpm test          # Run full test suite (Vitest, 2000+ tests)
pnpm test:watch    # Watch mode
```

### Building for production

```bash
pnpm build
pnpm start
```

## Environment Variables

All optional except `DATABASE_URL` for persistence features. See [.env.example](.env.example) for the full list.

| Variable                  | Required        | Description                                  |
| ------------------------- | --------------- | -------------------------------------------- |
| `DATABASE_URL`            | For persistence | PostgreSQL connection string                 |
| `REDIS_URL`               | No              | Redis for caching (falls back to in-memory)  |
| `OPENAI_API_KEY`          | No              | Enables AI assessment (Layer 2 Pass 1)       |
| `ANTHROPIC_API_KEY`       | No              | Enables AI assessment (Layer 2 Pass 2)       |
| `GOVINFO_API_KEY`         | No              | Enables GovInfo/GAO legislative tracking     |
| `COURTLISTENER_API_TOKEN` | No              | Enables CourtListener court docket ingestion |
| `FEC_API_KEY`             | No              | Enables FEC election enforcement tracking    |
| `ALLOWED_PROXY_HOSTS`     | No              | Comma-separated hostname whitelist for proxy |

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
  cron/           # Scheduled tasks (snapshot, backfill, digest)
  methodology/    # Scoring config, named constants, thresholds
  seed/           # AI assessment review pipeline (seed:review, seed:apply)
  types/          # TypeScript type definitions
  utils/          # Pure utility functions
  validation/     # Historical backtesting and known-event validation

components/       # UI components (overview, category detail, week detail, search)
pages/api/        # Server-side API routes (proxy, assessment, health, history)
__tests__/        # Vitest tests mirroring lib/ structure (2000+ tests)
```

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Contributing

We welcome contributions — especially from people with expertise in political science, constitutional law, data journalism, or government transparency.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and PR guidelines.

### Areas where help is needed

- **Detection methodology** — Improving AI assessment accuracy, reducing false positives, expanding known-events validation
- **Signal coverage** — Adding data sources for under-monitored categories (state-level data, international indices)
- **Source integrations** — New fetchers for government data sources (Oversight.gov, state-level courts)
- **Test coverage** — 2400+ tests across 166 files; UI components and newer services need coverage
- **Accessibility** — WCAG compliance audit

## Sponsor This Project

Democracy Monitor costs ~$260/month to run (hosting, AI APIs, development tools). Sponsorship keeps the daily monitoring pipeline running and funds continued development. See [SPONSORS.md](SPONSORS.md) for a full cost breakdown.

[![Sponsor](https://img.shields.io/badge/Sponsor-♡-pink)](https://github.com/sponsors/agile-explorations)

## Limitations

This is an automated monitoring system, not a substitute for expert judgment. It surfaces patterns worth human examination using structural analysis, AI assessment, and thematic drift detection. See [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md#limitations) for known limitations including federal focus, source availability dependence, and AI assessment constraints.

## License

[MIT](LICENSE) — Copyright (c) 2025 Michael Kelly
