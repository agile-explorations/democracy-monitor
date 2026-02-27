import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        // I/O-heavy fetcher modules: pure conversion functions are tested,
        // but fetch/pagination logic is integration code (not unit-testable)
        'lib/services/courtlistener-fetcher.ts',
        'lib/services/doj-fetcher.ts',
        'lib/services/fec-fetcher.ts',
        'lib/services/govinfo-fetcher.ts',
        // DB I/O and CLI modules — pure functions tested, DB ops need integration tests
        'lib/services/fetch-log-store.ts',
        'lib/cron/backfill-gaps.ts',
        'lib/cron/retry-failed-signals.ts',
      ],
      thresholds: {
        autoUpdate: true,
        statements: 71.23,
        branches: 68.48,
        functions: 74.26,
        lines: 71.59,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
