// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { CATEGORIES } from '@/lib/data/categories';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import { analyzeContent } from '@/lib/services/assessment-service';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { fetchFederalRegisterHistorical, parseSignalParams } from '@/lib/services/feed-fetcher';
import {
  fetchWhiteHouseHistorical,
  fetchGdeltHistorical,
  GDELT_QUERIES,
} from '@/lib/services/rhetoric-fetcher';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import type { ContentItem } from '@/lib/types';

loadEnvConfig(process.cwd());

const INAUGURATION_DATE = '2025-01-20';

interface BackfillOptions {
  from?: string;
  to?: string;
  category?: string;
  dryRun?: boolean;
  includeRhetoric?: boolean;
}

function getWeekRanges(from: string, to: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const current = new Date(from);
  const endDate = new Date(to);

  while (current <= endDate) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > endDate ? endDate : weekEnd;

    ranges.push({
      start: current.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0],
    });

    current.setDate(current.getDate() + 7);
  }

  return ranges;
}

async function backfillCategory(
  categoryKey: string,
  signals: Array<{ url: string; type: string }>,
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<{ docs: number; snapshots: number; apiCalls: number }> {
  let totalDocs = 0;
  let totalSnapshots = 0;
  let apiCalls = 0;

  // Only process federal_register signals (RSS/HTML are ephemeral)
  const frSignals = signals.filter((s) => s.type === 'federal_register');

  if (frSignals.length === 0) {
    console.log(`  [${categoryKey}] No Federal Register signals — skipping`);
    return { docs: 0, snapshots: 0, apiCalls: 0 };
  }

  for (const week of weeks) {
    const weekItems: ContentItem[] = [];

    for (const signal of frSignals) {
      const params = parseSignalParams(signal.url);
      apiCalls++;

      if (dryRun) continue;

      try {
        const items = await fetchFederalRegisterHistorical({
          ...params,
          dateFrom: week.start,
          dateTo: week.end,
          perPage: 1000,
          delayMs: 200,
        });
        weekItems.push(...items);
      } catch (err) {
        console.error(`  [${categoryKey}] FR fetch error for ${week.start}:`, err);
      }
    }

    if (dryRun) continue;

    // Deduplicate by URL
    const seen = new Set<string>();
    const dedupedItems = weekItems.filter((item) => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    });

    if (dedupedItems.length === 0) continue;

    // Store documents
    const stored = await storeDocuments(dedupedItems, categoryKey);
    totalDocs += stored;

    // Run keyword assessment
    const assessment = analyzeContent(dedupedItems, categoryKey);

    // Build minimal EnhancedAssessment for snapshot storage
    const enhanced: EnhancedAssessment = {
      category: categoryKey,
      status: assessment.status,
      reason: assessment.reason,
      matches: assessment.matches,
      dataCoverage: dedupedItems.length > 0 ? Math.min(dedupedItems.length / 10, 1) : 0,
      evidenceFor: [],
      evidenceAgainst: [],
      howWeCouldBeWrong: [],
      keywordResult: assessment,
      assessedAt: new Date(week.end).toISOString(),
    };

    // Save backdated snapshot
    await saveSnapshot(enhanced, new Date(week.end));
    totalSnapshots++;

    // Per-document scoring
    const docScores = scoreDocumentBatch(dedupedItems, categoryKey);
    await storeDocumentScores(docScores);

    console.log(
      `  [${categoryKey}] ${week.start} → ${week.end}: ${dedupedItems.length} docs, ${docScores.length} scored, status=${assessment.status}`,
    );

    await sleep(500);
  }

  return { docs: totalDocs, snapshots: totalSnapshots, apiCalls };
}

async function backfillRhetoric(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<{ whDocs: number; gdeltDocs: number }> {
  let whDocs = 0;
  let gdeltDocs = 0;

  console.log('\n[backfill] === Rhetoric Sources ===');

  // White House briefing room — fetch entire archive at once
  // (paginated scrape, dates are filtered inside)
  console.log('[backfill] Fetching White House briefing-room archive...');
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

  // GDELT — fetch per week per query
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

  return { whDocs, gdeltDocs };
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || new Date().toISOString().split('T')[0];
  const dryRun = options.dryRun || false;
  const includeRhetoric = options.includeRhetoric !== false; // default true

  console.log(`[backfill] ${dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);

  const weeks = getWeekRanges(from, to);
  console.log(`[backfill] ${weeks.length} weeks to process`);

  const categoriesToProcess = options.category
    ? CATEGORIES.filter((c) => c.key === options.category)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    console.error(`[backfill] Category "${options.category}" not found`);
    process.exit(1);
  }

  console.log(`[backfill] ${categoriesToProcess.length} categories to process`);

  let totalDocs = 0;
  let totalSnapshots = 0;
  let totalApiCalls = 0;

  for (const cat of categoriesToProcess) {
    console.log(`\n[backfill] === ${cat.key} (${cat.signals.length} signals) ===`);
    const result = await backfillCategory(cat.key, cat.signals, weeks, dryRun);
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
    totalApiCalls += result.apiCalls;
  }

  // Rhetoric backfill
  if (includeRhetoric && !options.category) {
    const rhetoric = await backfillRhetoric(weeks, dryRun);
    totalDocs += rhetoric.whDocs + rhetoric.gdeltDocs;
  }

  console.log(`\n[backfill] === Summary ===`);
  console.log(`  API calls: ${dryRun ? `~${totalApiCalls} (estimated)` : totalApiCalls}`);
  console.log(`  Documents stored: ${totalDocs}`);
  console.log(`  Snapshots saved: ${totalSnapshots}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':
        options.from = args[++i];
        break;
      case '--to':
        options.to = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-rhetoric':
        options.includeRhetoric = false;
        break;
    }
  }

  runBackfill(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
