/**
 * CLI: pnpm validate:graph [--json]
 *
 * The derivation-graph edge contract (#569). Checks the invariants of every
 * edge in documents → scores → aggregates → assessments → enrichment →
 * narratives (see "Derivation graph" in docs/PROJECT_KNOWLEDGE.md). Each
 * invariant is named, bidirectional where applicable, and fails loudly:
 * nonzero exit when any error-severity invariant is violated.
 *
 * Invariants:
 *   G1a  every eligible document has a score row
 *   G1b  no score row points at an ineligible or absent document
 *   G2a  every completed category-week has an aggregate row
 *   G2b  aggregate document_count equals the week's score-row count
 *   G2c  every aggregate row is Monday-anchored (no off-grid week_of)
 *   G3   enrichment freshness: enriched_at >= newest assessment in the week
 *   G3L  (warn) legacy weeks (enriched_at never stamped) holding assessments —
 *        enforced forward-only; shrinks as repairs re-enrich those weeks
 *   G4   recent narratives not older than their week's assessment data
 *   G4h  (warn) historical narratives older than their week's assessment
 *        data — regeneration is a per-repair owner decision, so this
 *        reports but never fails the run
 *   G5   no assessment rows for absent or retrieval-excluded documents
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const GRID_START = '2017-01-20';

export interface GraphInvariantResult {
  id: string;
  description: string;
  violations: number;
  pass: boolean;
  /** 'error' fails the run; 'warn' is reported for visibility only. */
  severity: 'error' | 'warn';
  sample?: string[];
}

/**
 * Error-tier narrative freshness covers only the most recent completed week:
 * staleness there right after a snapshot means the cron generated narratives
 * before assessing (an ordering defect), or a repair touched the week
 * visitors are actually reading. Older staleness is the G4h warning — mid-
 * week repairs routinely extend past weeks' assessment sets, and whether to
 * regenerate those narratives is a per-repair owner decision.
 */
const NARRATIVE_FRESHNESS_WEEKS = 1;

type Row = Record<string, unknown>;

async function q(text: ReturnType<typeof sql>): Promise<Row[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const res = await db.execute(text);
  return res.rows as Row[];
}

const ELIGIBLE_DOC = sql`d.content_type != 'metadata_only'
  AND d.content IS NOT NULL AND length(d.content) >= 100
  AND d.retrieval_relevant IS NOT FALSE`;

async function g1aEligibleDocsScored(): Promise<GraphInvariantResult> {
  const rows = await q(sql`
    SELECT d.category, count(*) AS n
    FROM documents d
    LEFT JOIN document_scores s ON s.url = d.url AND s.category = d.category
    WHERE s.url IS NULL AND ${ELIGIBLE_DOC}
      AND d.published_at >= ${GRID_START}
      AND d.category IN (SELECT DISTINCT category FROM weekly_aggregates)
    GROUP BY d.category ORDER BY n DESC`);
  const total = rows.reduce((acc, r) => acc + Number(r.n), 0);
  return {
    id: 'G1a',
    severity: 'error',
    description: 'every eligible document has a score row',
    violations: total,
    pass: total === 0,
    sample: rows.slice(0, 3).map((r) => `${r.category}: ${r.n}`),
  };
}

async function g1bNoOrphanOrStubScores(): Promise<GraphInvariantResult> {
  const rows = await q(sql`
    SELECT count(*) AS n
    FROM document_scores s
    LEFT JOIN documents d ON d.url = s.url AND d.category = s.category
    WHERE d.url IS NULL OR NOT (${ELIGIBLE_DOC})`);
  const total = Number(rows[0]?.n ?? 0);
  return {
    id: 'G1b',
    severity: 'error',
    description: 'no score row for an ineligible or absent document',
    violations: total,
    pass: total === 0,
  };
}

