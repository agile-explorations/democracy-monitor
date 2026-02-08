// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { CATEGORIES } from '@/lib/data/categories';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { fetchCategoryFeeds } from '@/lib/services/feed-fetcher';
import { saveSnapshot } from '@/lib/services/snapshot-store';

loadEnvConfig(process.cwd());

export async function runSnapshots(): Promise<void> {
  const start = Date.now();
  console.log(`[snapshot] Starting snapshot run for ${CATEGORIES.length} categories...`);

  let succeeded = 0;
  let failed = 0;

  for (const cat of CATEGORIES) {
    const catStart = Date.now();
    try {
      console.log(`[snapshot] Fetching feeds for ${cat.key}...`);
      const items = await fetchCategoryFeeds(cat);
      console.log(`[snapshot]   ${items.length} items fetched`);

      if (items.length === 0) {
        console.log(`[snapshot]   Skipping assessment (no items)`);
        continue;
      }

      console.log(`[snapshot] Running assessment for ${cat.key}...`);
      const assessment = await enhancedAssessment(items, cat.key, { skipCache: true });

      console.log(`[snapshot] Running deep analysis for ${cat.key}...`);
      await enrichWithDeepAnalysis(assessment, items);

      console.log(`[snapshot] Saving snapshot for ${cat.key}: ${assessment.status}`);
      await saveSnapshot(assessment);

      succeeded++;
      console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
    } catch (err) {
      failed++;
      console.error(`[snapshot] Error processing ${cat.key}:`, err);
    }
  }

  const elapsed = Date.now() - start;
  console.log(`[snapshot] Complete in ${elapsed}ms: ${succeeded} succeeded, ${failed} failed`);
}

if (require.main === module) {
  runSnapshots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
