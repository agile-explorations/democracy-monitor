/**
 * #704 Path A: split multi-topic CREC granules into retrieval-grade fragment
 * documents. LOCAL-FIRST: run against the local DB, embed, verify, then
 * promote fragment rows to prod via db:promote (documents WHERE parent_id
 * IS NOT NULL).
 *
 * Fragments are searchable but deliberately outside the counting and L2
 * populations (counting_scope=false, parent_id set — see #704 Path A/B).
 * Parent blob rows are left completely untouched: no counting change, no
 * assessment change, no re-aggregation, no flip risk.
 *
 * Idempotent and resumable: parents that already have children are skipped;
 * fragment inserts are ON CONFLICT DO NOTHING on (url, category).
 *
 * Usage:
 *   pnpm crec:build-fragments              # Dry run: candidate counts only
 *   pnpm crec:build-fragments --confirm    # Fetch, split, insert
 *   pnpm crec:build-fragments --confirm --limit N   # First N parents only
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import { isMultiUnitGranule, splitStructuredGranule } from '@/lib/services/crec-splitter';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const MIN_PARENT_BYTES = 102400;
const MIN_UNIT_CHARS = 500;
const FETCH_POLITENESS_MS = 350;

interface ParentRow {
  id: number;
  url: string;
  published_at: string;
  granule_id: string;
}

function stripHtmlPreserveLines(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchStructured(granuleId: string, apiKey: string): Promise<string | null> {
  const packageId = granuleId.split('-').slice(0, 4).join('-');
  const url = `${GOVINFO_API_BASE}/packages/${packageId}/granules/${granuleId}/htm?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return stripHtmlPreserveLines(await res.text());
}

/** Multi-topic candidates that do not yet have fragment children. */
async function selectParents(limit: number | null): Promise<ParentRow[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (metadata->>'granuleId')
      id, url, published_at, metadata->>'granuleId' AS granule_id
    FROM documents p
    WHERE source_origin = 'crec' AND length(content) > ${MIN_PARENT_BYTES}
      AND metadata->>'granuleId' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM documents c WHERE c.parent_id = p.id)
    ORDER BY metadata->>'granuleId', id
    ${limit ? sql`LIMIT ${limit}` : sql``}`);
  return rows.rows as unknown as ParentRow[];
}

async function insertFragments(parent: ParentRow, structuredText: string): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const units = splitStructuredGranule(structuredText);
  if (!isMultiUnitGranule(units)) return 0;
  let inserted = 0;
  let idx = 0;
  for (const unit of units) {
    idx++;
    if (unit.text.length < MIN_UNIT_CHARS) continue;
    const categories = classifyCrecToCategories(unit.heading, unit.text.slice(0, 6000));
    for (const category of categories) {
      const result = await db.execute(sql`
        INSERT INTO documents (
          source_type, category, title, content, url, published_at,
          source_origin, content_type, parent_id, counting_scope, metadata
        ) VALUES (
          'floor_speech', ${category}, ${unit.heading}, ${unit.text},
          ${`${parent.url}#frag-${idx}`}, ${parent.published_at},
          'crec', 'full_text', ${parent.id}, false,
          ${JSON.stringify({ granuleId: parent.granule_id, fragmentIndex: idx })}::jsonb
        )
        ON CONFLICT (url, category) DO NOTHING`);
      inserted += Number(result.rowCount ?? 0);
    }
  }
  return inserted;
}

async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;
  const apiKey = process.env.GOVINFO_API_KEY;
  if (confirm && !apiKey) throw new Error('GOVINFO_API_KEY not configured');

  const parents = await selectParents(limit);
  console.log(`[frag] ${parents.length} multi-topic candidates without children`);
  if (!confirm) {
    console.log('[frag] Dry run complete. Run with --confirm to fetch/split/insert.');
    return;
  }

  let done = 0;
  let misses = 0;
  let fragments = 0;
  for (const parent of parents) {
    await sleep(FETCH_POLITENESS_MS);
    const text = await fetchStructured(parent.granule_id, apiKey as string);
    if (!text) {
      misses++;
      continue;
    }
    fragments += await insertFragments(parent, text);
    done++;
    if (done % 100 === 0)
      console.log(
        `[frag] ${done}/${parents.length} parents, ${fragments} fragments, ${misses} fetch misses`,
      );
  }
  console.log(
    `[frag] Complete: ${done} parents split, ${fragments} fragment rows inserted, ${misses} fetch misses.`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm crec:build-fragments [--confirm] [--limit N]  (LOCAL-first; prod via db:promote)',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[frag] Fatal:', err);
      process.exit(1);
    });
}
