# Democracy Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A real-time dashboard that monitors signals of executive-power centralization across US government institutions. It reads official government documents, RSS feeds, and public APIs, then uses keyword-based analysis to assess whether democratic checks and balances are functioning normally.

## What It Does

The dashboard tracks **9 institutional categories** — civil service neutrality, fiscal independence, inspector general oversight, judicial compliance, military constraints, rulemaking autonomy, Hatch Act enforcement, democratic indices, and information availability — and assigns each a status:

| Status      | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| **Stable**  | No warning signs — institutions functioning normally       |
| **Warning** | Some concerns found, but checks and balances appear intact |
| **Drift**   | Multiple warning signs — power becoming more centralized   |
| **Capture** | Serious violations — laws or court orders being ignored    |

Assessments are fully transparent: every status shows the exact keywords matched, the number of sources reviewed, and the reasoning behind the determination.

## How It Works

1. **Data collection** — Server-side API routes fetch from ~20 official sources (Federal Register API, GAO reports, IG feeds, Supreme Court, DoD, etc.) with caching
2. **Keyword analysis** — Each category has keyword dictionaries organized by severity tier (capture/drift/warning) with word-boundary matching, source authority weighting, and pattern detection
3. **Status determination** — Requires corroboration (2+ capture-tier matches for "Capture" status), flags insufficient data, and includes explicit disclaimers
4. **Optional AI layer** — When API keys are configured, provides multi-agent debate analysis, legal citation checking, and trend detection

For full methodology details, see [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md).

## Demo Mode

See the dashboard without any external API calls or credentials:

```bash
DEMO_MODE=true pnpm dev
```

Four scenarios available: `mixed` (default), `stable`, `crisis`, `degrading`. Set via `DEMO_SCENARIO=crisis`.

## Quickstart

```bash
pnpm install
cp .env.example .env.local   # optional — works without it
pnpm dev                      # http://localhost:3000
```

**Requirements:** Node.js 18+, pnpm

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

| Variable              | Required        | Description                                         |
| --------------------- | --------------- | --------------------------------------------------- |
| `DATABASE_URL`        | For persistence | PostgreSQL connection string                        |
| `REDIS_URL`           | No              | Redis for caching (falls back to in-memory)         |
| `OPENAI_API_KEY`      | No              | Enables AI-enhanced assessment                      |
| `ANTHROPIC_API_KEY`   | No              | Enables AI-enhanced assessment                      |
| `DEMO_MODE`           | No              | `true` serves fixture data with zero external calls |
| `ALLOWED_PROXY_HOSTS` | No              | Comma-separated hostname whitelist for proxy        |

## Architecture

Next.js 14 (Pages Router), TypeScript strict mode, Tailwind CSS.

```
lib/
  data/           # Category definitions, keyword dictionaries, assessment rules
  services/       # Assessment engine, AI services, feed processing
  parsers/        # RSS/JSON/HTML feed parsers
  cache/          # Redis + in-memory fallback
  ai/             # OpenAI/Anthropic provider abstraction
  db/             # Drizzle ORM schema and migrations
  demo/           # Demo mode fixtures and routing

components/
  dashboard/      # CategoryCard, FeedBlock, StatusLegend
  disclosure/     # Progressive disclosure layers (summary → evidence → deep analysis)
  intent/         # Administration's Intent section (rhetoric vs. action scoring)
  ui/             # Reusable components (StatusPill, Card, ConfidenceBar)

pages/api/        # Server-side API routes (proxy, assessment, AI endpoints)
__tests__/        # Vitest tests mirroring lib/ structure
```

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Contributing

We welcome contributions — especially from people with expertise in political science, constitutional law, data journalism, or government transparency.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and PR guidelines.

### Areas where help is needed

- **Assessment methodology** — Reducing false positives/negatives in keyword analysis
- **Signal coverage** — Adding data sources for under-monitored institutions
- **Authoritarian infrastructure tracking** — Detention facilities, surveillance contracts, opposition criminalization (see [TODO.md](TODO.md) for details)
- **Test coverage** — Currently ~39% of services; API routes and components untested
- **Accessibility** — WCAG compliance audit

## Limitations

This is an automated keyword analysis tool, not a substitute for expert judgment. See [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md#limitations--caveats) for known false positive/negative risks.

## License

[MIT](LICENSE) — Copyright (c) 2025 Michael Kelly
