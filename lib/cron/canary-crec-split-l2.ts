/**
 * #704 Path-B canary: measures what L2 review would find in split CREC
 * fragments from old-era blobs — WITHOUT persisting anything. Tests the one
 * unverifiable assumption in the Path-B estimate: do old-era floor-speech
 * fragments P1-flag / P2-confirm at rates comparable to current-term CREC
 * (32% / 62%)?
 *
 * Reads blobs from the LOCAL DB, re-fetches structured granule text from
 * GovInfo, splits, routes, then runs real P1/P2 calls under a hard call cap
 * (expected × 3, #564). Results are printed only.
 *
 * Usage: pnpm crec:canary-l2 [--blobs N] (default 10: 6 Trump-1 + 4 Biden)
 */

import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { configureAiCallBudget, getAiCallCount } from '@/lib/services/ai-call-budget';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import { isMultiUnitGranule, splitStructuredGranule } from '@/lib/services/crec-splitter';
import type { GranuleUnit } from '@/lib/services/crec-splitter';
import { assessPass1, assessPass2 } from '@/lib/services/document-review-assessment-service';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const P1_MODEL = 'gpt-4o-mini';
const P2_MODEL = 'claude-sonnet-4-5-20250929';
/** Per-blob fragment cap keeps one giant day from dominating the sample. */
const MAX_FRAGMENTS_PER_BLOB = 120;

interface BlobRow {
  id: number;
  category: string;
  week_of: string;
  published_at: string;
  len: number;
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

async function sampleBlobs(): Promise<BlobRow[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const pick = async (from: string, to: string, n: number) =>
    (
      await db.execute(sql`
        SELECT id, category, date_trunc('week', published_at)::date AS week_of,
          published_at, length(content) AS len, metadata->>'granuleId' AS granule_id
        FROM documents
        WHERE source_origin = 'crec' AND length(content) > 512000
          AND metadata->>'granuleId' IS NOT NULL
          AND published_at >= ${from} AND published_at < ${to}
        ORDER BY md5(id::text) LIMIT ${n}`)
    ).rows as unknown as BlobRow[];
  const t1 = await pick('2019-01-01', '2021-01-20', 6);
  const biden = await pick('2021-01-20', '2025-01-20', 4);
  return [...t1, ...biden];
}

interface CellTally {
  era: string;
  week: string;
  category: string;
  fragments: number;
  flagged: number;
  confirming: number;
}

async function assessFragments(
  units: Array<{ unit: GranuleUnit; category: string }>,
  blob: BlobRow,
  tally: Map<string, CellTally>,
): Promise<void> {
  const p1 = getProvider('openai');
  const p2 = getProvider('anthropic');
  const era = blob.published_at < '2021-01-20' ? 'trump1' : 'biden';
  for (const { unit, category } of units) {
    const desc = CATEGORIES.find((c) => c.key === category)?.description ?? '';
    const doc: ContentItem = {
      title: unit.heading,
      content: unit.text,
      link: `canary://crec/${blob.granule_id}#${unit.heading.slice(0, 40)}`,
      pubDate: String(blob.published_at),
      type: 'floor_speech',
    } as ContentItem;
    const key = `${era}|${blob.week_of}|${category}`;
    const cell =
      tally.get(key) ??
      ({
        era,
        week: String(blob.week_of).slice(0, 10),
        category,
        fragments: 0,
        flagged: 0,
        confirming: 0,
      } as CellTally);
    tally.set(key, cell);
    cell.fragments++;
    const r1 = await assessPass1(doc, desc, p1, P1_MODEL);
    if (!r1) continue;
    if (!r1.response.relevant) continue;
    cell.flagged++;
    const r2 = await assessPass2(
      doc,
      r1.response.signals ?? [],
      r1.response.erosionType ?? 'unknown',
      desc,
      p2,
      false,
      P2_MODEL,
    );
    if (!r2) continue;
    if (['potentially_concerning', 'clearly_concerning'].includes(r2.response.assessment)) {
      cell.confirming++;
    }
    if (getAiCallCount() % 50 < 2) console.log(`[canary] ${getAiCallCount()} AI calls so far...`);
  }
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) throw new Error('GOVINFO_API_KEY not configured');

  const blobs = await sampleBlobs();
  console.log(`[canary] ${blobs.length} blobs sampled (T1+Biden)`);

  // Split first so the cap is set from the real expected count (#564).
  const work: Array<{ blob: BlobRow; units: Array<{ unit: GranuleUnit; category: string }> }> = [];
  let expectedP1 = 0;
  for (const blob of blobs) {
    await sleep(400);
    const text = await fetchStructured(blob.granule_id, apiKey);
    if (!text) {
      console.log(`  blob ${blob.id}: fetch miss, skipped`);
      continue;
    }
    const units = splitStructuredGranule(text);
    if (!isMultiUnitGranule(units)) continue;
    const routed: Array<{ unit: GranuleUnit; category: string }> = [];
    for (const u of units) {
      if (u.text.length < 500) continue;
      for (const cat of classifyCrecToCategories(u.heading, u.text.slice(0, 6000))) {
        routed.push({ unit: u, category: cat });
      }
    }
    const capped = routed.slice(0, MAX_FRAGMENTS_PER_BLOB);
    expectedP1 += capped.length;
    work.push({ blob, units: capped });
  }
  console.log(`[canary] expected P1 calls: ${expectedP1}; cap = ${expectedP1 * 3}`);
  configureAiCallBudget(expectedP1 * 3);

  const tally = new Map<string, CellTally>();
  for (const w of work) await assessFragments(w.units, w.blob, tally);

  console.log('\n=== CANARY RESULTS (no data persisted) ===');
  let f = 0;
  let fl = 0;
  let cf = 0;
  for (const c of [...tally.values()].sort((a, b) => a.week.localeCompare(b.week))) {
    console.log(
      `${c.era.padEnd(7)} ${c.week} ${c.category.padEnd(22)} fragments ${String(c.fragments).padStart(3)} | P1-flagged ${String(c.flagged).padStart(3)} | P2-confirming ${String(c.confirming).padStart(3)}`,
    );
    f += c.fragments;
    fl += c.flagged;
    cf += c.confirming;
  }
  console.log(
    `\nTOTALS: fragments ${f} | flag rate ${((100 * fl) / Math.max(1, f)).toFixed(1)}% | ` +
      `P2 confirm rate ${((100 * cf) / Math.max(1, fl)).toFixed(1)}% | AI calls ${getAiCallCount()}`,
  );
  console.log('(current-term CREC reference: 32.5% flag, 62% P2 confirm)');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(process.argv.slice(2), 'Usage: pnpm crec:canary-l2');
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[canary] Fatal:', err);
      process.exit(1);
    });
}
