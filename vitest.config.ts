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
        'lib/services/crec-fetcher.ts',
        // Embedding pipeline — DB I/O + OpenAI API calls, not unit-testable
        'lib/services/document-embedder.ts',
        // DB I/O and CLI modules — pure functions tested, DB ops need integration tests
        'lib/services/category-summary-service.ts',
        'lib/services/data-validation-queries.ts',
        'lib/services/document-review-queries.ts',
        'lib/services/ingest-validation-queries.ts',
        'lib/services/funnel-validation-queries.ts',
        'lib/services/fetch-log-store.ts',
        'lib/services/fr-drop-ledger.ts',
        'lib/cron/validate-mf-drops.ts',
        'lib/cron/validate-funnel.ts',
        'lib/services/snapshot-store.ts',
        'lib/services/narrative-store.ts',
        'lib/services/narrative-pipeline.ts',
        'lib/cron/backfill-content.ts',
        'lib/cron/backfill-gaps.ts',
        'lib/cron/backfill-oversight-gov.ts',
        'lib/cron/feedback-moderate.ts',
        // CL bulk staging — DB COPY ops, execSync pipes, not unit-testable
        'lib/services/cl-bulk-staging.ts',
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
