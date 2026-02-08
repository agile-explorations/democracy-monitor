// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { CATEGORIES } from '@/lib/data/categories';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { storeDocuments } from '@/lib/services/document-store';
import { fetchCategoryFeeds } from '@/lib/services/feed-fetcher';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { saveSnapshot } from '@/lib/services/snapshot-store';

loadEnvConfig(process.cwd());

const AI_DELAY_MS = 2000; // Rate-limit between AI calls

function parseArgs(): { days: number } {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 30;
  return { days: isNaN(days) ? 30 : days };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function seedSnapshots(days: number): Promise<void> {
  console.log(
    `[seed-snapshots] Seeding ${days} days of snapshots for ${CATEGORIES.length} categories...`,
  );
  const now = new Date();
  let total = 0;

  for (let d = days; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    date.setHours(6, 0, 0, 0); // Simulate 6 AM UTC run
    const dateStr = date.toISOString().split('T')[0];

    console.log(`[seed-snapshots] Day ${dateStr} (${days - d + 1}/${days + 1}):`);

    for (const cat of CATEGORIES) {
      try {
        console.log(`[seed-snapshots]   ${cat.key}: fetching feeds...`);
        const items = await fetchCategoryFeeds(cat);

        if (items.length === 0) {
          console.log(`[seed-snapshots]   ${cat.key}: no items, skipping`);
          continue;
        }

        storeDocuments(items, cat.key).catch((err) =>
          console.error(`[seed-snapshots] RAG store failed for ${cat.key}:`, err),
        );

        console.log(`[seed-snapshots]   ${cat.key}: running assessment (${items.length} items)...`);
        const assessment = await enhancedAssessment(items, cat.key, { skipCache: true });

        console.log(`[seed-snapshots]   ${cat.key}: running deep analysis...`);
        await enrichWithDeepAnalysis(assessment, items);

        await saveSnapshot(assessment, date);
        total++;
        console.log(`[seed-snapshots]   ${cat.key}: ${assessment.status}`);

        await sleep(AI_DELAY_MS);
      } catch (err) {
        console.error(`[seed-snapshots]   ${cat.key}: ERROR`, err);
      }
    }
  }

  // Store rhetoric sources for RAG
  console.log('[seed-snapshots] Fetching rhetoric sources for RAG storage...');
  try {
    const statements = await fetchAllRhetoricSources();
    const contentItems = statementsToContentItems(statements);
    const stored = await storeDocuments(contentItems, 'intent');
    await embedUnprocessedDocuments(50);
    console.log(`[seed-snapshots] Stored ${stored} rhetoric documents`);
  } catch (err) {
    console.error('[seed-snapshots] Rhetoric RAG storage failed:', err);
  }

  console.log(`[seed-snapshots] Complete: ${total} snapshots created`);
}

if (require.main === module) {
  const { days } = parseArgs();
  seedSnapshots(days)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-snapshots] Fatal error:', err);
      process.exit(1);
    });
}
