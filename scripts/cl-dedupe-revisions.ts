/**
 * CLI: pnpm cl:dedupe-revisions [--dry-run | --confirm] [--from YYYY-MM-DD]
 *
 * One-time repair for #741: CourtListener revision clusters stored the same
 * opinion twice (same case, category and decision date, different URL —
 * 592 rows on 2026-08-28). Marks the older row of each group superseded
 * (retrieval_relevant=false, counting_scope=false where in scope,
 * metadata.supersededBy) and cascades its score + AI-review rows (the
 * keeper revision carries its own); the document row itself is never
 * deleted. Current term only; baseline-era groups are reported and left
 * alone (owner approval per invocation).
 * Follow with `pnpm pipeline:repair --from <first touched week> --to <last>
 * --expect-flips` so the touched weeks re-aggregate behind the flip gate.
 */

import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  cascadeSupersededDerivedRows,
  markSupersededRevisions,
} from '@/lib/services/opinion-revision-dedup';
import { getWeekOfDate } from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';

interface DuplicateGroup {
  caseId: string;
  category: string;
  day: string;
  urls: number;
}

async function findGroups(from: string): Promise<{ current: DuplicateGroup[]; baseline: number }> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.case_id, d.category, d.published_at::date AS day, count(DISTINCT d.url) AS urls
    FROM documents d
    WHERE d.source_origin = 'courtlistener' AND d.source_type = 'judicial_opinion'
      AND d.case_id IS NOT NULL AND d.retrieval_relevant IS NOT FALSE
    GROUP BY 1, 2, 3 HAVING count(DISTINCT d.url) > 1
    ORDER BY 3, 1, 2`);
  const all = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    caseId: String(r.case_id),
    category: String(r.category),
    day: String(r.day).slice(0, 10),
    urls: Number(r.urls),
  }));
  return {
    current: all.filter((g) => g.day >= from),
    baseline: all.filter((g) => g.day < from).length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm cl:dedupe-revisions [--dry-run | --confirm] [--from YYYY-MM-DD]

Marks superseded CourtListener revision rows (same case/category/decision
day, different URL); keeps the latest-fetched row. Cascades the superseded
row's score + AI-review rows; never deletes document rows.

Options:
  --dry-run       List groups and the rows that would be marked (default)
  --confirm       Apply the marks
  --cascade       Remove score + AI-review rows of already-marked superseded docs
                  (idempotent repair; combine with --confirm to apply)
  --from <date>   Earliest decision day to touch (default 2025-01-20; earlier
                  groups are counted, never touched)`,
  );
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const confirm = args.includes('--confirm');
  if (args.includes('--cascade')) {
    // Repair for rows marked before the marker cascaded derived rows.
    const t = await cascadeSupersededDerivedRows(!confirm);
    console.log(
      `[cl-dedupe] ${confirm ? 'Removed' : 'Would remove'} derived rows of ${t.docs} superseded docs: ${t.scores} score rows, ${t.assessments} AI-review rows`,
    );
    process.exit(0);
  }
  const fromIdx = args.indexOf('--from');
  const from = fromIdx >= 0 ? args[fromIdx + 1] : T2_INAUGURATION;
  if (from < T2_INAUGURATION) {
    console.warn(
      '[cl-dedupe] WARNING: --from includes baseline periods — baseline writes need explicit per-invocation approval',
    );
  }

  const { current, baseline } = await findGroups(from);
  console.log(
    `[cl-dedupe] ${current.length} duplicate groups on/after ${from} (${current.reduce((n, g) => n + g.urls - 1, 0)} extra rows); ${baseline} baseline groups left alone`,
  );

  let marked = 0;
  const weeks = new Map<string, number>();
  for (const g of current) {
    const marks = await markSupersededRevisions(g.caseId, g.category, g.day, undefined, !confirm);
    marked += marks.length;
    const week = getWeekOfDate(g.day);
    weeks.set(`${g.category}|${week}`, (weeks.get(`${g.category}|${week}`) ?? 0) + marks.length);
    if (marks.length > 0) {
      console.log(
        `  ${g.day} ${g.category} ${g.caseId}: ${confirm ? 'marked' : 'would mark'} ${marks.length} → keeper ${marks[0].supersededBy}`,
      );
    }
  }
  const weekList = [...weeks.keys()].map((k) => k.split('|')[1]).sort();
  console.log(
    `[cl-dedupe] ${confirm ? 'Marked' : 'Would mark'} ${marked} rows across ${weeks.size} category-weeks` +
      (weekList.length ? ` (weeks ${weekList[0]} … ${weekList[weekList.length - 1]})` : ''),
  );
  if (confirm && marked > 0) {
    console.log(
      `[cl-dedupe] Next: pnpm pipeline:repair --from ${weekList[0]} --to ${weekList[weekList.length - 1]} --expect-flips`,
    );
  }
  process.exit(0);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[cl-dedupe] Fatal:', err);
    process.exit(1);
  });
}
