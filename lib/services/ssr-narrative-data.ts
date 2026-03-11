/**
 * Server-side data fetching for SSR narrative pages.
 *
 * Thin wrappers around existing services, designed for use in getServerSideProps.
 * Each function returns all data needed to render a page, or null if the page
 * should 404 (narrative missing or below quality threshold).
 */

import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import type { ConvergenceSynthesis, EditorialRecord } from '@/lib/types';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { getEditorialRecord, getStoredNarratives } from './narrative-store';

const MIN_NARRATIVE_LENGTH = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryWeekPageData {
  categoryKey: string;
  categoryTitle: string;
  categoryDescription: string;
  weekOf: string;
  narrative: { expert: string; public: string };
  editorial: EditorialRecord;
  convergenceStatus: string | null;
  convergenceScore: number | null;
  convergenceDetail: ConvergenceSynthesis | null;
}

export interface WeeklyElevatedCategory {
  key: string;
  title: string;
  status: string;
}

export interface WeeklyHubPageData {
  weekOf: string;
  overview: { expert: string; public: string };
  overviewEditorial: EditorialRecord;
  termSummary: { expert: string; public: string };
  termSummaryEditorial: EditorialRecord;
  elevatedCategories: WeeklyElevatedCategory[];
}

// ---------------------------------------------------------------------------
// Category-week page
// ---------------------------------------------------------------------------

/** Fetch convergence data for a category-week from weekly_aggregates. */
async function getConvergenceData(
  category: string,
  weekOf: string,
): Promise<{
  status: string | null;
  score: number | null;
  detail: ConvergenceSynthesis | null;
}> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT convergence_score, convergence_detail
    FROM weekly_aggregates
    WHERE category = ${category} AND week_of = ${weekOf}
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row) return { status: null, score: null, detail: null };
  const detail = row.convergence_detail as ConvergenceSynthesis | null;
  return {
    status: detail?.status ?? null,
    score: (row.convergence_score as number) ?? null,
    detail,
  };
}

/**
 * Fetch all data for a category-week SSR page.
 * Returns null if the narrative is missing or below the quality threshold.
 */
export async function getCategoryWeekPageData(
  categoryKey: string,
  weekOf: string,
): Promise<CategoryWeekPageData | null> {
  if (!isDbAvailable()) return null;

  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return null;

  const [narratives, editorial, convergence] = await Promise.all([
    getStoredNarratives(categoryKey, weekOf),
    getEditorialRecord(categoryKey, weekOf),
    getConvergenceData(categoryKey, weekOf),
  ]);

  // Quality gate: must have expert narrative > 500 chars
  if (!narratives.expert || narratives.expert.content.length < MIN_NARRATIVE_LENGTH) {
    return null;
  }

  return {
    categoryKey,
    categoryTitle: category.title,
    categoryDescription: category.description,
    weekOf,
    narrative: {
      expert: narratives.expert.content,
      public: narratives.public?.content ?? '',
    },
    editorial,
    convergenceStatus: convergence.status,
    convergenceScore: convergence.score,
    convergenceDetail: convergence.detail,
  };
}

// ---------------------------------------------------------------------------
// Weekly hub page
// ---------------------------------------------------------------------------

/** Fetch categories with Elevated+ convergence status for a given week. */
async function getElevatedCategories(weekOf: string): Promise<WeeklyElevatedCategory[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT category, convergence_detail->>'status' AS status
    FROM weekly_aggregates
    WHERE week_of = ${weekOf}
      AND convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
    ORDER BY convergence_score DESC NULLS LAST
  `);
  type Row = Record<string, unknown>;
  return (rows.rows as Row[])
    .map((r) => {
      const key = r.category as string;
      const cat = CATEGORIES.find((c) => c.key === key);
      if (!cat) return null;
      return { key, title: cat.title, status: r.status as string };
    })
    .filter((c): c is WeeklyElevatedCategory => c !== null);
}

/**
 * Fetch all data for a weekly hub SSR page.
 * Returns null if either _overview or _term_summary narrative is missing or thin.
 */
export async function getWeeklyHubPageData(weekOf: string): Promise<WeeklyHubPageData | null> {
  if (!isDbAvailable()) return null;

  const [overviewNarr, termNarr, overviewEd, termEd, elevated] = await Promise.all([
    getStoredNarratives(OVERVIEW_CATEGORY, weekOf),
    getStoredNarratives(TERM_SUMMARY_CATEGORY, weekOf),
    getEditorialRecord(OVERVIEW_CATEGORY, weekOf),
    getEditorialRecord(TERM_SUMMARY_CATEGORY, weekOf),
    getElevatedCategories(weekOf),
  ]);

  // Quality gate: both overview and term summary must have substantive expert narrative
  if (
    !overviewNarr.expert ||
    overviewNarr.expert.content.length < MIN_NARRATIVE_LENGTH ||
    !termNarr.expert ||
    termNarr.expert.content.length < MIN_NARRATIVE_LENGTH
  ) {
    return null;
  }

  return {
    weekOf,
    overview: {
      expert: overviewNarr.expert.content,
      public: overviewNarr.public?.content ?? '',
    },
    overviewEditorial: overviewEd,
    termSummary: {
      expert: termNarr.expert.content,
      public: termNarr.public?.content ?? '',
    },
    termSummaryEditorial: termEd,
    elevatedCategories: elevated,
  };
}
