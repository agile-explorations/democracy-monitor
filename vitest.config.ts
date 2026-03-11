import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        // I/O-heavy fetcher modules: pure conversion functions are tested,
        // but fetch/pagination logic is integration code (not unit-testable)
        'lib/services/courtlistener-fetcher.ts',
        'lib/services/doj-fetcher.ts',
        'lib/services/fec-fetcher.ts',
        'lib/services/federal-register-fetcher.ts',
        'lib/services/govinfo-fetcher.ts',
        // Embedding pipeline — DB I/O + OpenAI API calls, not unit-testable
        'lib/services/document-embedder.ts',
        // DB I/O and CLI modules — pure functions tested, DB ops need integration tests
        'lib/services/data-validation-queries.ts',
        'lib/services/ingest-validation-queries.ts',
        'lib/services/fetch-log-store.ts',
        'lib/services/snapshot-store.ts',
        'lib/services/narrative-store.ts',
        'lib/services/narrative-pipeline.ts',
        'lib/cron/backfill-content.ts',
        'lib/cron/backfill-gaps.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 67,
        functions: 72,
        lines: 71,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
