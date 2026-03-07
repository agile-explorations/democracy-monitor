/** Data integrity queries — week anchoring and orphan category checks. */

import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, documentScores, weeklyAggregates, baselines } from '@/lib/db/schema';
import type { DataIntegrityCheck } from './data-validation-service';

const VALID_CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

function buildOrphanCheck(tableName: string, rows: { category: string }[]): DataIntegrityCheck {
  const orphans = rows.map((r) => r.category).filter((c) => !VALID_CATEGORY_KEYS.has(c));
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

  return checks;
}
