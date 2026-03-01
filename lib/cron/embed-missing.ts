/**
 * CLI: pnpm embed:missing [--category <key>]
 *
 * Embeds all documents that have no embedding yet. Reuses embedUnprocessedDocuments()
 * from the document-embedder service.
 */

import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';

async function run(categoryFilter?: string): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[embed-missing] DATABASE_URL not configured');
    process.exit(1);
  }

  const categories = categoryFilter
    ? CATEGORIES.filter((c) => c.key === categoryFilter)
    : CATEGORIES;

  if (categories.length === 0) {
    console.error(`[embed-missing] Unknown category: ${categoryFilter}`);
    process.exit(1);
  }

  let grandTotal = 0;

  for (const cat of categories) {
    const count = await embedUnprocessedDocuments(50, cat.key);
    if (count > 0) console.log(`  ${cat.key}: ${count} embedded`);
    grandTotal += count;
  }

  console.log(`[embed-missing] Done — ${grandTotal} documents embedded`);
}

/* CLI entry */
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  const catIdx = args.indexOf('--category');
  const categoryFilter = catIdx !== -1 ? args[catIdx + 1] : undefined;

  run(categoryFilter).catch((err) => {
    console.error('[embed-missing] Fatal:', err);
    process.exit(1);
  });
}
