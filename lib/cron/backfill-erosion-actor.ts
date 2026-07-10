/**
 * Attribute erosionActor on historical confirmed P2 assessments (#537).
 *
 * Light pass: gpt-4o-mini over stored assessment data (see
 * lib/services/actor-attribution.ts). Writes via UPDATE-by-id — never inserts,
 * never touches assessment fields. Default selects only rows with NULL
 * erosion_actor (idempotent / resumable); --overwrite re-attributes.
 *
 * Usage:
 *   pnpm actor:backfill --dry-run --sample-stratified 100 --output pilot.json
 *   pnpm actor:backfill --from 2025-01-20 --to 2026-07-10
 *   pnpm actor:backfill --baseline biden_2022     # baseline write — user approval required
 */

import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  buildAttributionPrompt,
  parseAttributionResponse,
  stratifiedSample,
  summarizeDistribution,
} from '@/lib/services/actor-attribution';
import type { AttributionCandidate } from '@/lib/services/actor-attribution';
import { mapConcurrent } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const MODEL = 'gpt-4o-mini';
const CONCURRENCY = 4;
const CONTENT_HEAD_CHARS = 1500;

interface Args {
  from?: string;
  to?: string;
  baseline?: string;
  category?: string;
  limit?: number;
  sampleStratified?: number;
  output?: string;
  dryRun: boolean;
  overwrite: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--from':
        args.from = argv[++i];
        break;
      case '--to':
        args.to = argv[++i];
        break;
      case '--baseline':
        args.baseline = argv[++i];
        break;
      case '--category':
        args.category = argv[++i];
        break;
      case '--limit':
        args.limit = parseInt(argv[++i], 10);
        break;
      case '--sample-stratified':
        args.sampleStratified = parseInt(argv[++i], 10);
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--overwrite':
        args.overwrite = true;
        break;
    }
  }
  return args;
}

function resolveRange(args: Args): { from: string; to: string } {
  if (args.baseline) {
    const config = BASELINE_CONFIGS.find((c) => c.id === args.baseline);
    if (!config) throw new Error(`Unknown baseline: ${args.baseline}`);
    return { from: config.from, to: config.to };
  }
  if (args.from && args.to) return { from: args.from, to: args.to };
  throw new Error('Scope required: --baseline <id> or --from/--to (no default scope in prod)');
}

async function loadCandidates(args: Args): Promise<AttributionCandidate[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const { from, to } = resolveRange(args);
  const rows = await db.execute(sql`
    SELECT a.id, a.url, a.category, d.title, a.reasoning,
      a.cited_passages AS "citedPassages", a.erosion_type AS "erosionType",
      a.assessment, left(d.content, ${CONTENT_HEAD_CHARS}) AS "contentHead",
      a.week_of::text AS "weekOf"
    FROM ai_document_assessments a
    JOIN documents d ON d.url = a.url AND d.category = a.category
    WHERE a.pass = 2
      AND a.assessment IN ('potentially_concerning', 'clearly_concerning')
      AND a.week_of >= ${from} AND a.week_of <= ${to}
      ${args.overwrite ? sql`` : sql`AND a.erosion_actor IS NULL`}
      ${args.category ? sql`AND a.category = ${args.category}` : sql``}
    ORDER BY a.id
    ${args.limit ? sql`LIMIT ${args.limit}` : sql``}
  `);
  return rows.rows as unknown as AttributionCandidate[];
}

async function attributeOne(
  candidate: AttributionCandidate,
): Promise<{ candidate: AttributionCandidate; erosionActor: string; rationale: string } | null> {
  const provider = getProvider('openai');
  try {
    const result = await provider.complete(buildAttributionPrompt(candidate), {
      systemPrompt: ATTRIBUTION_SYSTEM_PROMPT,
      temperature: 0,
      model: MODEL,
    });
    const parsed = parseAttributionResponse(result.content);
    if (!parsed) {
      console.warn(`[actor-backfill] unparseable for assessment ${candidate.id}, skipping`);
      return null;
    }
    return { candidate, erosionActor: parsed.erosionActor, rationale: parsed.rationale };
  } catch (err) {
    console.warn(`[actor-backfill] failed for assessment ${candidate.id}:`, (err as Error).message);
    return null;
  }
}

async function main() {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = parseArgs(process.argv.slice(2));

  let candidates = await loadCandidates(args);
  console.log(`[actor-backfill] ${candidates.length} candidate rows in scope`);

  if (args.sampleStratified) {
    candidates = stratifiedSample(candidates, args.sampleStratified);
    console.log(`[actor-backfill] stratified sample: ${candidates.length} rows`);
  }

  const results = (await mapConcurrent(candidates, CONCURRENCY, attributeOne)).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );
  console.log(`[actor-backfill] attributed ${results.length}/${candidates.length}`);

  if (args.output) {
    const report = results.map((r) => ({
      id: r.candidate.id,
      category: r.candidate.category,
      weekOf: r.candidate.weekOf,
      title: r.candidate.title,
      assessment: r.candidate.assessment,
      reasoningSnippet: (r.candidate.reasoning ?? '').slice(0, 200),
      erosionActor: r.erosionActor,
      rationale: r.rationale,
    }));
    const fs = await import('fs');
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
    console.log(`[actor-backfill] report written to ${args.output}`);
  }

  console.log(
    '[actor-backfill] distribution:',
    JSON.stringify(
      summarizeDistribution(
        results.map((r) => ({ category: r.candidate.category, erosionActor: r.erosionActor })),
      ),
      null,
      1,
    ),
  );

  if (args.dryRun) {
    console.log('[actor-backfill] DRY RUN — no writes');
    return;
  }

  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  let written = 0;
  for (const r of results) {
    await db.execute(
      sql`UPDATE ai_document_assessments SET erosion_actor = ${r.erosionActor} WHERE id = ${r.candidate.id}`,
    );
    written++;
    if (written % 500 === 0) console.log(`[actor-backfill] ${written}/${results.length} written`);
  }
  console.log(`[actor-backfill] Done: ${written} rows attributed.`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm actor:backfill [options]

Attribute erosionActor on confirmed P2 assessments via a light gpt-4o-mini pass.
Scope is REQUIRED (--baseline or --from/--to). Baseline scopes are a production
baseline write — get explicit user approval per invocation (see CLAUDE.md).

Options:
  --from <date> --to <date>   Date range (week_of, inclusive)
  --baseline <id>             Baseline period id (e.g. biden_2022)
  --category <key>            Single category
  --limit <n>                 Cap candidate rows
  --sample-stratified <n>     Deterministic stratified sample (with --dry-run for pilots)
  --output <file>             Write per-row JSON report (pilot/audit review)
  --dry-run                   Classify + report, no DB writes
  --overwrite                 Re-attribute rows that already have erosion_actor`,
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[actor-backfill] Fatal:', err);
      process.exit(1);
    });
}
