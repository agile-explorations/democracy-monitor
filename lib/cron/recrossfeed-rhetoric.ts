/**
 * CLI: pnpm recrossfeed [--dry-run] [--batch-size N]
 *
 * Re-routes existing rhetoric documents (category='intent') to monitoring
 * categories via the rhetoric cross-feed classifier. Useful when new categories
 * are added after the original cross-feed has already run.
 */

import { eq, asc } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import {
  classifyRhetoricToCategories,
  crossfeedRhetoricToCategories,
} from '@/lib/services/rhetoric-crossfeed';
import type { ContentItem } from '@/lib/types';

function tallyCounts(items: ContentItem[], counts: Record<string, number>): void {
  for (const item of items) {
    const cats = classifyRhetoricToCategories(item.title || '', item.summary);
    for (const cat of cats) counts[cat] = (counts[cat] || 0) + 1;
  }
}

function toContentItems(rows: (typeof documents.$inferSelect)[]): ContentItem[] {
  return rows.map((row) => ({
    title: row.title,
    summary: row.content ?? undefined,
    link: row.url ?? undefined,
    pubDate: row.publishedAt?.toISOString(),
    type: row.sourceType,
    sourceOrigin: (row.sourceOrigin as ContentItem['sourceOrigin']) ?? undefined,
  }));
}

async function run(dryRun: boolean, batchSize: number): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  if (!isDbAvailable()) {
    console.error('[recrossfeed] DATABASE_URL not configured');
    process.exit(1);
  }

  const db = getDb();
  const label = dryRun ? '[recrossfeed:dry-run]' : '[recrossfeed]';
  const categoryCounts: Record<string, number> = {};
  let totalRows = 0;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.category, 'intent'))
      .orderBy(asc(documents.id))
      .limit(batchSize)
      .offset(offset);

    if (rows.length === 0) break;
    totalRows += rows.length;

    const items = toContentItems(rows);
    if (!dryRun) await crossfeedRhetoricToCategories(items);
    tallyCounts(items, categoryCounts);

    console.log(`${label} Processed ${totalRows} intent documents so far...`);
    offset += batchSize;
  }

  const catSummary = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  console.log(`\n${label} Done — ${totalRows} intent documents scanned`);
  if (Object.keys(categoryCounts).length > 0) {
    console.log(`${label} Category assignments:\n${catSummary}`);
  } else {
    console.log(`${label} No category matches found`);
  }
}

/* CLI entry */
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bsIdx = args.indexOf('--batch-size');
  const batchSize = bsIdx !== -1 ? parseInt(args[bsIdx + 1], 10) || 500 : 500;

  run(dryRun, batchSize).catch((err) => {
    console.error('[recrossfeed] Fatal:', err);
    process.exit(1);
  });
}
