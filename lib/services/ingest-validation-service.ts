/**
 * Ingest validation service — "Did we get the data we expected?"
 *
 * Checks source coverage, content completeness, pagination fitness,
 * FR/GDELT period coverage, and CourtListener opinion coverage.
 *
 * Source-specific queries: ingest-validation-queries.ts
 */

import { eq, sql, and, inArray } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type { Category } from '@/lib/types';
import {
  getPaginationFitness,
  getFrPeriodCoverage,
  getGdeltCrossfeedCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
} from './ingest-validation-queries';
import type { SourcePeriodGap } from './ingest-validation-queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentCoverage {
  category: string;
  sourceOrigin: string;
  count: number;
}

export interface ContentCompleteness {
  sourceType: string;
  total: number;
  nullContent: number;
}

export interface PaginationFitness {
  category: string;
  sourceOrigin: string;
  peakWeeklyCount: number;
}

export interface SourcePeriodCoverage {
  category: string;
  sourceOrigin: string;
  period: string;
  count: number;
}

export interface ClOpinionCoverage {
  docketEntries: number;
  opinionDocuments: number;
  uniqueCases: number;
  casesWithOpinion: number;
  casesWithoutOpinion: number;
}

export interface IngestReport {
  documentCoverage: DocumentCoverage[];
  contentCompleteness: ContentCompleteness[];
  contentCompletenessByOrigin: ContentCompleteness[];
  paginationFitness: PaginationFitness[];
  frPeriodCoverage: SourcePeriodCoverage[];
  gdeltCrossfeedCoverage: SourcePeriodCoverage[];
  sourcePeriodCoverage: SourcePeriodGap[];
  clOpinionCoverage: ClOpinionCoverage | null;
  warnings: string[];
}

/** Source types where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_TYPES = new Set(['Presidential Document', 'congressional_report']);

/** Source origins where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_ORIGINS = new Map([['whitehouse', 'wh']]);

// Re-export query functions and types for consumers
export type { SourcePeriodGap };
export {
  getPaginationFitness,
  getFrPeriodCoverage,
  getGdeltCrossfeedCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
};

// ---------------------------------------------------------------------------
// Queries (document coverage and content completeness)
// ---------------------------------------------------------------------------

export async function getDocumentCoverage(category?: string): Promise<DocumentCoverage[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const catFilter = category ? eq(documents.category, category) : undefined;
  const rows = await db
    .select({
      category: documents.category,
      sourceOrigin: sql<string>`coalesce(${documents.sourceOrigin}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(catFilter)
    .groupBy(documents.category, documents.sourceOrigin)
    .orderBy(documents.category, documents.sourceOrigin);

  return rows.map((r) => ({
    category: r.category,
    sourceOrigin: r.sourceOrigin,
    count: Number(r.count),
  }));
}

export async function getContentCompleteness(category?: string): Promise<ContentCompleteness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const conditions = [sql`${documents.contentType} != 'metadata_only'`];
  if (category) conditions.push(eq(documents.category, category));

  const rows = await db
    .select({
      sourceType: documents.sourceType,
      total: sql<number>`count(*)::int`,
      nullContent: sql<number>`count(*) filter (where ${documents.content} is null)::int`,
    })
    .from(documents)
    .where(and(...conditions))
    .groupBy(documents.sourceType)
    .orderBy(sql`count(*) filter (where ${documents.content} is null) desc`);

  return rows
    .filter((r) => Number(r.nullContent) > 0)
    .map((r) => ({
      sourceType: r.sourceType,
      total: Number(r.total),
      nullContent: Number(r.nullContent),
    }));
}

export async function getContentCompletenessByOrigin(
  category?: string,
): Promise<ContentCompleteness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const origins = [...CONTENT_FIXABLE_ORIGINS.keys()];
  if (origins.length === 0) return [];

  const catFilter = category ? eq(documents.category, category) : undefined;
  const originFilter = inArray(documents.sourceOrigin, origins);

  const rows = await db
    .select({
      sourceType: sql<string>`coalesce(${documents.sourceOrigin}, 'unknown')`,
      total: sql<number>`count(*)::int`,
      nullContent: sql<number>`count(*) filter (where ${documents.content} is null)::int`,
    })
    .from(documents)
    .where(catFilter ? and(catFilter, originFilter) : originFilter)
    .groupBy(documents.sourceOrigin);

  return rows
    .filter((r) => Number(r.nullContent) > 0)
    .map((r) => ({
      sourceType: r.sourceType,
      total: Number(r.total),
      nullContent: Number(r.nullContent),
    }));
}

// ---------------------------------------------------------------------------
// Warning collection
// ---------------------------------------------------------------------------

const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
const CL_PAGINATION_CAP = 900;
const THIN_CATEGORY_THRESHOLD = 500;

function checkFrCoverage(frCoverage: SourcePeriodCoverage[], cats: Category[]): string[] {
  const warnings: string[] = [];
  const frByCat = new Map<string, Set<string>>();
  for (const row of frCoverage) {
    if (!frByCat.has(row.category)) frByCat.set(row.category, new Set());
    frByCat.get(row.category)!.add(row.period);
  }
  for (const cat of cats) {
    const periods = frByCat.get(cat.key);
    if (!periods) {
      warnings.push(`${cat.key} has no FR documents in any period`);
      continue;
    }
    const missing = EXPECTED_PERIODS.filter((p) => !periods.has(p));
    if (missing.length > 0) {
      warnings.push(`${cat.key} missing FR documents in: ${missing.join(', ')}`);
    }
  }
  return warnings;
}

/** Expected start dates for each analysis period. */
const PERIOD_START_DATES: Record<string, string> = {
  trump_2017: '2017-01-20',
  trump_2018: '2018-01-20',
  biden_2021: '2021-01-20',
  biden_2022: '2022-01-20',
  trump_t2: '2025-01-20',
};

