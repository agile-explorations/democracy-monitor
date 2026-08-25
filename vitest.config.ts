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
        // dhs-press: pure parsing lives in dhs-press-parsers.ts (fully covered);
        // these two carry the listing-walk / sitemap / CDX fetch I/O
        'lib/services/dhs-press-fetcher.ts',
        'lib/services/dhs-press-archive.ts',
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
        // #729 replay/prewarm: pure pieces (arm cache, key/stamp logic) are
        // unit-tested in arm-cache.test.ts; these carry the DB I/O + CLI glue
        'lib/cron/replay-slow-aliases.ts',
        'lib/cron/prewarm-indexes.ts',
        // CL bulk staging — DB COPY ops, execSync pipes, not unit-testable
        'lib/services/cl-bulk-staging.ts',
        // #750 entity mining I/O (DB fetch + arm runs); the pure extraction
        // half lives in entity-extraction.ts and is fully unit-tested
        'lib/services/entity-mining.ts',
        // #758 enumeration retrieval I/O (seed sweep + salience arms + arm
        // hydration); pure halves live in aspect-composition.ts,
        // hot-entity-ranking.ts, and hot-entity-selection's exported ranker
        'lib/services/research-loop-retrieval.ts',
        'lib/services/hot-entity-selection.ts',
        'lib/services/hot-entity-judge.ts',
        // #762: the slot-pool unit tests import the loop, whose import
        // chain loads these DB/arm I/O modules into the coverage
        // denominator at 0% — their pure halves (armWeight, fusion,
        // composers) are tested via their own suites.
        'lib/services/research-fusion.ts',
        // Load-test harness (#781): I/O probe/runner code exercised against
        // the dev environment, not unit tests; pure parts (hashQuery, pct,
        // bank exclusions) ARE unit-tested but the files are I/O-dominant.
        'scripts/loadtest/**',
        'lib/services/search-service.ts',
        'lib/services/search-queries.ts',
        'lib/services/research-retrieval.ts',
        'lib/services/research-synthesis-service.ts',
        'lib/services/hybrid-explore.ts',
        'lib/services/narrative-queries.ts',
        // #757 weekly hot-entity sweep — DB batches + embedding I/O
        'lib/cron/refresh-hot-entities.ts',
        // #740 RECAP ingest — CL API + storage I/O; filter is unit-tested
        'lib/services/recap-fetcher.ts',
        'lib/cron/backfill-recap.ts',
        'lib/services/recap-weekly.ts',
        // #739 GAO Wayback ingest — CDX/replay I/O; parsing is unit-tested
        // in gao-parsers.test.ts, CDX parsing in wayback-cdx.test.ts
        'lib/services/wayback-cdx.ts',
        'lib/services/gao-fetcher.ts',
        'lib/cron/backfill-gao.ts',
        // #761 docket discovery — CL search + tracked_cases I/O; candidate
        // filter is unit-tested
        'lib/services/docket-discovery.ts',
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
