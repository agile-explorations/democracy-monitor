# Executive Power Drift — Live Dashboard

A Next.js + TypeScript + Tailwind app that tracks signals of executive-power centralization vs. rule-of-law guardrails. It includes a secure server-side proxy to fetch .gov/.mil pages/RSS without CORS issues and lightly normalize results.

## Quickstart

```bash
pnpm i   # or npm i / yarn
cp .env.example .env.local  # optional
pnpm dev
```

Open http://localhost:3000

## Deploy
- **Vercel**: push this repo; API route runs as a serverless function.
- **Render/Heroku**: `pnpm build && pnpm start` using Node 18+.

## Configuration
- `ALLOWED_PROXY_HOSTS`: comma-separated whitelist of hostnames the proxy will fetch.
- `PROXY_CACHE_TTL`: integer seconds to cache responses in memory (default 600).

## Notes
- The proxy exposes `/api/proxy?url=ENCODED_URL`. It rejects hosts not on the allowlist.
- RSS/XML is parsed via `xml2js`; HTML gets a simple anchor extraction as a fallback.
- Client stores your per-category status pill in `localStorage`.
- Add or remove signals in `components/ExecutivePowerDriftDashboard.tsx`.