// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { CATEGORIES } from '@/lib/data/categories';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { fetchCategoryFeeds } from '@/lib/services/feed-fetcher';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { saveIntentSnapshot } from '@/lib/services/intent-snapshot-store';
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

      storeDocuments(items, cat.key).catch((err) =>
        console.error(`[snapshot] RAG store failed for ${cat.key}:`, err),
      );

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

      // Per-document scoring
      const docScores = scoreDocumentBatch(items, cat.key);
      storeDocumentScores(docScores).catch((err) =>
        console.error(`[snapshot] Score storage failed for ${cat.key}:`, err),
      );
      console.log(`[snapshot]   Scored ${docScores.length} documents`);

      succeeded++;
      console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
    } catch (err) {
      failed++;
      console.error(`[snapshot] Error processing ${cat.key}:`, err);
    }
  }

  // Store rhetoric sources for RAG
  console.log('[snapshot] Fetching rhetoric sources for RAG storage...');
  try {
    const statements = await fetchAllRhetoricSources();
    const contentItems = statementsToContentItems(statements);
    const stored = await storeDocuments(contentItems, 'intent');
    await embedUnprocessedDocuments(50);
    console.log(`[snapshot] Stored ${stored} rhetoric documents`);

    // Run intent assessment after rhetoric docs are stored
    console.log('[snapshot] Running intent assessment...');
    try {
      const intentResult = await enhancedIntentAssessment(statements, { skipCache: true });
      await saveIntentSnapshot(intentResult);
      console.log(`[snapshot] Intent assessment saved: ${intentResult.overall}`);
    } catch (intentErr) {
      console.error('[snapshot] Intent assessment failed:', intentErr);
    }
  } catch (err) {
    console.error('[snapshot] Rhetoric RAG storage failed:', err);
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
