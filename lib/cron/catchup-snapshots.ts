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
import { getLatestSnapshot, saveSnapshot } from '@/lib/services/snapshot-store';

loadEnvConfig(process.cwd());

const AI_DELAY_MS = 2000; // Rate-limit between AI calls
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function catchupSnapshots(): Promise<void> {
  const now = new Date();
  console.log(`[catchup] Finding gaps and generating missing snapshots...`);
  let total = 0;

  for (const cat of CATEGORIES) {
    try {
      const latest = await getLatestSnapshot(cat.key);
      if (!latest) {
        console.log(`[catchup] ${cat.key}: no snapshots found, run seed-snapshots first`);
        continue;
      }

      const lastDate = new Date(latest.assessedAt);
      const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / ONE_DAY_MS);

      if (daysSince <= 0) {
        console.log(`[catchup] ${cat.key}: up to date (last: ${latest.assessedAt})`);
        continue;
      }

      console.log(`[catchup] ${cat.key}: ${daysSince} days behind, generating...`);

      // Fetch current feeds (same for all gap days since we can't go back in time)
      const items = await fetchCategoryFeeds(cat);
      if (items.length === 0) {
        console.log(`[catchup] ${cat.key}: no items, skipping`);
        continue;
      }

      storeDocuments(items, cat.key).catch((err) =>
        console.error(`[catchup] RAG store failed for ${cat.key}:`, err),
      );

      for (let d = daysSince; d >= 1; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d + 1);
        date.setHours(6, 0, 0, 0);

        const assessment = await enhancedAssessment(items, cat.key, { skipCache: true });
        await enrichWithDeepAnalysis(assessment, items);
        await saveSnapshot(assessment, date);
        total++;

        console.log(
          `[catchup]   ${cat.key} ${date.toISOString().split('T')[0]}: ${assessment.status}`,
        );
        await sleep(AI_DELAY_MS);
      }
    } catch (err) {
      console.error(`[catchup] ${cat.key}: ERROR`, err);
    }
  }

  // Store rhetoric sources for RAG
  console.log('[catchup] Fetching rhetoric sources for RAG storage...');
  try {
    const statements = await fetchAllRhetoricSources();
    const contentItems = statementsToContentItems(statements);
    const stored = await storeDocuments(contentItems, 'intent');
    await embedUnprocessedDocuments(50);
    console.log(`[catchup] Stored ${stored} rhetoric documents`);
  } catch (err) {
    console.error('[catchup] Rhetoric RAG storage failed:', err);
  }

  console.log(`[catchup] Complete: ${total} snapshots created`);
}

if (require.main === module) {
  catchupSnapshots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[catchup] Fatal error:', err);
      process.exit(1);
    });
}
