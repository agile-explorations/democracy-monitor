/** Data integrity queries — week anchoring and orphan category checks. */

import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, documentScores, weeklyAggregates, baselines } from '@/lib/db/schema';
import type { DataIntegrityCheck } from './data-validation-service';

const VALID_CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

// `intent` is the presidential-intent pseudo-category: rhetoric/proclamations are
// stored in `documents` under this key for the intent feature, deliberately
// outside the 14 detection categories and excluded from scoring/aggregation
// everywhere (`category != 'intent'`). It is a legitimate value, not an orphan.
const ALLOWED_NON_DETECTION_KEYS = new Set(['intent']);

export function buildOrphanCheck(
  tableName: string,
  rows: { category: string }[],
): DataIntegrityCheck {
  const orphans = rows
    .map((r) => r.category)
    .filter((c) => !VALID_CATEGORY_KEYS.has(c) && !ALLOWED_NON_DETECTION_KEYS.has(c));
  return {
    name: `Orphan categories in ${tableName}`,
    count: orphans.length,
    detail: orphans.length > 0 ? orphans.join(', ') : undefined,
    pass: orphans.length === 0,
  };
}

export async function getDataIntegrityChecks(): Promise<DataIntegrityCheck[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const checks: DataIntegrityCheck[] = [];

  // 1. Non-Monday week_of in weekly_aggregates
  const [nonMonday] = await db
    .select({
      count: sql<number>`count(*) filter (where extract(dow from ${weeklyAggregates.weekOf}::date) != 1)::int`,
    })
    .from(weeklyAggregates);
  checks.push({
    name: 'Non-Monday week_of in weekly_aggregates',
    count: Number(nonMonday.count),
    pass: Number(nonMonday.count) === 0,
  });

  // 2. Orphan categories across tables
  const [docCats, scoreCats, aggCats, baselineCats] = await Promise.all([
    db.selectDistinct({ category: documents.category }).from(documents),
    db.selectDistinct({ category: documentScores.category }).from(documentScores),
    db.selectDistinct({ category: weeklyAggregates.category }).from(weeklyAggregates),
    db.selectDistinct({ category: baselines.category }).from(baselines),
  ]);

  checks.push(
    buildOrphanCheck('documents', docCats),
    buildOrphanCheck('document_scores', scoreCats),
    buildOrphanCheck('weekly_aggregates', aggCats),
    buildOrphanCheck('baselines', baselineCats),
  );

  checks.push(await buildResurrectionCheck(db));

  return checks;
}

/**
 * Retrieval-relevance exclusion invariant (#544): annotated-off-topic docs
 * must have NO derived rows. A non-zero count means some code path selected
 * annotated docs and re-created scores/assessments — find and filter it.
 */
async function buildResurrectionCheck(db: ReturnType<typeof getDb>): Promise<DataIntegrityCheck> {
  const [row] = await db
    .select({
      scores: sql<number>`(
        SELECT count(*) FROM document_scores ds
        JOIN documents d ON d.url = ds.url AND d.category = ds.category
        WHERE d.retrieval_relevant = false
      )::int`,
      assessments: sql<number>`(
        SELECT count(*) FROM ai_document_assessments a
        JOIN documents d ON d.url = a.url AND d.category = a.category
        WHERE d.retrieval_relevant = false
      )::int`,
    })
    .from(sql`(SELECT 1) AS one`);
  const resurrected = Number(row.scores) + Number(row.assessments);
  return {
    name: 'Derived rows for retrieval-excluded docs (#544 invariant)',
    count: resurrected,
    detail:
      resurrected > 0 ? `${row.scores} score rows, ${row.assessments} assessment rows` : undefined,
    pass: resurrected === 0,
  };
}
