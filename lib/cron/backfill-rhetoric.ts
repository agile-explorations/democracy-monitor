/** Rhetoric backfill helpers for White House + GDELT data. */

import { storeDocuments } from '@/lib/services/document-store';
import {
  fetchWhiteHouseHistorical,
  fetchGdeltHistorical,
  GDELT_QUERIES,
} from '@/lib/services/rhetoric-fetcher';

export async function backfillGdelt(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<number> {
  let gdeltDocs = 0;
  const totalCalls = weeks.length * GDELT_QUERIES.length;
  let callsDone = 0;

  console.log(`[baseline] Fetching GDELT article data (${totalCalls} calls)...`);
  for (const week of weeks) {
    for (const query of GDELT_QUERIES) {
      if (dryRun) continue;
      try {
        const items = await fetchGdeltHistorical({
          query,
          dateFrom: week.start,
          dateTo: week.end,
          maxRecords: 250,
          delayMs: 3000,
        });
        callsDone++;
        if (items.length > 0) {
          const stored = await storeDocuments(items, 'intent');
          gdeltDocs += stored;
        }
        process.stdout.write(`\r  GDELT: ${callsDone}/${totalCalls} calls, ${gdeltDocs} docs`);
      } catch (err) {
        callsDone++;
        console.error(`  GDELT error for ${week.start} query="${query.slice(0, 30)}...":`, err);
      }
    }
  }
  if (callsDone > 0) console.log('');

  if (dryRun) {
    console.log(`  GDELT: [dry run] ~${totalCalls} API calls`);
  } else {
    console.log(`  GDELT: ${gdeltDocs} total documents stored`);
  }
  return gdeltDocs;
}

export async function backfillRhetoric(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<{ whDocs: number; gdeltDocs: number }> {
  let whDocs = 0;

  console.log('\n[baseline] === Rhetoric Sources ===');
  console.log('[baseline] Fetching White House briefing-room archive...');

  if (!dryRun) {
    try {
      const whItems = await fetchWhiteHouseHistorical({
        dateFrom: weeks[0].start,
        dateTo: weeks[weeks.length - 1].end,
        delayMs: 500,
      });
      if (whItems.length > 0) {
        const stored = await storeDocuments(whItems, 'intent');
        whDocs = stored;
        console.log(`  White House: ${whItems.length} items fetched, ${stored} stored`);
      } else {
        console.log('  White House: 0 items (site may be blocking)');
      }
    } catch (err) {
      console.error('  White House fetch error:', err);
    }
  } else {
    console.log('  White House: [dry run] would fetch archive pages');
  }

  const gdeltDocs = await backfillGdelt(weeks, dryRun);
  return { whDocs, gdeltDocs };
}
