# Democracy Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A real-time dashboard that monitors signals of executive-power centralization across U.S. government institutions. It reads official government documents, court filings, press releases, and public APIs, then uses three-layer triangulated detection (structural anomaly, AI assessment, thematic drift) to assess whether democratic checks and balances are functioning normally.

## What It Does

The dashboard tracks **14 institutional categories** — civil service protections, fiscal independence, executive oversight (inspectors general), Hatch Act enforcement, judicial independence, military constraints, rulemaking autonomy, executive actions, information availability, elections, media freedom, federal law enforcement, civil liberties, and immigration enforcement — and assigns each a convergence status:

| Status                | Meaning                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Stable**            | No layers elevated — institutions functioning normally                                                     |
| **Elevated**          | One detection layer flagging anomalies — worth monitoring                                                  |
| **Divergent**         | Two or more independent layers flag anomalies — multiple methods see something unusual                     |
| **Confirmed Concern** | Two or more layers elevated AND high AI concern rate — independent methods converge on concerning findings |

No single detection layer can escalate a category beyond Elevated on its own. Assessments are fully transparent: every status traces to specific documents, reproducible metrics, and published thresholds.

## How It Works

1. **Data collection** — Cron jobs fetch from multiple source types (Federal Register, GovInfo/GAO, CourtListener, DOJ, OIG offices, LegiScan, FEC, GDELT) plus FCC RSS feeds, storing documents in PostgreSQL
2. **Layer 1 — Structural anomaly** — Deterministic, metadata-only analysis: volume spikes, document-type shifts, functional distribution changes, agency concentration, publication tempo, and source convergence. Uses Jensen-Shannon divergence and z-scores against historical baselines.
3. **Layer 2 — AI assessment** — Two-pass AI review with epistemic independence: GPT-4o-mini screens every document, then Claude evaluates flagged documents. Different providers ensure independent evaluation. Tracks flag rates and concern rates against baselines.
4. **Layer 3 — Thematic drift** — Embedding-based intra-administration rolling window (8 weeks) detecting semantic shifts in government output that wouldn't appear in structural metadata
5. **Convergence synthesis** — Combines all three layers into a single status, requiring multi-layer agreement for escalation beyond Elevated

For full methodology details, see [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md).

## Quickstart

```bash
pnpm install
cp .env.example .env.local    # optional — works without it
pnpm db:migrate               # create tables (requires PostgreSQL)
pnpm dev                      # http://localhost:3000
```

**Requirements:** Node.js 18+, pnpm, PostgreSQL

See [CONTRIBUTING.md](CONTRIBUTING.md) for data setup and the full dataset download.

### Running tests

```bash
pnpm test          # Run full test suite (Vitest, 1450+ tests)
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
  seed/           # Seed data export/import pipeline + fixtures
  types/          # TypeScript type definitions
  utils/          # Pure utility functions
  validation/     # Cross-baseline validation

components/       # UI components (CategoryCard, TrendChart, StatusPill, etc.)
pages/api/        # Server-side API routes (proxy, assessment, health, history)
__tests__/        # Vitest tests mirroring lib/ structure (1450+ tests)
```

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Contributing

We welcome contributions — especially from people with expertise in political science, constitutional law, data journalism, or government transparency.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and PR guidelines.

### Areas where help is needed

- **Detection methodology** — Improving three-layer detection accuracy, reducing false positives in structural and AI assessment
- **Signal coverage** — Adding data sources for under-monitored categories (state-level data, international indices)
- **Source integrations** — New fetchers for government data sources (LegiScan legislative tracking is planned)
- **Test coverage** — 1450+ tests across 117 files; UI components and newer services need coverage
- **Accessibility** — WCAG compliance audit

## Sponsor This Project

Democracy Monitor costs ~$260/month to run (hosting, AI APIs, development tools). Sponsorship keeps the daily monitoring pipeline running and funds continued development. See [SPONSORS.md](SPONSORS.md) for a full cost breakdown.

[![Sponsor](https://img.shields.io/badge/Sponsor-♡-pink)](https://github.com/sponsors/agile-explorations)

## Limitations

This is an automated monitoring system, not a substitute for expert judgment. It surfaces patterns worth human examination using structural analysis, AI assessment, and thematic drift detection. See [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md#limitations) for known limitations including federal focus, source availability dependence, and AI assessment constraints.

## License

[MIT](LICENSE) — Copyright (c) 2025 Michael Kelly
