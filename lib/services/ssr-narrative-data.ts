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
import type { ConcernAssessment, EditorialRecord } from '@/lib/types';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { getEditorialRecord, getStoredNarratives } from './narrative-store';

const MIN_NARRATIVE_LENGTH = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Adjacent week with enough context for descriptive nav links. */
export interface AdjacentWeek {
  weekOf: string;
  status: string | null;
}

/** Week entry for category archive listing. */
export interface ArchiveWeekEntry {
  weekOf: string;
  status: string | null;
}

export interface CategoryWeekPageData {
  categoryKey: string;
  categoryTitle: string;
  categoryDescription: string;
  categoryExpertDescription: string;
  weekOf: string;
  narrative: { expert: string; public: string };
  editorial: EditorialRecord;
  convergenceStatus: string | null;
  convergenceScore: number | null;
  convergenceDetail: ConcernAssessment | null;
  prevWeek: AdjacentWeek | null;
  nextWeek: AdjacentWeek | null;
  publishedAt: string | null;
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
  prevWeek: AdjacentWeek | null;
  nextWeek: AdjacentWeek | null;
  publishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

/**
 * Get the previous eligible narrative week for a category.
 * "Eligible" = expert narrative > MIN_NARRATIVE_LENGTH chars.
 */
async function getPrevCategoryWeek(category: string, weekOf: string): Promise<AdjacentWeek | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of, wa.convergence_detail->>'status' AS status
    FROM narratives n
    LEFT JOIN weekly_aggregates wa
      ON wa.category = n.category AND wa.week_of = n.week_of
    WHERE n.category = ${category}
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
      AND n.week_of < ${weekOf}
    ORDER BY n.week_of DESC
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row) return null;
  return { weekOf: String(row.week_of).slice(0, 10), status: (row.status as string) ?? null };
}

/** Get the next eligible narrative week for a category. */
async function getNextCategoryWeek(category: string, weekOf: string): Promise<AdjacentWeek | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of, wa.convergence_detail->>'status' AS status
    FROM narratives n
    LEFT JOIN weekly_aggregates wa
      ON wa.category = n.category AND wa.week_of = n.week_of
    WHERE n.category = ${category}
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
      AND n.week_of > ${weekOf}
    ORDER BY n.week_of ASC
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row) return null;
  return { weekOf: String(row.week_of).slice(0, 10), status: (row.status as string) ?? null };
}

/**
 * Get the previous eligible weekly hub page.
 * "Eligible" = both _overview and _term_summary expert narratives > MIN_NARRATIVE_LENGTH.
 */
async function getPrevWeeklyHub(weekOf: string): Promise<AdjacentWeek | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of
    FROM narratives n
    WHERE n.category = ${OVERVIEW_CATEGORY}
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
      AND n.week_of < ${weekOf}
      AND EXISTS (
        SELECT 1 FROM narratives t
        WHERE t.category = ${TERM_SUMMARY_CATEGORY}
          AND t.version = 'expert'
          AND t.week_of = n.week_of
          AND length(t.content) > ${MIN_NARRATIVE_LENGTH}
      )
    ORDER BY n.week_of DESC
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row) return null;
  return { weekOf: String(row.week_of).slice(0, 10), status: null };
}

/** Get the next eligible weekly hub page. */
async function getNextWeeklyHub(weekOf: string): Promise<AdjacentWeek | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of
    FROM narratives n
    WHERE n.category = ${OVERVIEW_CATEGORY}
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
      AND n.week_of > ${weekOf}
      AND EXISTS (
        SELECT 1 FROM narratives t
        WHERE t.category = ${TERM_SUMMARY_CATEGORY}
          AND t.version = 'expert'
          AND t.week_of = n.week_of
          AND length(t.content) > ${MIN_NARRATIVE_LENGTH}
      )
    ORDER BY n.week_of ASC
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row) return null;
  return { weekOf: String(row.week_of).slice(0, 10), status: null };
}

/** Get the generatedAt timestamp for the expert narrative. */
async function getNarrativePublishedAt(category: string, weekOf: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT generated_at FROM narratives
    WHERE category = ${category} AND week_of = ${weekOf} AND version = 'expert'
    LIMIT 1
  `);
  type Row = Record<string, unknown>;
  const row = (rows.rows as Row[])[0];
  if (!row?.generated_at) return null;
  return new Date(row.generated_at as string).toISOString();
}

/**
 * Get all narrative weeks for a category (for archive listing).
 * Returns weeks with substantive expert narratives, most recent first.
 */
export async function getNarrativeWeeksForCategory(
  categoryKey: string,
): Promise<ArchiveWeekEntry[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of, wa.convergence_detail->>'status' AS status
    FROM narratives n
    LEFT JOIN weekly_aggregates wa
      ON wa.category = n.category AND wa.week_of = n.week_of
    WHERE n.category = ${categoryKey}
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
    ORDER BY n.week_of DESC
  `);
  type Row = Record<string, unknown>;
  return (rows.rows as Row[]).map((r) => ({
    weekOf: String(r.week_of).slice(0, 10),
    status: (r.status as string) ?? null,
  }));
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
  detail: ConcernAssessment | null;
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
  const detail = row.convergence_detail as ConcernAssessment | null;
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

  const [narratives, editorial, convergence, prevWeek, nextWeek, publishedAt] = await Promise.all([
    getStoredNarratives(categoryKey, weekOf),
    getEditorialRecord(categoryKey, weekOf),
    getConvergenceData(categoryKey, weekOf),
    getPrevCategoryWeek(categoryKey, weekOf),
    getNextCategoryWeek(categoryKey, weekOf),
    getNarrativePublishedAt(categoryKey, weekOf),
  ]);

  // Quality gate: must have expert narrative > 500 chars
  if (!narratives.expert || narratives.expert.content.length < MIN_NARRATIVE_LENGTH) {
    return null;
  }

  return {
    categoryKey,
    categoryTitle: category.title,
    categoryDescription: category.description,
    categoryExpertDescription: category.expertDescription ?? category.description,
    weekOf,
    narrative: {
      expert: narratives.expert.content,
      public: narratives.public?.content ?? '',
    },
    editorial,
    convergenceStatus: convergence.status,
    convergenceScore: convergence.score,
    convergenceDetail: convergence.detail,
    prevWeek,
    nextWeek,
    publishedAt,
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

  const [overviewNarr, termNarr, overviewEd, termEd, elevated, prevWeek, nextWeek, publishedAt] =
    await Promise.all([
      getStoredNarratives(OVERVIEW_CATEGORY, weekOf),
      getStoredNarratives(TERM_SUMMARY_CATEGORY, weekOf),
      getEditorialRecord(OVERVIEW_CATEGORY, weekOf),
      getEditorialRecord(TERM_SUMMARY_CATEGORY, weekOf),
      getElevatedCategories(weekOf),
      getPrevWeeklyHub(weekOf),
      getNextWeeklyHub(weekOf),
      getNarrativePublishedAt(OVERVIEW_CATEGORY, weekOf),
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
    prevWeek,
    nextWeek,
    publishedAt,
  };
}
