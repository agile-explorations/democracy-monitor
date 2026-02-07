# Contributing

Thank you for your interest in improving Democracy Monitor. This project benefits from contributors with diverse expertise — software engineering, political science, constitutional law, data journalism, and government transparency.

## Getting Started

### Prerequisites

- **Node.js 18+**
- **pnpm** (install via `npm install -g pnpm`)
- **PostgreSQL** (optional — needed for persistence features)
- **Redis** (optional — falls back to in-memory cache)

### Setup

```bash
git clone https://github.com/agile-explorations/democracy-monitor.git
cd democracy-monitor
pnpm install
cp .env.example .env.local   # optional
pnpm dev                      # http://localhost:3000
```

### Demo Mode

To run without any external API calls:

```bash
DEMO_MODE=true pnpm dev
```

This serves fixture data across all 9 categories with varied statuses — useful for UI development and testing.

### Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build (includes type checking)
pnpm test         # Run test suite (Vitest)
pnpm test:watch   # Watch mode
pnpm lint         # ESLint
pnpm db:generate  # Generate Drizzle migrations from schema changes
pnpm db:migrate   # Apply migrations to PostgreSQL
```

## Code Conventions

### Stack

- **Next.js 14** with **Pages Router** (not App Router)
- **TypeScript** in strict mode
- **Tailwind CSS** for styling
- **Vitest** with jsdom for testing

### Style

- **Prettier** enforces formatting — run `pnpm format` to auto-fix
- **ESLint** extends `next/core-web-vitals` with additional React and import rules
- Pre-commit hooks run both automatically via `husky` + `lint-staged`
- Prefer named exports over default exports
- Keep components focused — extract when a file exceeds ~250 lines
- Don't `import React` — the Next.js JSX transform handles it. Use named imports: `import { useState } from 'react'`

### Event handler naming

- **`on*`** for callback props passed to a component: `onItemsLoaded`, `onAssessmentLoaded`
- **`handle*`** for functions that handle events inside a component: `handleAiToggle`, `handleItemsLoaded`
- Simple one-liner state toggles can stay inline: `onClick={() => setExpanded(!expanded)}`

### Directory structure

- **`lib/data/`** — Static data: category definitions, keyword dictionaries, assessment rules
- **`lib/services/`** — Business logic: assessment engine, AI services, feed processing
- **`lib/types/`** — TypeScript type definitions
- **`components/`** — React components organized by feature
- **`pages/api/`** — Next.js API routes (server-side only)
- **`__tests__/`** — Test files mirroring `lib/` structure

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Writing Tests

Tests use **Vitest** with jsdom environment. Test files go in `__tests__/` mirroring the source path:

```
lib/services/assessment-service.ts  →  __tests__/lib/services/assessment-service.test.ts
```

Run tests before submitting:

```bash
pnpm test
```

### What to test

- Pure functions in `lib/services/` and `lib/data/` — these are the highest-value tests
- Keyword matching edge cases (false positives, word boundaries, negation)
- API route handlers (request/response shape)

## Making Changes

### Assessment Keywords

The keyword dictionaries in `lib/data/assessment-rules.ts` are the most impactful thing you can improve. Each category has three severity tiers:

- **capture** — Indicates serious violations (e.g., "violated impoundment control act")
- **drift** — Concerning patterns (e.g., "reclassification", "excepted service")
- **warning** — Minor issues (e.g., "reorganization", "workforce reduction")

When adding keywords:

- Use specific legal/institutional language, not generic terms
- Consider false positive risk (will this match routine government activity?)
- Add a test case demonstrating the keyword triggers correctly
- See [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md) for the full methodology

### Adding Data Sources

Signal definitions live in `lib/data/categories.ts`. Each signal specifies a type (`rss`, `federal_register`, `html`, `json`) and a URL or query. If you add a new external host, also add it to `lib/allowedHosts.ts`.

### Adding Categories

Categories are defined in `lib/data/categories.ts` with corresponding assessment rules in `lib/data/assessment-rules.ts`. A new category needs both.

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `pnpm test` and `pnpm build` pass
4. Write a PR description explaining **what** changed and **why**
5. For assessment methodology changes, explain the false-positive/negative tradeoffs

### Commit messages

Use conventional commit style:

```
feat: add election infrastructure signals to elections category
fix: reduce false positives from routine reorganization keywords
docs: document detention infrastructure tracking gaps
test: add edge cases for word-boundary keyword matching
chore: update dependencies
```

## Reporting Issues

Open an issue on GitHub. For assessment methodology concerns, please include:

- The category affected
- What status was shown vs. what you expected
- The specific keywords or sources involved
- Why you believe it's a false positive or false negative

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
