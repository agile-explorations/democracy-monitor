import { and, eq } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import type { NarrativeLayerData } from '@/lib/types';
import type { ConvergenceSynthesis, StructuralScore } from '@/lib/types/structural';
import { getTopConcerningDocuments } from './layer2-store';
import {
  generateCategoryNarrative,
  generateOverviewNarrative,
  isElevatedStatus,
} from './narrative-generation-service';
import { storeNarratives } from './narrative-store';

const OVERVIEW_CATEGORY_KEY = '_overview';

/** Convert a weekly_aggregates row to NarrativeLayerData. */
export function toNarrativeLayerData(
  cat: { key: string; title: string },
  row: typeof weeklyAggregates.$inferSelect,
): NarrativeLayerData {
  return {
    category: cat.key,
    categoryTitle: cat.title,
    weekOf: String(row.weekOf),
    structuralScore: row.structuralScore,
    structuralDetail: row.structuralDetail as StructuralScore | null,
    aiScore: row.aiScore,
    aiDetail: row.aiDetail as NarrativeLayerData['aiDetail'],
    thematicScore: row.thematicScore,
    thematicDetail: row.thematicDetail as NarrativeLayerData['thematicDetail'],
    convergenceScore: row.convergenceScore,
    convergenceDetail: row.convergenceDetail as ConvergenceSynthesis | null,
  };
}

/** Load layer data for all categories for a given week. */
export async function loadAllLayerData(weekOf: string): Promise<NarrativeLayerData[]> {
  const db = getDb();
  const results: NarrativeLayerData[] = [];

  for (const cat of CATEGORIES) {
    const rows = await db
      .select()
      .from(weeklyAggregates)
      .where(and(eq(weeklyAggregates.category, cat.key), eq(weeklyAggregates.weekOf, weekOf)))
      .limit(1);

    const row = rows[0];
    if (!row) continue;
    results.push(toNarrativeLayerData(cat, row));
  }

  return results;
}

/**
 * Generate and store narratives for all Elevated+ categories in a given week,
 * plus an overview narrative. Called as the final step of the snapshot pipeline.
 */
export async function generateNarrativesForWeek(weekOf: string): Promise<void> {
  if (!isDbAvailable()) {
    console.log('[narratives] Skipping — database not available');
    return;
  }

  console.log(`[narratives] Generating narratives for week ${weekOf}...`);
  const categories = await loadAllLayerData(weekOf);

  if (categories.length === 0) {
    console.log('[narratives] No weekly aggregate data found — skipping');
    return;
  }

  const elevated = categories.filter((c) => isElevatedStatus(c.convergenceDetail));
  console.log(`[narratives] ${elevated.length} of ${categories.length} categories elevated`);

  // Generate per-category narratives for Elevated+ categories
  let generated = 0;
  for (const data of elevated) {
    try {
      const docs = await getTopConcerningDocuments(data.category, weekOf);
      if (docs.length > 0) data.documentContext = docs;
      const result = await generateCategoryNarrative(data);
      await storeNarratives(data.category, weekOf, result);
      generated++;
      console.log(
        `[narratives]   ${data.category}: stored (model=${result.model}, docs=${docs.length})`,
      );
    } catch (err) {
      console.error(`[narratives]   ${data.category}: failed:`, err);
    }
  }

  // Generate overview narrative
  try {
    const overview = await generateOverviewNarrative({ weekOf, categories });
    await storeNarratives(OVERVIEW_CATEGORY_KEY, weekOf, overview);
    console.log(`[narratives]   overview: stored (model=${overview.model})`);
  } catch (err) {
    console.error('[narratives]   overview: failed:', err);
  }

  console.log(`[narratives] Done — ${generated} category + 1 overview narratives generated`);
}
