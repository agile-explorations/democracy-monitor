/**
 * Regenerate specific narratives (category, weekly summary, or the living term summary).
 *
 * Usage:
 *   pnpm narratives:regenerate --week 2026-03-30 --type weekly
 *   pnpm narratives:regenerate --type term
 *   pnpm narratives:regenerate --week 2026-03-30 --type all
 *   pnpm narratives:regenerate --week 2026-03-30 --category civilLiberties
 *   pnpm narratives:regenerate --week 2026-03-30 --type weekly --resend
 *   pnpm narratives:regenerate --from 2026-03-01 --to 2026-03-30 --type weekly
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { narratives } from '@/lib/db/schema';
import type { WeeklySummaryInput } from '@/lib/types';
import { OVERVIEW_CATEGORY } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';

interface Args {
  week: string;
  from?: string;
  to?: string;
  type?: 'weekly' | 'term' | 'all';
  category?: string;
  resend: boolean;
  resendOnly: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm narratives:regenerate [options]

Options:
  --week <YYYY-MM-DD>      Regenerate a single week
  --from <YYYY-MM-DD>      Batch: start date (inclusive)
  --to <YYYY-MM-DD>        Batch: end date (inclusive)
  --type <weekly|term|all>  weekly = weekly summary for the week(s);
                            term = regenerate the living term summary (no --week needed);
                            all = weekly for the week(s), then the living term summary
  --category <key>         Regenerate a specific category narrative
  --resend                 Resend correction email after regenerating weekly summary
  --resend-only            Send correction email for existing weekly summary (no regeneration)`,
  );

  const args: Args = { week: '', resend: false, resendOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--week') args.week = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
    else if (argv[i] === '--type') args.type = argv[++i] as Args['type'];
    else if (argv[i] === '--category') args.category = argv[++i];
    else if (argv[i] === '--resend') args.resend = true;
    else if (argv[i] === '--resend-only') args.resendOnly = true;
  }
  if (args.resendOnly) {
    if (!args.week) {
      console.error('ERROR: --resend-only requires --week');
      process.exit(1);
    }
    return args;
  }
  // The living term summary is week-independent — no --week/--from required.
  if (args.type === 'term') return args;
  if (!args.week && !args.from) {
    console.error('ERROR: --week or --from is required');
    process.exit(1);
  }
  if (!args.type && !args.category) {
    console.error('ERROR: either --type or --category is required');
    process.exit(1);
  }
  return args;
}

async function deleteNarratives(category: string, weekOf: string): Promise<number> {
  const db = getDb();
  const result = await db
    .delete(narratives)
    .where(and(eq(narratives.category, category), eq(narratives.weekOf, weekOf)));
  return result.rowCount ?? 0;
}

async function getWeeksInRange(from: string, to: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ weekOf: narratives.weekOf })
    .from(narratives)
    .where(
      and(
        sql`${narratives.weekOf} >= ${from}::date`,
        sql`${narratives.weekOf} <= ${to}::date`,
        eq(narratives.category, OVERVIEW_CATEGORY),
        eq(narratives.version, 'expert'),
      ),
    );
  return [...new Set(rows.map((r) => String(r.weekOf)))].sort();
}

/** Regenerate the living term summary via the pipeline (recomputes significant weeks). */
async function regenerateLivingTermSummary(): Promise<void> {
  const { regenerateTermSummary } = await import('@/lib/services/narrative-pipeline');
  console.log('[regenerate] Regenerating the living term summary...');
  await regenerateTermSummary();
}

async function main(): Promise<void> {
  if (!isDbAvailable()) {
    console.error('ERROR: DATABASE_URL not configured');
    process.exit(1);
  }

  const args = parseArgs();

  // Resend-only mode: send correction email without regenerating
  if (args.resendOnly) {
    const { sendCorrectionDigest } = await import('@/lib/services/subscriber-service');
    const sent = await sendCorrectionDigest(args.week);
    console.log(`[regenerate] Correction email sent to ${sent} subscribers for week ${args.week}`);
    return;
  }

  const doWeekly = args.type === 'weekly' || args.type === 'all' || !!args.category;
  const doTerm = args.type === 'term' || args.type === 'all';

  if (doWeekly) {
    // Batch mode: loop over all weeks in range
    if (args.from) {
      const to = args.to ?? new Date().toISOString().slice(0, 10);
      const weeks = await getWeeksInRange(args.from, to);
      console.log(`[regenerate] Batch mode: ${weeks.length} weeks from ${args.from} to ${to}`);

      let completed = 0;
      for (const week of weeks) {
        console.log(`\n[regenerate] === Week ${week} (${completed + 1}/${weeks.length}) ===`);
        await regenerateWeek(week, args);
        completed++;
      }
      console.log(`\n[regenerate] Batch complete: ${completed}/${weeks.length} weeks processed`);
    } else if (args.week) {
      await regenerateWeek(args.week, args);
    }
  }

  // Living term summary: regenerated once, after any weekly regenerations.
  if (doTerm) {
    await regenerateLivingTermSummary();
  }
}

