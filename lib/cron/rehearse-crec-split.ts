/**
 * CREC split rehearsal (#704) — LOCAL, read-only vs the corpus; fetches
 * granule HTML from GovInfo (keyed, free) for the structured-mode comparison.
 *
 * For a sample of stored CREC documents: parse stored (flattened) text AND
 * freshly fetched structure-preserved text, measure boundary agreement, and
 * report unit/eligibility/routing yields — the inputs to the binding
 * three-numbers precheck.
 *
 * Usage: pnpm crec:rehearse-split [--sample N] [--min-kb N]
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import {
  isMultiUnitGranule,
  splitFlattenedGranule,
  splitStructuredGranule,
} from '@/lib/services/crec-splitter';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';

interface SampleRow {
  id: number;
  title: string;
  len: number;
  content: string;
  granule_id: string | null;
}

/** stripHtml, but whitespace collapse preserves line boundaries. */
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

function normalizeHeading(h: string): string {
  return h.replace(/[^A-Z0-9]/g, '');
}

async function fetchStructured(granuleId: string, apiKey: string): Promise<string | null> {
  const packageId = granuleId.split('-').slice(0, 4).join('-');
  const url = `${GOVINFO_API_BASE}/packages/${packageId}/granules/${granuleId}/htm?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return stripHtmlPreserveLines(await res.text());
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) throw new Error('GOVINFO_API_KEY not configured');
  const args = process.argv.slice(2);
  const sampleN = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 40;
  const minKb = args.includes('--min-kb') ? Number(args[args.indexOf('--min-kb') + 1]) : 100;

  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = (
    await db.execute(sql`
      SELECT id, title, length(content) AS len, content, metadata->>'granuleId' AS granule_id
      FROM documents
      WHERE source_origin = 'crec' AND length(content) > ${minKb * 1024}
        AND metadata->>'granuleId' IS NOT NULL
      ORDER BY md5(id::text) LIMIT ${sampleN}`)
  ).rows as unknown as SampleRow[];
  console.log(`[rehearse] sample: ${rows.length} stored CREC docs > ${minKb}KB`);

  let sumStructUnits = 0;
  let sumFlatUnits = 0;
  let agreeNum = 0;
  let agreeDen = 0;
  let sumEligible = 0;
  let sumRouted = 0;
  let fetched = 0;
  let sampleKb = 0;
  let multiUnit = 0;
  for (const r of rows) {
    await sleep(400);
    const structured = await fetchStructured(r.granule_id as string, apiKey);
    const flatUnits = splitFlattenedGranule(r.content);
    sumFlatUnits += flatUnits.length;
    sampleKb += r.len / 1024;
    if (!structured) {
      console.log(`  doc ${r.id}: FETCH MISS (flattened units: ${flatUnits.length})`);
      continue;
    }
    fetched++;
    const structUnits = splitStructuredGranule(structured);
    if (isMultiUnitGranule(structUnits)) multiUnit++;
    sumStructUnits += structUnits.length;
    const structSet = new Set(structUnits.map((u) => normalizeHeading(u.heading)));
    const flatSet = new Set(flatUnits.map((u) => normalizeHeading(u.heading)));
    for (const h of structSet) if (flatSet.has(h)) agreeNum++;
    agreeDen += structSet.size;
    const eligible = structUnits.filter((u) => u.text.length >= 500);
    sumEligible += eligible.length;
    let routed = 0;
    for (const u of eligible)
      routed += classifyCrecToCategories(u.heading, u.text.slice(0, 6000)).length;
    sumRouted += routed;
    console.log(
      `  doc ${r.id} (${Math.round(r.len / 1024)}KB): structured ${structUnits.length} u / flattened ${flatUnits.length} u | eligible ${eligible.length} | routed ${routed}`,
    );
  }

  console.log('\n=== REHEARSAL SUMMARY ===');
  console.log(`fetched ${fetched}/${rows.length}; sample volume ${Math.round(sampleKb)}KB`);
  console.log(`multi-unit (would split): ${multiUnit}/${fetched}`);
  console.log(`units: structured ${sumStructUnits}, flattened ${sumFlatUnits}`);
  console.log(
    `boundary agreement (flattened finds structured headings): ${agreeDen > 0 ? ((100 * agreeNum) / agreeDen).toFixed(1) : '?'}%`,
  );
  console.log(`eligible units (>=500 chars): ${sumEligible}`);
  console.log(
    `routed rows: ${sumRouted} (${(sumRouted / Math.max(1, sampleKb)).toFixed(3)} rows/KB)`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(process.argv.slice(2), 'Usage: pnpm crec:rehearse-split [--sample N] [--min-kb N]');
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[rehearse] Fatal:', err);
      process.exit(1);
    });
}
