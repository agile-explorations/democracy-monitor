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
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import { storeLegislativeItems } from '@/lib/services/legislative-dashboard-service';
import { fetchCongressionalRecord } from '@/lib/services/legislative-fetcher';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import {
  computeWeeklyAggregate,
  getWeekOfDate,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import { toDateString } from '@/lib/utils/date-utils';

async function snapshotCategory(cat: (typeof CATEGORIES)[number]): Promise<void> {
  const catStart = Date.now();
  console.log(`[snapshot] Fetching feeds for ${cat.key}...`);
  const items = await fetchCategoryFeeds(cat);
  console.log(`[snapshot]   ${items.length} items fetched`);

  storeDocuments(items, cat.key).catch((err) =>
    console.error(`[snapshot] RAG store failed for ${cat.key}:`, err),
  );

  if (items.length === 0) {
    console.log(`[snapshot]   Skipping assessment (no items)`);
    return;
  }

  console.log(`[snapshot] Running assessment for ${cat.key}...`);
  const assessment = await enhancedAssessment(items, cat.key, { skipCache: true });

  console.log(`[snapshot] Running deep analysis for ${cat.key}...`);
  await enrichWithDeepAnalysis(assessment, items);

  console.log(`[snapshot] Saving snapshot for ${cat.key}: ${assessment.status}`);
  await saveSnapshot(assessment);

  const docScores = scoreDocumentBatch(items, cat.key);
  storeDocumentScores(docScores).catch((err) =>
    console.error(`[snapshot] Score storage failed for ${cat.key}:`, err),
  );
  console.log(`[snapshot]   Scored ${docScores.length} documents`);

  const weekOf = getWeekOfDate();
  computeWeeklyAggregate(cat.key, weekOf)
    .then((agg) => storeWeeklyAggregate(agg))
    .catch((err) => console.error(`[snapshot] Weekly aggregate failed for ${cat.key}:`, err));

  console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
}

export async function runSnapshots(): Promise<void> {
  const start = Date.now();
  console.log(`[snapshot] Starting snapshot run for ${CATEGORIES.length} categories...`);

  let succeeded = 0;
  let failed = 0;

  for (const cat of CATEGORIES) {
    try {
      await snapshotCategory(cat);
      succeeded++;
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

    // Weekly intent aggregation
    aggregateAllAreas().catch((err) =>
      console.error('[snapshot] Intent weekly aggregation failed:', err),
    );
  } catch (err) {
    console.error('[snapshot] Rhetoric RAG storage failed:', err);
  }

  // Fetch legislative tracking data
  console.log('[snapshot] Fetching congressional record data...');
  const today = toDateString(new Date());
  try {
    const legislativeItems = await fetchCongressionalRecord({ dateFrom: today, dateTo: today });
    console.log(`[snapshot] Fetched ${legislativeItems.length} legislative items`);
    await storeLegislativeItems(legislativeItems);
  } catch (err) {
    console.error('[snapshot] Legislative fetch failed:', err);
  }

  const elapsed = Date.now() - start;
  console.log(`[snapshot] Complete in ${elapsed}ms: ${succeeded} succeeded, ${failed} failed`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  runSnapshots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
