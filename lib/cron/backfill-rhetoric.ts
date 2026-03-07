/** Rhetoric backfill helpers for GDELT data (monitoring period). */

import { storeDocuments } from '@/lib/services/document-store';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import { crossfeedRhetoricToCategories } from '@/lib/services/rhetoric-crossfeed';
import { fetchGdeltHistorical, GDELT_QUERIES } from '@/lib/services/rhetoric-fetcher';

async function backfillGdeltMonitoring(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<number> {
  let gdeltDocs = 0;

  console.log('[backfill] Fetching GDELT article data...');
  for (const week of weeks) {
    for (const query of GDELT_QUERIES) {
      if (dryRun) continue;
      try {
        const items = await fetchGdeltHistorical({
          query,
          dateFrom: week.start,
          dateTo: week.end,
          maxRecords: 250,
          delayMs: 300,
        });
        if (items.length > 0) {
          const stored = await storeDocuments(items, 'intent');
          await crossfeedRhetoricToCategories(items);
          gdeltDocs += stored;
        }
      } catch (err) {
        console.error(`  GDELT error for ${week.start} query="${query.slice(0, 30)}...":`, err);
      }
    }
    if (!dryRun && gdeltDocs > 0) {
      process.stdout.write(`  GDELT ${week.start}: ${gdeltDocs} total stored\r`);
    }
  }
  if (!dryRun) console.log(`\n  GDELT: ${gdeltDocs} total documents stored`);
  else {
    const calls = weeks.length * GDELT_QUERIES.length;
    console.log(`  GDELT: [dry run] would make ~${calls} API calls`);
  }

  return gdeltDocs;
}

export async function backfillRhetoricWithAggregation(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<number> {
  console.log('\n[backfill] === Rhetoric Sources ===');
  const docs = await backfillGdeltMonitoring(weeks, dryRun);

  if (!dryRun) {
    console.log('\n[backfill] === Intent Weekly Aggregation ===');
    for (const week of weeks) {
      try {
        await aggregateAllAreas(week.start);
      } catch (err) {
        console.error(`[backfill] Intent weekly aggregation failed for ${week.start}:`, err);
      }
    }
    console.log(`[backfill] Intent weekly aggregation complete for ${weeks.length} weeks`);
  }

  return docs;
}