async function g2aAggregatePresence(): Promise<GraphInvariantResult> {
  const rows = await q(sql`
    WITH cats AS (SELECT DISTINCT category FROM weekly_aggregates),
    weeks AS (
      -- Aggregates anchor on Mondays; the first stored week is the Monday
      -- after the 2017 inauguration.
      SELECT generate_series(date_trunc('week', ${GRID_START}::date + interval '6 days')::date,
        date_trunc('week', now())::date - 7, '7 days'::interval)::date AS w
    )
    SELECT c.category, count(*) AS n
    FROM cats c CROSS JOIN weeks w
    WHERE NOT EXISTS (
      SELECT 1 FROM weekly_aggregates wa WHERE wa.category = c.category AND wa.week_of = w.w
    )
    GROUP BY c.category ORDER BY n DESC`);
  const total = rows.reduce((acc, r) => acc + Number(r.n), 0);
  return {
    id: 'G2a',
    severity: 'error',
    description: 'every completed category-week has an aggregate row',
    violations: total,
    pass: total === 0,
    sample: rows.slice(0, 3).map((r) => `${r.category}: ${r.n} missing weeks`),
  };
}

async function g2cMondayAnchors(): Promise<GraphInvariantResult> {
  // Off-grid rows duplicate real weeks and double-count in scoped scans, but
  // pass G2a (which only checks presence on the Monday grid).
  const rows = await q(sql`
    SELECT count(*) AS total,
      (array_agg(category || ' ' || week_of::text))[1:3] AS sample
    FROM weekly_aggregates WHERE extract(dow FROM week_of) != 1`);
  const total = Number(rows[0]?.total ?? 0);
  return {
    id: 'G2c',
    severity: 'error',
    description: 'every aggregate row is Monday-anchored',
    violations: total,
    pass: total === 0,
    sample: (rows[0]?.sample ?? []) as string[],
  };
}

async function g2bCountParity(): Promise<GraphInvariantResult> {
  const rows = await q(sql`
    SELECT wa.category, wa.week_of::text AS w, wa.document_count AS agg_count, s.n AS score_count
    FROM weekly_aggregates wa
    JOIN LATERAL (
      SELECT count(*) AS n FROM document_scores ds
      WHERE ds.category = wa.category
        AND ds.week_of >= wa.week_of AND ds.week_of < wa.week_of + 7
    ) s ON true
    WHERE wa.document_count != s.n
    LIMIT 500`);
  return {
    id: 'G2b',
    severity: 'error',
    description: 'aggregate document_count equals score-row count for the week',
    violations: rows.length,
    pass: rows.length === 0,
    sample: rows
      .slice(0, 3)
      .map((r) => `${r.category} ${r.w}: agg=${r.agg_count} scores=${r.score_count}`),
  };
}

async function g3EnrichmentFreshness(legacy: boolean): Promise<GraphInvariantResult> {
  // enriched_at exists only for rows enriched after #568 shipped. NULL rows
  // are legacy — their true enrichment time is unknowable, so they report as
  // a warning (visibility) rather than an error; the invariant bites on every
  // week enrichment actually touches going forward.
  const nullCheck = legacy ? sql`wa.enriched_at IS NULL` : sql`wa.enriched_at < x.newest`;
  const rows = await q(sql`
    SELECT count(*) AS total,
      (array_agg(wa.category || ' ' || wa.week_of::text))[1:3] AS sample
    FROM weekly_aggregates wa
    JOIN LATERAL (
      SELECT max(a.assessed_at) AS newest FROM ai_document_assessments a
      WHERE a.category = wa.category
        AND a.week_of >= wa.week_of AND a.week_of < wa.week_of + 7
    ) x ON x.newest IS NOT NULL
    WHERE ${nullCheck}`);
  const total = Number(rows[0]?.total ?? 0);
  const sample = (rows[0]?.sample ?? []) as string[];
  return legacy
    ? {
        id: 'G3L',
        severity: 'warn',
        description: 'legacy weeks (no enriched_at stamp) holding assessments',
        violations: total,
        pass: total === 0,
      }
    : {
        id: 'G3',
        severity: 'error',
        description: 'enrichment is newer than the newest assessment touching the week',
        violations: total,
        pass: total === 0,
        sample,
      };
}

