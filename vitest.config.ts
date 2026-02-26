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
      ],
      thresholds: {
        autoUpdate: true,
        statements: 71.17,
        branches: 68.26,
        functions: 74.51,
        lines: 71.54,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
