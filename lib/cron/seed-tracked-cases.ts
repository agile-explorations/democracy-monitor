/**
 * CLI: pnpm cases:seed [--confirm] [--verify]
 *
 * LOCAL-ONLY seed of tracked_cases (#694): aggregates the case universe from
 * documents (CourtListener stubs + opinions — the only record of case→category
 * routing), joins the locally staged CL bulk tables (search_docket /
 * search_court / search_opinioncluster) for authoritative docket metadata, and
 * upserts one row per case. Prod receives the rows via `pnpm db:promote`,
 * never by running this against prod (the 71M-row staging tables live only in
 * the local DB).
 *
 * Dry-run by default (prints counts). --confirm writes. --verify runs the
 * parity checks only. Cases missing from bulk (filed after the bulk cutoff)
 * keep stub-derived fields with refreshedAt NULL so the weekly refresh
 * self-heals them first.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

/** Availability idiom copied from cl-bulk-staging's isBulkOpinionDbAvailable. */
async function isBulkDocketDbAvailable(): Promise<boolean> {
  try {
    // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
    await getDb().execute(sql`SELECT 1 FROM search_docket LIMIT 1`);
    return true;
  } catch {
    console.warn('[cases:seed] search_docket staging table unavailable');
    return false;
  }
}

/** The universe aggregation + bulk join as one INSERT ... SELECT. */
const SEED_SQL = sql`
  WITH universe AS (
    SELECT
      d.case_id,
      substring(d.case_id FROM 4)::bigint AS docket_id,
      jsonb_agg(DISTINCT d.category) AS categories,
      min(d.published_at)::date AS stub_date_filed,
      min(d.fetched_at) AS first_seen_at,
      max(d.fetched_at) AS last_seen_at,
      (array_agg(d.title ORDER BY (d.source_type = 'judicial_opinion') DESC, d.fetched_at DESC))[1]
        AS stub_case_name,
      (array_agg(d.metadata->>'docketNumber' ORDER BY d.fetched_at DESC)
        FILTER (WHERE d.metadata->>'docketNumber' IS NOT NULL))[1] AS stub_docket_number,
      (array_agg(d.metadata->>'suitNature' ORDER BY d.fetched_at DESC)
        FILTER (WHERE d.metadata->>'suitNature' IS NOT NULL))[1] AS stub_nos,
      (SELECT jsonb_agg(DISTINCT q) FROM (
        SELECT jsonb_array_elements_text(d2.metadata->'clQueries') AS q
        FROM documents d2
        WHERE d2.case_id = d.case_id AND d2.metadata ? 'clQueries'
      ) qq) AS cl_queries
    FROM documents d
    WHERE d.source_origin = 'courtlistener' AND d.case_id LIKE 'cl:%'
    GROUP BY d.case_id
  ),
  latest_cluster AS (
    SELECT DISTINCT ON (c.docket_id) c.docket_id, c.disposition, c.precedential_status,
      c.citation_count
    FROM search_opinioncluster c
    ORDER BY c.docket_id, c.date_filed DESC
  )
  INSERT INTO tracked_cases (
    case_id, docket_id, categories, case_name, court_id, court_name, docket_number,
    nature_of_suit, cause, date_filed, date_terminated, date_last_filing, status,
    cluster_disposition, cluster_precedential, cluster_citation_count, provenance,
    first_seen_at, last_seen_at
  )
  SELECT
    u.case_id,
    u.docket_id,
    u.categories,
    COALESCE(NULLIF(sd.case_name, ''), u.stub_case_name, '(untitled case)'),
    sd.court_id,
    left(ct.short_name, 200),
    left(COALESCE(NULLIF(sd.docket_number, ''), u.stub_docket_number), 100),
    left(COALESCE(NULLIF(sd.nature_of_suit, ''), u.stub_nos), 200),
    left(NULLIF(sd.cause, ''), 200),
    COALESCE(sd.date_filed, u.stub_date_filed),
    sd.date_terminated,
    -- Source typos put filings centuries in the future (e.g. year 3926) and
    -- DESC ordering would pin them to the top of every case list — NULL them.
    CASE WHEN sd.date_last_filing > current_date + 1 THEN NULL ELSE sd.date_last_filing END,
    CASE WHEN sd.date_terminated IS NOT NULL THEN 'terminated' ELSE 'open' END,
    lc.disposition,
    left(lc.precedential_status, 50),
    lc.citation_count,
    COALESCE(u.cl_queries, '[]'::jsonb) || '["stub-seed"]'::jsonb,
    u.first_seen_at,
    u.last_seen_at
  FROM universe u
  LEFT JOIN search_docket sd ON sd.id = u.docket_id
  LEFT JOIN search_court ct ON ct.id = sd.court_id
  LEFT JOIN latest_cluster lc ON lc.docket_id = u.docket_id
  ON CONFLICT (case_id) DO UPDATE SET
    categories = EXCLUDED.categories,
    case_name = EXCLUDED.case_name,
    court_id = EXCLUDED.court_id,
    court_name = EXCLUDED.court_name,
    docket_number = EXCLUDED.docket_number,
    nature_of_suit = EXCLUDED.nature_of_suit,
    cause = EXCLUDED.cause,
    date_filed = EXCLUDED.date_filed,
    date_terminated = EXCLUDED.date_terminated,
    date_last_filing = EXCLUDED.date_last_filing,
    status = EXCLUDED.status,
    cluster_disposition = EXCLUDED.cluster_disposition,
    cluster_precedential = EXCLUDED.cluster_precedential,
    cluster_citation_count = EXCLUDED.cluster_citation_count,
    provenance = EXCLUDED.provenance,
    first_seen_at = EXCLUDED.first_seen_at,
    last_seen_at = EXCLUDED.last_seen_at
`;

