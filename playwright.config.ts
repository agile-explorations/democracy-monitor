import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E tests — run against a live server (dev or production).
 *
 * Usage:
 *   pnpm test:e2e                                    # localhost:3000
 *   BASE_URL=https://democracymonitor.us pnpm test:e2e  # production
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
  },
});