/** Days after period start before a source is considered "late". */
const LATE_START_DAYS = 30;

function checkSourcePeriodGaps(coverage: SourcePeriodGap[]): string[] {
  const warnings: string[] = [];

  // Build map: source -> { period -> { count, earliest } }
  const bySource = new Map<string, Map<string, { count: number; earliest: string | null }>>();
  for (const row of coverage) {
    if (row.period === 'other') continue;
    if (!bySource.has(row.sourceOrigin)) bySource.set(row.sourceOrigin, new Map());
    bySource.get(row.sourceOrigin)!.set(row.period, {
      count: row.count,
      earliest: row.earliestDate,
    });
  }

  for (const [source, periods] of bySource) {
    const hasAnyBaseline = EXPECTED_PERIODS.some(
      (p) => p !== 'trump_t2' && (periods.get(p)?.count ?? 0) > 0,
    );
    const t2 = periods.get('trump_t2');

    // Source in baselines but missing from T2
    if (hasAnyBaseline && (!t2 || t2.count === 0)) {
      warnings.push(`${source}: present in baselines but missing from T2`);
    }

    // Source in T2 but started late (>30 days after inauguration)
    if (t2 && t2.count > 0 && t2.earliest) {
      const periodStart = new Date(PERIOD_START_DATES.trump_t2);
      const earliest = new Date(t2.earliest);
      const daysDiff = Math.round(
        (earliest.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysDiff > LATE_START_DAYS) {
        warnings.push(
          `${source}: T2 data starts ${t2.earliest} (${daysDiff} days after inauguration)`,
        );
      }
    }

    // Large volume asymmetry across periods (baseline vs baseline)
    const baselinePeriods = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018'];
    const baselineCounts = baselinePeriods
      .map((p) => periods.get(p)?.count ?? 0)
      .filter((c) => c > 0);
    if (baselineCounts.length >= 2) {
      const max = Math.max(...baselineCounts);
      const min = Math.min(...baselineCounts);
      if (max > 10 * min && min > 0) {
        warnings.push(`${source}: >10x volume asymmetry across baselines (${min}–${max})`);
      }
    }
  }

  return warnings;
}

export function collectWarnings(report: IngestReport, categoryFilter?: string): string[] {
  const warnings: string[] = [];
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;

  for (const cc of report.contentCompleteness) {
    if (CONTENT_FIXABLE_TYPES.has(cc.sourceType)) {
      const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
  }

  for (const cc of report.contentCompletenessByOrigin) {
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    if (source) {
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
  }

  for (const pf of report.paginationFitness) {
    if (pf.peakWeeklyCount >= CL_PAGINATION_CAP) {
      warnings.push(
        `${pf.category} CourtListener peak=${pf.peakWeeklyCount} hits pagination cap ${CL_PAGINATION_CAP}`,
      );
    }
  }

  warnings.push(...checkFrCoverage(report.frPeriodCoverage, cats));

  const gdeltCats = new Set(report.gdeltCrossfeedCoverage.map((r) => r.category));
  const docsByCat = new Map<string, number>();
  for (const row of report.documentCoverage) {
    docsByCat.set(row.category, (docsByCat.get(row.category) ?? 0) + row.count);
  }
  const missingGdelt = cats
    .filter((c) => !gdeltCats.has(c.key) && (docsByCat.get(c.key) ?? 0) >= THIN_CATEGORY_THRESHOLD)
    .map((c) => c.key);
  if (missingGdelt.length > 0) {
    warnings.push(`Categories missing GDELT cross-feed: ${missingGdelt.join(', ')}`);
  }

  warnings.push(...checkSourcePeriodGaps(report.sourcePeriodCoverage));

  return warnings;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runIngestValidation(category?: string): Promise<IngestReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const [
    coverage,
    content,
    contentByOrigin,
    pagination,
    frPeriod,
    gdeltCrossfeed,
    sourcePeriod,
    clOpinions,
  ] = await Promise.all([
    getDocumentCoverage(category),
    getContentCompleteness(category),
    getContentCompletenessByOrigin(category),
    getPaginationFitness(category),
    getFrPeriodCoverage(category),
    getGdeltCrossfeedCoverage(category),
    getSourcePeriodCoverage(),
    getClOpinionCoverage(),
  ]);

  const report: IngestReport = {
    documentCoverage: coverage,
    contentCompleteness: content,
    contentCompletenessByOrigin: contentByOrigin,
    paginationFitness: pagination,
    frPeriodCoverage: frPeriod,
    gdeltCrossfeedCoverage: gdeltCrossfeed,
    sourcePeriodCoverage: sourcePeriod,
    clOpinionCoverage: clOpinions,
    warnings: [],
  };
  report.warnings = collectWarnings(report, category);

  return report;
}
