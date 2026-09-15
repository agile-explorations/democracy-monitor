/**
 * CLI: pnpm cache:bust --key document-count [--key ...]
 *
 * Deletes named Redis cache entries so the next request recomputes them.
 * Added for R-SEARCH-ORTHOGONAL: the homepage "documents" count is cached
 * for a week, and the corpus restores change it between deploys — a key
 * bump only covers the deploy itself. Only keys listed in BUSTABLE_KEYS can
 * be named; the CLI never deletes arbitrary keys.
 */

import { cacheDel } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { checkHelp } from '@/lib/utils/cli-help';

/** Reader-facing names → cache keys that are safe to drop on demand. */
export const BUSTABLE_KEYS: Record<string, () => string> = {
  'document-count': CacheKeys.documentCount,
  'validate-graph': CacheKeys.validateGraph,
  'validate-data': CacheKeys.validateData,
};

/** Pure: resolve `--key` arguments to cache keys; unknown names throw. */
export function resolveBustKeys(args: string[]): string[] {
  const names = args.flatMap((a, i) => (a === '--key' && args[i + 1] ? [args[i + 1]] : []));
  if (names.length === 0) throw new Error('at least one --key <name> is required');
  return names.map((name) => {
    const key = BUSTABLE_KEYS[name];
    if (!key)
      throw new Error(
        `unknown cache name "${name}" (known: ${Object.keys(BUSTABLE_KEYS).join(', ')})`,
      );
    return key();
  });
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm cache:bust --key <name> [--key <name> ...]

Deletes the named cache entries so the next request recomputes them.
Names: ${Object.keys(BUSTABLE_KEYS).join(', ')}`,
  );
  Promise.all(
    resolveBustKeys(argv).map((k) =>
      cacheDel(k).then(() => console.log(`[cache:bust] deleted ${k}`)),
    ),
  )
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[cache:bust]', err);
      process.exit(1);
    });
}
