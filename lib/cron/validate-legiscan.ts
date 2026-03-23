/**
 * Validate LegiScan bill classification after backfill.
 *
 * Queries the DB for LegiScan documents, shows per-category distribution
 * and samples bill titles for spot-checking topic routing relevance.
 * Flags categories with suspiciously high counts (potential remaining noise).
 *
 * Usage:
 *   pnpm validate:legiscan                          # All categories
 *   pnpm validate:legiscan --category fiscal         # Single category
 *   pnpm validate:legiscan --sample 10               # Show 10 sample titles per category
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const DEFAULT_SAMPLE_SIZE = 5;
const HIGH_COUNT_THRESHOLD = 300;

interface CategoryStats {
  category: string;
  count: number;
  samples: Array<{ title: string; pubDate: string }>;
}

async function getCategoryStats(
  category?: string,
  sampleSize = DEFAULT_SAMPLE_SIZE,
): Promise<CategoryStats[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const categoryFilter = category ? sql`AND category = ${category}` : sql``;

  const countsResult = await db.execute(sql`
    SELECT category, count(*) as count
    FROM documents
    WHERE source_origin = 'legiscan' ${categoryFilter}
    GROUP BY category
    ORDER BY count DESC
  `);

  const stats: CategoryStats[] = [];

  for (const row of countsResult.rows) {
    const cat = String(row.category);
    const count = Number(row.count);

    const samplesResult = await db.execute(sql`
      SELECT title, pub_date FROM documents
      WHERE source_origin = 'legiscan' AND category = ${cat}
      ORDER BY random()
      LIMIT ${sampleSize}
    `);

    stats.push({
      category: cat,
      count,
      samples: samplesResult.rows.map((r) => ({
        title: String(r.title ?? '(untitled)'),
        pubDate: String(r.pub_date ?? '').slice(0, 10),
      })),
    });
  }

  return stats;
}

async function run(category?: string, sampleSize?: number): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const samples = sampleSize ?? DEFAULT_SAMPLE_SIZE;
  console.log('[validate-legiscan] Querying LegiScan documents...\n');

  const stats = await getCategoryStats(category, samples);

  if (stats.length === 0) {
    console.log('  No LegiScan documents found in database.');
    console.log('  Run `pnpm legiscan:bulk` to backfill.');
    return;
  }

  const total = stats.reduce((sum, s) => sum + s.count, 0);
  console.log(`  Total LegiScan docs: ${total}`);
  console.log(`  Categories with docs: ${stats.length}\n`);

  const warnings: string[] = [];

  console.log('  Per-category distribution:');
  for (const { category: cat, count } of stats) {
    const flag = count > HIGH_COUNT_THRESHOLD ? ' *** HIGH — check for noise' : '';
    console.log(`    ${count.toString().padStart(6)} — ${cat}${flag}`);
    if (flag) warnings.push(`${cat}: ${count} docs — possible keyword noise`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`SAMPLE TITLES (${samples} per category) — check topic relevance`);
  console.log('='.repeat(80));

  for (const { category: cat, count, samples: docs } of stats) {
    console.log(`\n--- ${cat} (${count} total) ---`);
    for (let i = 0; i < docs.length; i++) {
      console.log(`  [${i + 1}] (${docs[i].pubDate}) ${docs[i].title}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\n\n=== WARNINGS ===\n');
    for (const w of warnings) console.log(`  ${w}`);
  }

  console.log('\n[validate-legiscan] Done.');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm validate:legiscan [options]

Options:
  --category <key>    Validate a single category (default: all)
  --sample <N>        Number of sample titles per category (default: ${DEFAULT_SAMPLE_SIZE})`,
  );

  const catIdx = args.indexOf('--category');
  const sampleIdx = args.indexOf('--sample');
  const categoryFilter = catIdx >= 0 ? args[catIdx + 1] : undefined;
  const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : undefined;

  run(categoryFilter, sampleSize)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[validate-legiscan] Fatal error:', err);
      process.exit(1);
    });
}