async function regenerateWeek(week: string, args: Args): Promise<void> {
  // Lazy imports to avoid loading AI providers until needed
  const { loadAllLayerData, computePreviousWeekFacts, generateCheckedWeeklySummary } =
    await import('@/lib/services/narrative-pipeline');
  const { generateMultiPassNarrative, generateSinglePassNarrative } =
    await import('@/lib/services/narrative-multipass');
  const { buildStableTemplate, isElevatedStatus, needsMultiPass } =
    await import('@/lib/services/narrative-generation-service');
  const { storeMultiPassNarratives, storeNarratives } =
    await import('@/lib/services/narrative-store');
  const { getPreviousWeekNarrative } = await import('@/lib/services/narrative-queries');

  // Load all layer data for the week
  const categories = await loadAllLayerData(week);
  if (categories.length === 0) {
    console.error(`No weekly aggregate data found for ${week} — skipping`);
    return;
  }
  console.log(`[regenerate] Loaded ${categories.length} categories for week ${week}`);

  // Regenerate a specific category
  if (args.category) {
    const data = categories.find((c) => c.category === args.category);
    if (!data) {
      console.error(`Category ${args.category} not found in week ${week} — skipping`);
      return;
    }

    const deleted = await deleteNarratives(args.category, week);
    console.log(`[regenerate] Deleted ${deleted} existing narrative rows for ${args.category}`);

    if (!isElevatedStatus(data.convergenceDetail)) {
      // Stable weeks carry the template narrative; the rows were just deleted,
      // so store it (the pipeline's own path) rather than leave the week empty.
      await storeNarratives(args.category, week, buildStableTemplate(data.categoryTitle, week));
      console.log(`[regenerate] ${args.category} is Stable — stored the template narrative`);
      return;
    }

    if (needsMultiPass(data.convergenceDetail)) {
      const result = await generateMultiPassNarrative(data);
      await storeMultiPassNarratives(args.category, week, result);
      console.log(`[regenerate] ${args.category}: stored 3-pass narrative`);
    } else {
      const result = await generateSinglePassNarrative(data);
      await storeNarratives(args.category, week, result);
      console.log(`[regenerate] ${args.category}: stored single-pass narrative`);
    }
    return;
  }

  // Regenerate the weekly summary
  const deleted = await deleteNarratives(OVERVIEW_CATEGORY, week);
  console.log(`[regenerate] Deleted ${deleted} existing weekly summary rows`);

  // Load existing category narratives
  const db = getDb();
  const catNarRows = await db
    .select({
      category: narratives.category,
      version: narratives.version,
      content: narratives.content,
    })
    .from(narratives)
    .where(
      and(
        eq(narratives.weekOf, week),
        sql`${narratives.category} NOT IN ('_overview', '_term_summary')`,
        sql`${narratives.version} IN ('expert', 'public')`,
      ),
    );

  const categoryNarratives = new Map<string, { expert: string; public: string }>();
  for (const row of catNarRows) {
    const existing = categoryNarratives.get(row.category) ?? { expert: '', public: '' };
    if (row.version === 'expert') existing.expert = row.content;
    if (row.version === 'public') existing.public = row.content;
    categoryNarratives.set(row.category, existing);
  }

  const previousWeekSummary = await getPreviousWeekNarrative(week);
  const failedCategories = categories
    .filter((c) => isElevatedStatus(c.convergenceDetail) && !categoryNarratives.has(c.category))
    .map((c) => c.category);

  const previous = await computePreviousWeekFacts(week);
  const input: WeeklySummaryInput = {
    weekOf: week,
    categories,
    categoryNarratives,
    failedCategories,
    previousWeekSummary,
    previousWeekTotalDocs: previous.totalDocs,
    previousWeekElevatedCount: previous.elevatedCount,
    previousWeekConfirmedCount: previous.confirmedCount,
  };

  const { result, violations } = await generateCheckedWeeklySummary(input);
  await storeMultiPassNarratives(OVERVIEW_CATEGORY, week, result);
  console.log('[regenerate] Weekly summary: stored (3-pass, number-checked)');
  for (const v of violations) console.warn(`[regenerate] NUMBER VIOLATION survived revision: ${v}`);

  if (args.resend) {
    const { sendCorrectionDigest } = await import('@/lib/services/subscriber-service');
    const sent = await sendCorrectionDigest(week);
    console.log(`[regenerate] Correction email sent to ${sent} subscribers`);
  }

  console.log('[regenerate] Done');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  main().catch((err) => {
    console.error('[regenerate] Fatal:', err);
    process.exit(1);
  });
}