async function g4NarrativeFreshness(recent: boolean): Promise<GraphInvariantResult> {
  // A narrative is stale when ASSESSMENT DATA newer than it exists in its
  // week — not when enrichment merely re-ran (a no-op re-enrich bumps
  // enriched_at without changing what the narrative describes). Historical
  // narratives are deliberately not regenerated after repairs (AI spend,
  // per-repair owner decision), so outside the recent window this reports
  // as a warning. Inside the window it is an error: the weekly snapshot
  // assesses before it generates narratives, so a stale recent narrative
  // means the pipeline ran out of order or a repair skipped regeneration.
  const cutoff = sql`date_trunc('week', now())::date - (${NARRATIVE_FRESHNESS_WEEKS * 7})::int`;
  const compare = recent ? sql`n.week_of >= ${cutoff}` : sql`n.week_of < ${cutoff}`;
  const rows = await q(sql`
    SELECT count(*) AS n
    FROM narratives n
    JOIN LATERAL (
      SELECT max(a.assessed_at) AS newest FROM ai_document_assessments a
      WHERE a.category = n.category
        AND a.week_of >= n.week_of AND a.week_of < n.week_of + 7
    ) x ON x.newest IS NOT NULL
    WHERE n.generated_at < x.newest
      AND ${compare}`);
  const total = Number(rows[0]?.n ?? 0);
  return recent
    ? {
        id: 'G4',
        severity: 'error',
        description: "current-week narratives not older than their week's assessments",
        violations: total,
        pass: total === 0,
      }
    : {
        id: 'G4h',
        severity: 'warn',
        description:
          "historical narratives older than their week's assessments (regeneration is owner-decided)",
        violations: total,
        pass: total === 0,
      };
}

async function g5AssessmentReferential(): Promise<GraphInvariantResult> {
  const rows = await q(sql`
    SELECT count(*) AS n
    FROM ai_document_assessments a
    LEFT JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE d.url IS NULL OR d.retrieval_relevant IS FALSE`);
  const total = Number(rows[0]?.n ?? 0);
  return {
    id: 'G5',
    severity: 'error',
    description: 'no assessments for absent or retrieval-excluded documents',
    violations: total,
    pass: total === 0,
  };
}

export async function runGraphValidation(): Promise<GraphInvariantResult[]> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  return [
    await g1aEligibleDocsScored(),
    await g1bNoOrphanOrStubScores(),
    await g2aAggregatePresence(),
    await g2bCountParity(),
    await g2cMondayAnchors(),
    await g3EnrichmentFreshness(false),
    await g3EnrichmentFreshness(true),
    await g4NarrativeFreshness(true),
    await g4NarrativeFreshness(false),
    await g5AssessmentReferential(),
  ];
}

function printResults(results: GraphInvariantResult[]): void {
  console.log('\n=== Derivation-graph contract (validate:graph) ===');
  for (const r of results) {
    const mark = r.pass ? '✓' : r.severity === 'warn' ? '⚠' : '✗';
    console.log(`  ${mark} ${r.id}: ${r.description} — ${r.violations} violations`);
    if (!r.pass && r.sample?.length) {
      for (const s of r.sample) console.log(`      ${s}`);
    }
  }
  const failed = results.filter((r) => !r.pass && r.severity === 'error');
  const warned = results.filter((r) => !r.pass && r.severity === 'warn');
  if (warned.length > 0) {
    console.log(`  ${warned.length} warning(s): ${warned.map((r) => r.id).join(', ')}`);
  }
  console.log(
    failed.length === 0
      ? '  All error-severity invariants hold.'
      : `  ${failed.length} invariant(s) VIOLATED: ${failed.map((r) => r.id).join(', ')}`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm validate:graph [--json]

Checks the derivation-graph edge contract (G1a..G5 — see
docs/PROJECT_KNOWLEDGE.md "Derivation graph"). Exits nonzero when any
invariant is violated.`,
  );
  runGraphValidation()
    .then((results) => {
      if (argv.includes('--json')) console.log(JSON.stringify(results));
      else printResults(results);
      process.exit(results.every((r) => r.pass || r.severity === 'warn') ? 0 : 1);
    })
    .catch((err) => {
      console.error('[validate:graph] Fatal:', err);
      process.exit(1);
    });
}
