/**
 * CLI script to recompute document scores from existing documents in the database.
 * No API calls are made — this only reads from the documents table and writes to document_scores.
 *
 * Usage:
 *   pnpm recompute-scores                       # Recompute all
 *   pnpm recompute-scores --category courts      # Single category
 *   pnpm recompute-scores --from 2025-01-20      # Date range
 *   pnpm recompute-scores --dry-run              # Preview without writing
 *   pnpm recompute-scores --aggregate            # Also recompute weekly aggregates
 */

// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { scoreDocument, storeDocumentScores } from '@/lib/services/document-scorer';
import { computeAllWeeklyAggregates, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import type { DocumentScore } from '@/lib/types/scoring';

loadEnvConfig(process.cwd());

interface RecomputeOptions {
  category?: string;
  from?: string;
  to?: string;
  dryRun?: boolean;
  batchSize?: number;
  aggregate?: boolean;
}

async function recomputeScores(options: RecomputeOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[recompute] DATABASE_URL not configured');
    process.exit(1);
  }

  const db = getDb();
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? 500;

  console.log(`[recompute] ${dryRun ? '(DRY RUN) ' : ''}Starting score recomputation...`);
  if (options.category) console.log(`[recompute] Category filter: ${options.category}`);
  if (options.from) console.log(`[recompute] From: ${options.from}`);
  if (options.to) console.log(`[recompute] To: ${options.to}`);

  // Build query conditions
  const conditions = [];
  if (options.category) conditions.push(eq(documents.category, options.category));
  if (options.from) conditions.push(gte(documents.publishedAt, new Date(options.from)));
  if (options.to) conditions.push(lte(documents.publishedAt, new Date(options.to)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch documents in batches
  let offset = 0;
  let totalScored = 0;
  let totalStored = 0;
  const categoryCounts: Record<string, { scored: number; nonZero: number }> = {};

  while (true) {
    const rows = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(desc(documents.publishedAt))
      .limit(batchSize)
      .offset(offset);

    if (rows.length === 0) break;

    const scores: DocumentScore[] = [];

    for (const doc of rows) {
      const item: ContentItem = {
        title: doc.title,
        summary: doc.content || undefined,
        link: doc.url || undefined,
        pubDate: doc.publishedAt?.toISOString(),
        agency:
          doc.metadata && typeof doc.metadata === 'object' && 'agency' in doc.metadata
            ? (doc.metadata as { agency?: string }).agency
            : undefined,
        type: doc.sourceType,
      };

      const score = scoreDocument(item, doc.category);
      score.documentId = doc.id;
      scores.push(score);

      if (!categoryCounts[doc.category]) {
        categoryCounts[doc.category] = { scored: 0, nonZero: 0 };
      }
      categoryCounts[doc.category].scored++;
      if (score.finalScore > 0) categoryCounts[doc.category].nonZero++;
    }

    totalScored += scores.length;

    if (!dryRun) {
      const stored = await storeDocumentScores(scores);
      totalStored += stored;
    }

    process.stdout.write(
      `\r[recompute] Processed ${totalScored} documents${dryRun ? ' (dry run)' : `, stored ${totalStored}`}`,
    );

    offset += batchSize;
  }

  console.log('');
  console.log('[recompute] === Summary ===');
  console.log(`  Total documents scored: ${totalScored}`);
  if (!dryRun) console.log(`  Total scores stored: ${totalStored}`);

  console.log('  Per category:');
  for (const [cat, counts] of Object.entries(categoryCounts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`    ${cat}: ${counts.scored} scored, ${counts.nonZero} with non-zero score`);
  }

  // Recompute weekly aggregates if requested
  if (options.aggregate && !dryRun) {
    console.log('\n[recompute] Recomputing weekly aggregates...');
    const allAggs = await computeAllWeeklyAggregates({ from: options.from, to: options.to });
    let aggCount = 0;
    for (const [cat, aggs] of Object.entries(allAggs)) {
      for (const agg of aggs) {
        await storeWeeklyAggregate(agg);
        aggCount++;
      }
      console.log(`  ${cat}: ${aggs.length} weekly aggregates`);
    }
    console.log(`  Total weekly aggregates stored: ${aggCount}`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: RecomputeOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
        options.category = args[++i];
        break;
      case '--from':
        options.from = args[++i];
        break;
      case '--to':
        options.to = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--aggregate':
        options.aggregate = true;
        break;
    }
  }

  recomputeScores(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[recompute] Fatal error:', err);
      process.exit(1);
    });
}
