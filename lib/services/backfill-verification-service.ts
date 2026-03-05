/** Pure query functions for backfill completeness verification. */

import { eq, sql, isNull, and, inArray } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, documentScores, weeklyAggregates, baselines } from '@/lib/db/schema';

export interface DocumentCoverage {
  category: string;
  sourceOrigin: string;
  count: number;
}

export interface StageCompleteness {
  totalDocuments: number;
  missingScores: number;
  missingEmbeddings: number;
  metadataOnlyCount: number;
  totalWeeks: number;
  missingAggregates: number;
}

export interface BaselineCompleteness {
  baselineId: string;
  category: string;
  hasStats: boolean;
}

export interface Layer2PeriodStats {
  period: string;
  label: string;
  totalDocuments: number;
  pass1Assessed: number;
  missingPass1: number;
  pass1Flagged: number;
  pass2Assessed: number;
  missingPass2: number;
  pass2Flagged: number;
  auditSampled: number;
  auditFalseNegatives: number;
}

export type Layer2Completeness = Layer2PeriodStats[];

export interface PaginationFitness {
  category: string;
  sourceOrigin: string;
  peakWeeklyCount: number;
}

export interface ClOpinionCoverage {
  docketEntries: number;
  opinionDocuments: number;
  uniqueCases: number;
  casesWithOpinion: number;
  casesWithoutOpinion: number;
}

export interface SourcePeriodCoverage {
  category: string;
  sourceOrigin: string;
  period: string;
  count: number;
}

export interface ContentCompleteness {
  sourceType: string;
  total: number;
  nullContent: number;
}

/** Source types where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_TYPES = new Set(['Presidential Document', 'congressional_report']);

/** Source origins where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_ORIGINS = new Map([['whitehouse', 'wh']]);

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

/** Content completeness by source_origin (for origins not identifiable by source_type). */
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

const EMPTY_STAGE: StageCompleteness = {
  totalDocuments: 0,
  missingScores: 0,
  missingEmbeddings: 0,
  metadataOnlyCount: 0,
  totalWeeks: 0,
  missingAggregates: 0,
};

async function getAggregateGap(
  db: ReturnType<typeof getDb>,
  category?: string,
): Promise<{ totalWeeks: number; missingAggregates: number }> {
  const scoreCatFilter = category ? eq(documentScores.category, category) : undefined;
  const aggCatFilter = category ? eq(weeklyAggregates.category, category) : undefined;

  const [weekStats] = await db
    .select({
      totalWeeks: sql<number>`count(distinct (${documentScores.category}, ${documentScores.weekOf}))::int`,
    })
    .from(documentScores)
    .where(scoreCatFilter);

  const [aggStats] = await db
    .select({ aggWeeks: sql<number>`count(*)::int` })
    .from(weeklyAggregates)
    .where(aggCatFilter);

  const totalWeeks = Number(weekStats.totalWeeks);
  return {
    totalWeeks,
    missingAggregates: Math.max(0, totalWeeks - Number(aggStats.aggWeeks)),
  };
}

export async function getStageCompleteness(category?: string): Promise<StageCompleteness> {
  if (!isDbAvailable()) return EMPTY_STAGE;
  const db = getDb();
  const catFilter = category ? eq(documents.category, category) : undefined;

  const [docStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      missingEmbeddings: sql<number>`count(*) filter (where ${documents.embeddedAt} is null and ${documents.contentType} != 'metadata_only')::int`,
      metadataOnlyCount: sql<number>`count(*) filter (where ${documents.contentType} = 'metadata_only')::int`,
    })
    .from(documents)
    .where(catFilter);

  const [scoreStats] = await db
    .select({ missingScores: sql<number>`count(*)::int` })
    .from(documents)
    .leftJoin(
      documentScores,
      and(eq(documents.url, documentScores.url), eq(documents.category, documentScores.category)),
    )
    .where(
      and(
        sql`${documents.contentType} != 'metadata_only'`,
        isNull(documentScores.id),
        ...(catFilter ? [catFilter] : []),
      ),
    );

  const aggGap = await getAggregateGap(db, category);

  return {
    totalDocuments: Number(docStats.total),
    missingScores: Number(scoreStats.missingScores),
    missingEmbeddings: Number(docStats.missingEmbeddings),
    metadataOnlyCount: Number(docStats.metadataOnlyCount),
    ...aggGap,
  };
}

export async function getBaselineCompleteness(): Promise<BaselineCompleteness[]> {
  if (!isDbAvailable()) return [];
  const rows = await getDb()
    .select({
      baselineId: baselines.baselineId,
      category: baselines.category,
    })
    .from(baselines)
    .orderBy(baselines.baselineId, baselines.category);

  return rows.map((r) => ({
    baselineId: r.baselineId,
    category: r.category,
    hasStats: true,
  }));
}

// Layer 2 + CL queries live in backfill-verification-layer2.ts; re-exported here for consumers.
export { getLayer2Completeness, getClOpinionCoverage } from './backfill-verification-layer2';
