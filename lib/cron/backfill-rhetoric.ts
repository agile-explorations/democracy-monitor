/** Rhetoric backfill helpers for White House + GDELT data. */

import type { BaselineSource, WhArchiveConfig } from '@/lib/data/baselines';
import { storeDocuments } from '@/lib/services/document-store';
import { crossfeedRhetoricToCategories } from '@/lib/services/rhetoric-crossfeed';
import {
  fetchWhiteHouseHistorical,
  fetchWhArchiveHistorical,
  fetchGdeltHistorical,
  GDELT_QUERIES,
} from '@/lib/services/rhetoric-fetcher';
import type { ContentItem } from '@/lib/types';

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
          await crossfeedRhetoricToCategories(items);
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

async function fetchWhDocs(
  weeks: Array<{ start: string; end: string }>,
  whArchive?: WhArchiveConfig,
): Promise<ContentItem[]> {
  const dateFrom = weeks[0].start;
  const dateTo = weeks[weeks.length - 1].end;

  if (whArchive) {
    console.log(`[baseline] Fetching WH archive: ${whArchive.baseUrl}...`);
    return fetchWhArchiveHistorical({ archiveConfig: whArchive, dateFrom, dateTo, delayMs: 500 });
  }

  console.log('[baseline] Fetching White House briefing-room archive...');
  return fetchWhiteHouseHistorical({ dateFrom, dateTo, delayMs: 500 });
}

export async function backfillRhetoric(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  availableSources?: BaselineSource[],
  whArchive?: WhArchiveConfig,
): Promise<{ whDocs: number; gdeltDocs: number }> {
  let whDocs = 0;
  let gdeltDocs = 0;

  const includeWh = !availableSources || availableSources.includes('whitehouse');
  const includeGdelt = !availableSources || availableSources.includes('gdelt');

  console.log('\n[baseline] === Rhetoric Sources ===');

  if (includeWh) {
    if (!dryRun) {
      try {
        const whItems = await fetchWhDocs(weeks, whArchive);
        if (whItems.length > 0) {
          const stored = await storeDocuments(whItems, 'intent');
          await crossfeedRhetoricToCategories(whItems);
          whDocs = stored;
          console.log(`  White House: ${whItems.length} items fetched, ${stored} stored`);
        } else {
          console.log('  White House: 0 items (site may be blocking)');
        }
      } catch (err) {
        console.error('  White House fetch error:', err);
      }
    } else {
      const label = whArchive ? `archive ${whArchive.baseUrl}` : 'briefing-room';
      console.log(`  White House: [dry run] would fetch ${label} pages`);
    }
  } else {
    console.log('[baseline] Skipping White House (unavailable for this period)');
  }

  if (includeGdelt) {
    gdeltDocs = await backfillGdelt(weeks, dryRun);
  } else {
    console.log('[baseline] Skipping GDELT (unavailable for this period)');
  }

  return { whDocs, gdeltDocs };
}
