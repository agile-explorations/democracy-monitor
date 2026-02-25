import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

type Db = ReturnType<typeof getDb>;

async function printFlagRates(db: Db) {
  const flags = await db.execute(sql`
    WITH baseline_flags AS (
      SELECT
        CASE
          WHEN week_of BETWEEN '2022-01-20' AND '2023-01-19' THEN 'biden_2022'
          WHEN week_of BETWEEN '2021-01-20' AND '2022-01-19' THEN 'biden_2021'
          WHEN week_of BETWEEN '2017-01-20' AND '2018-01-19' THEN 'trump_2017'
          WHEN week_of BETWEEN '2018-01-20' AND '2019-01-19' THEN 'trump_2018'
        END as baseline,
        category,
        ROUND(100.0 * SUM(CASE WHEN assessment IN ('potentially_concerning','clearly_concerning') THEN 1 ELSE 0 END)::numeric / COUNT(*), 2) as flag_pct,
        COUNT(*) as total
      FROM ai_document_assessments
      WHERE pass = 1
      GROUP BY baseline, category
    )
    SELECT
      category,
      MAX(CASE WHEN baseline='biden_2022' THEN flag_pct END) as b22,
      MAX(CASE WHEN baseline='biden_2021' THEN flag_pct END) as b21,
      MAX(CASE WHEN baseline='trump_2017' THEN flag_pct END) as t17,
      MAX(CASE WHEN baseline='trump_2018' THEN flag_pct END) as t18
    FROM baseline_flags
    GROUP BY category
    ORDER BY category
  `);
  console.log('=== PASS 1 FLAG RATES (%) ===');
  console.table(flags.rows);
}

async function printPass2Distribution(db: Db) {
  const p2 = await db.execute(sql`
    WITH baseline_pass2 AS (
      SELECT
        CASE
          WHEN week_of BETWEEN '2022-01-20' AND '2023-01-19' THEN 'biden_2022'
          WHEN week_of BETWEEN '2021-01-20' AND '2022-01-19' THEN 'biden_2021'
          WHEN week_of BETWEEN '2017-01-20' AND '2018-01-19' THEN 'trump_2017'
          WHEN week_of BETWEEN '2018-01-20' AND '2019-01-19' THEN 'trump_2018'
        END as baseline,
        assessment,
        COUNT(*) as cnt
      FROM ai_document_assessments
      WHERE pass = 2
      GROUP BY baseline, assessment
    )
    SELECT
      baseline,
      SUM(cnt) as total_p2,
      SUM(CASE WHEN assessment = 'routine' THEN cnt ELSE 0 END) as routine,
      SUM(CASE WHEN assessment = 'novel_not_concerning' THEN cnt ELSE 0 END) as novel_nc,
      SUM(CASE WHEN assessment = 'potentially_concerning' THEN cnt ELSE 0 END) as pot_conc,
      SUM(CASE WHEN assessment = 'clearly_concerning' THEN cnt ELSE 0 END) as clearly_conc,
      ROUND(100.0 * SUM(CASE WHEN assessment IN ('routine','novel_not_concerning') THEN cnt ELSE 0 END)::numeric / SUM(cnt), 1) as pct_non_concerning
    FROM baseline_pass2
    GROUP BY baseline
    ORDER BY baseline
  `);
  console.log('\n=== PASS 2 ASSESSMENT DISTRIBUTION ===');
  console.table(p2.rows);
}

async function printAuditResults(db: Db) {
  const audit = await db.execute(sql`
    WITH audit_data AS (
      SELECT
        CASE
          WHEN week_of BETWEEN '2022-01-20' AND '2023-01-19' THEN 'biden_2022'
          WHEN week_of BETWEEN '2021-01-20' AND '2022-01-19' THEN 'biden_2021'
          WHEN week_of BETWEEN '2017-01-20' AND '2018-01-19' THEN 'trump_2017'
          WHEN week_of BETWEEN '2018-01-20' AND '2019-01-19' THEN 'trump_2018'
        END as baseline,
        assessment
      FROM ai_document_assessments
      WHERE pass = 2 AND is_audit_sample = true
    )
    SELECT
      baseline,
      COUNT(*) as audit_samples,
      SUM(CASE WHEN assessment IN ('potentially_concerning','clearly_concerning') THEN 1 ELSE 0 END) as caught_by_audit,
      ROUND(100.0 * SUM(CASE WHEN assessment IN ('potentially_concerning','clearly_concerning') THEN 1 ELSE 0 END)::numeric / COUNT(*), 2) as audit_catch_rate
    FROM audit_data
    GROUP BY baseline
    ORDER BY baseline
  `);
  console.log('\n=== AUDIT SAMPLE RESULTS ===');
  console.table(audit.rows);
}

async function printOverallTotals(db: Db) {
  const totals = await db.execute(sql`
    SELECT
      CASE
        WHEN week_of BETWEEN '2022-01-20' AND '2023-01-19' THEN 'biden_2022'
        WHEN week_of BETWEEN '2021-01-20' AND '2022-01-19' THEN 'biden_2021'
        WHEN week_of BETWEEN '2017-01-20' AND '2018-01-19' THEN 'trump_2017'
        WHEN week_of BETWEEN '2018-01-20' AND '2019-01-19' THEN 'trump_2018'
      END as baseline,
      COUNT(*) as total_pass1,
      SUM(CASE WHEN assessment IN ('potentially_concerning','clearly_concerning') THEN 1 ELSE 0 END) as flagged,
      ROUND(100.0 * SUM(CASE WHEN assessment IN ('potentially_concerning','clearly_concerning') THEN 1 ELSE 0 END)::numeric / COUNT(*), 2) as overall_flag_rate
    FROM ai_document_assessments
    WHERE pass = 1
    GROUP BY baseline
    ORDER BY baseline
  `);
  console.log('\n=== OVERALL PASS 1 TOTALS ===');
  console.table(totals.rows);
}

async function main() {
  const db = getDb();
  await printFlagRates(db);
  await printPass2Distribution(db);
  await printAuditResults(db);
  await printOverallTotals(db);
  process.exit(0);
}
main();
