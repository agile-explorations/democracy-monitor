# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # ESLint (extends next/core-web-vitals)
```

Package manager is **pnpm**. No test framework is configured.

## Environment

Copy `.env.example` to `.env.local` for local overrides. Two optional variables:
- `ALLOWED_PROXY_HOSTS` — comma-separated hostname whitelist (defaults defined in `lib/allowedHosts.ts`)
- `PROXY_CACHE_TTL` — cache duration in seconds (default 600)

## Architecture

Next.js 14 app using **Pages Router** (not App Router), TypeScript strict mode, Tailwind CSS.

### Data flow

The dashboard monitors executive-power signals across 8 institutional categories. Each category defines multiple **signals** (RSS feeds, JSON APIs, HTML pages, Federal Register queries, scraped trackers). The flow is:

1. `ExecutivePowerDriftDashboard` renders a `CategoryCard` per category
2. Each `CategoryCard` renders `FeedBlock` components that call API routes to fetch data
3. API routes (`/api/proxy`, `/api/federal-register`, `/api/scrape-tracker`) act as server-side proxies to bypass CORS, with in-memory caching
4. Aggregated items are POSTed to `/api/assess-status` which runs keyword-based analysis
5. Assessment returns a status level (Stable → Warning → Drift → Capture) with matched keywords and reasoning

### Key files

- **`components/ExecutivePowerDriftDashboard.tsx`** — All dashboard UI, category definitions, signal configs, and sub-components (StatusPill, Card, FeedBlock, CategoryCard). This is where signals are added/removed.
- **`pages/api/assess-status.ts`** — Keyword-based assessment engine with per-category rules, authority weighting (GAO/courts weighted higher), and volume thresholds. Status determination logic lives here.
- **`pages/api/proxy.ts`** — CORS proxy with host whitelist validation, content-type detection (XML→xml2js, HTML→cheerio anchor extraction, JSON passthrough), and TTL cache.
- **`pages/api/federal-register.ts`** — Federal Register API wrapper with query building and 10-min cache.
- **`pages/api/scrape-tracker.ts`** — Cheerio-based scraper for Brookings, NAACP LDF, democracy watch, and progressive reform trackers. 1-hour cache.
- **`lib/allowedHosts.ts`** — Default proxy host whitelist (~21 .gov/.edu/.org domains).

### Client-side patterns

- The dashboard is loaded via `next/dynamic` with SSR disabled (client-only rendering)
- `useLocalStorage` custom hook persists refresh interval and status map
- `useAutoRefresh` hook handles periodic data refresh
- Status pills and assessment details stored in localStorage

### Assessment methodology

The assessment in `assess-status.ts` uses keyword dictionaries organized by category and severity tier (capture/drift/warning). It normalizes text, searches for keyword matches, weights by source authority, detects pattern language ("systematic", "repeated"), and applies volume thresholds. Documented in `ASSESSMENT_METHODOLOGY.md`.
