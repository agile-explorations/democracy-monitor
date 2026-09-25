/**
 * CREC speaker restamp (R-CREC-SPEAKERS #928).
 *
 * Stored Record granules carry `speaker` = GovInfo's first listed member even
 * when several members spoke (17% of current-term granules; the ELECTIONS
 * granule of 2026-09-14 opens with Schumer and is stored under Padilla).
 * Applies the ingest rule of #927 to stored rows: where several members are
 * listed OR the text carries several speaker markers, `speaker` becomes NULL
 * and `metadata.speakerAmbiguous = true`. Rows with no member listed at all
 * are scanned too — their `speaker` is already NULL, but the flag is what
 * makes them candidates for the composite fragment build (#929). `metadata.speakers` and
 * `metadata.agency` are untouched (agency feeds the agency-distribution
 * baseline). Nothing derived reads `speaker`, so no repair follows; the rule
 * in crec-fetcher keeps the weekly re-ingest from undoing it.
 *
 * Usage:
 *   pnpm crec:restamp-speakers                      # dry run, current term
 *   pnpm crec:restamp-speakers --confirm            # write, current term
 *   pnpm crec:restamp-speakers --from D --to D      # bound the scope
 *   pnpm crec:restamp-speakers --confirm-baseline   # allow rows before 2025-01-20
 *                                                   # (owner approval per invocation)
 */

import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import type { CrecSpeaker } from '@/lib/services/crec-fetcher';
import { distinctSpeakers } from '@/lib/services/crec-speakers';
import { checkHelp } from '@/lib/utils/cli-help';

const BATCH = 500;

export type RestampReason = 'several members listed' | 'several speakers in the text';

interface RestampRow {
  id: number;
  url: string;
  content: string | null;
  speakers: CrecSpeaker[] | null;
}

interface RestampOptions {
  confirm: boolean;
  confirmBaseline: boolean;
  from: string;
  to?: string;
}

/** Why a stored granule is not attributable to one member, or null when it is. */
export function restampReason(
  content: string | null,
  speakers: readonly CrecSpeaker[] | null,
): RestampReason | null {
  if ((speakers?.length ?? 0) > 1) return 'several members listed';
  if (distinctSpeakers(content ?? '').length > 1) return 'several speakers in the text';
  return null;
}

export function parseRestampArgs(argv: string[]): RestampOptions {
  const opts: RestampOptions = {
    confirm: argv.includes('--confirm'),
    confirmBaseline: argv.includes('--confirm-baseline'),
    from: T2_INAUGURATION,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') opts.from = argv[++i];
    else if (argv[i] === '--to') opts.to = argv[++i];
  }
  for (const d of [opts.from, opts.to]) {
    if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`bad date: ${d}`);
  }
  if (opts.from < T2_INAUGURATION && !opts.confirmBaseline) {
    throw new Error(
      `--from ${opts.from} reaches baseline periods (< ${T2_INAUGURATION}); rerun with --confirm-baseline once approved`,
    );
  }
  return opts;
}

async function fetchBatch(afterId: number, opts: RestampOptions): Promise<RestampRow[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const to = opts.to ? sql`AND published_at <= ${opts.to}::date + interval '1 day'` : sql``;
  const r = await db.execute(sql`
    SELECT id, url, content, metadata->'speakers' AS speakers
    FROM documents
    WHERE source_origin = 'crec' AND parent_id IS NULL
      AND NOT (coalesce(metadata, '{}'::jsonb) ? 'speakerAmbiguous')
      AND published_at >= ${opts.from}::date ${to}
      AND id > ${afterId}
    ORDER BY id
    LIMIT ${BATCH}`);
  return r.rows as unknown as RestampRow[];
}

async function restampIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  await getDb().execute(sql`
    UPDATE documents
    SET speaker = NULL,
        metadata = coalesce(metadata, '{}'::jsonb) || '{"speakerAmbiguous": true}'::jsonb
    WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`);
}

async function main(argv: string[]): Promise<void> {
  const opts = parseRestampArgs(argv);
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const label = opts.confirm ? 'WRITE' : 'DRY RUN';
  console.log(
    `[crec:restamp-speakers] ${label} — scope ${opts.from}..${opts.to ?? 'now'}${opts.confirmBaseline ? ' (baseline rows approved)' : ''}`,
  );
  const byReason: Record<string, number> = {};
  const sampleUrls = new Set<string>();
  let scanned = 0;
  let restamped = 0;
  let afterId = 0;
  for (;;) {
    const rows = await fetchBatch(afterId, opts);
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1].id;
    scanned += rows.length;
    const hit: number[] = [];
    for (const row of rows) {
      const reason = restampReason(row.content, row.speakers);
      if (!reason) continue;
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      hit.push(row.id);
      if (sampleUrls.size < 5) sampleUrls.add(row.url);
    }
    if (opts.confirm) await restampIds(hit);
    restamped += hit.length;
    console.log(`[crec:restamp-speakers]   scanned ${scanned}, flagged ${restamped}`);
  }
  console.log(
    `[crec:restamp-speakers] ${label}: ${restamped} of ${scanned} rows ${opts.confirm ? 'restamped' : 'would be restamped'}`,
  );
  for (const [k, n] of Object.entries(byReason)) console.log(`  ${k}: ${n}`);
  for (const u of sampleUrls) console.log(`  e.g. ${u}`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm crec:restamp-speakers [--confirm] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--confirm-baseline]

Sets documents.speaker = NULL and metadata.speakerAmbiguous = true on Record
granules where several members spoke (#927/#928). Dry run by default; the
current term by default; rows before ${T2_INAUGURATION} only with --confirm-baseline.`,
  );
  const savedDbUrl = process.env.DATABASE_URL;
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
  main(argv)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[crec:restamp-speakers] Fatal:', err);
      process.exit(1);
    });
}