async function runVerify(): Promise<boolean> {
  const db = getDb();
  const [universe] = (
    await db.execute(sql`
      SELECT count(DISTINCT case_id) AS n FROM documents
      WHERE source_origin = 'courtlistener' AND case_id LIKE 'cl:%'`)
  ).rows as Array<{ n: string }>;
  const [tracked] = (await db.execute(sql`SELECT count(*) AS n FROM tracked_cases`)).rows as Array<{
    n: string;
  }>;
  const [missing] = (
    await db.execute(sql`
      SELECT count(DISTINCT d.case_id) AS n FROM documents d
      WHERE d.source_origin = 'courtlistener' AND d.case_id LIKE 'cl:%'
        AND NOT EXISTS (SELECT 1 FROM tracked_cases t WHERE t.case_id = d.case_id)`)
  ).rows as Array<{ n: string }>;
  const [bulkMiss] = (
    await db.execute(
      sql`SELECT count(*) AS n FROM tracked_cases WHERE date_filed IS NULL OR court_id IS NULL`,
    )
  ).rows as Array<{ n: string }>;
  const catRows = (
    await db.execute(sql`
      SELECT d.category, count(DISTINCT d.case_id) AS doc_cases,
        (SELECT count(*) FROM tracked_cases t WHERE t.categories @> to_jsonb(ARRAY[d.category])) AS tracked
      FROM documents d
      WHERE d.source_origin = 'courtlistener' AND d.case_id LIKE 'cl:%'
      GROUP BY d.category ORDER BY 1`)
  ).rows as Array<{ category: string; doc_cases: string; tracked: string }>;

  console.log(
    `[cases:seed] universe distinct cases: ${universe.n} | tracked_cases rows: ${tracked.n}`,
  );
  console.log(`[cases:seed] cases missing from tracked_cases: ${missing.n} (must be 0)`);
  console.log(
    `[cases:seed] bulk-miss rows (null date_filed/court): ${bulkMiss.n} (expected small; self-heal via refresh)`,
  );
  let categoriesOk = true;
  for (const row of catRows) {
    const ok = row.doc_cases === row.tracked;
    if (!ok) categoriesOk = false;
    console.log(
      `  ${ok ? '✓' : '✗'} ${row.category}: docs ${row.doc_cases} vs tracked ${row.tracked}`,
    );
  }
  return missing.n === '0' && universe.n === tracked.n && categoriesOk;
}

async function run(confirm: boolean, verifyOnly: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (verifyOnly) {
    const ok = await runVerify();
    if (!ok) process.exitCode = 1;
    return;
  }
  if (!(await isBulkDocketDbAvailable())) {
    throw new Error('Run `pnpm cl:bulk-backfill --load` first (search_docket staging required)');
  }
  if (!confirm) {
    const [u] = (
      await getDb().execute(sql`
        SELECT count(DISTINCT case_id) AS n FROM documents
        WHERE source_origin = 'courtlistener' AND case_id LIKE 'cl:%'`)
    ).rows as Array<{ n: string }>;
    console.log(`[cases:seed] DRY RUN — would seed ${u.n} cases. Pass --confirm to write.`);
    return;
  }
  console.log('[cases:seed] seeding (single INSERT...SELECT; several minutes)...');
  await getDb().execute(SEED_SQL);
  console.log('[cases:seed] seed complete; running verification...');
  const ok = await runVerify();
  if (!ok) {
    console.error('[cases:seed] VERIFICATION FAILED — inspect before promoting');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm cases:seed [--confirm] [--verify]

LOCAL-ONLY tracked_cases seed from documents + staged CL bulk tables.
Dry-run by default; --confirm writes; --verify runs parity checks only.
Prod receives rows via pnpm db:promote.`,
  );
  run(argv.includes('--confirm'), argv.includes('--verify'))
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error('[cases:seed] failed:', err);
      process.exit(1);
    });
}
