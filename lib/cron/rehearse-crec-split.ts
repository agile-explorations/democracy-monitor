/**
 * CREC split rehearsal (#704; composite mode #929) — LOCAL/prod read-only vs
 * the corpus; fetches granule HTML from GovInfo (keyed, free) for the
 * structure-preserved comparison.
 *
 * Topic mode (default): for a sample of large stored CREC documents, parse
 * stored (flattened) text AND freshly fetched structured text, measure
 * boundary agreement, and report unit/eligibility/routing yields.
 *
 * Composite mode (--composite): for a sample of the composite build's
 * candidates (whole-day or multi-speaker granules not yet assessed), report
 * topic units, speaker turns per topic, members matched/unmatched, leaves
 * ≥ MIN_UNIT_CHARS, stored V1 topic fragments that would be superseded, and
 * the fragment rows the fleet would create — the precheck for the S4 runbook.
 *
 * Usage: pnpm crec:rehearse-split [--sample N] [--min-kb N] [--composite]
 */

import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import type { CrecSpeaker } from '@/lib/services/crec-fetcher';
import { compositeCandidateSql, fetchStructuredGranule } from '@/lib/services/crec-fragments';
import { resolveMember, speakerTurns } from '@/lib/services/crec-speakers';
import {
  MIN_UNIT_CHARS,
  isMultiUnitGranule,
  qualifiesComposite,
  splitComposite,
  splitFlattenedGranule,
  splitStructuredGranule,
} from '@/lib/services/crec-splitter';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

interface SampleRow {
  id: number;
  title: string;
  url: string;
  len: number;
  content: string;
  granule_id: string | null;
  speakers: CrecSpeaker[] | null;
}

function normalizeHeading(h: string): string {
  return h.replace(/[^A-Z0-9]/g, '');
}

// eslint-disable-next-line max-lines-per-function
async function rehearseTopics(rows: SampleRow[], apiKey: string): Promise<void> {
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
    const structured = await fetchStructuredGranule(r.granule_id as string, apiKey);
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
    const eligible = structUnits.filter((u) => u.text.length >= MIN_UNIT_CHARS);
    sumEligible += eligible.length;
    let routed = 0;
    for (const u of eligible)
      routed += classifyCrecToCategories(u.heading, u.text.slice(0, 6000)).length;
    sumRouted += routed;
    console.log(
      `  doc ${r.id} (${Math.round(r.len / 1024)}KB): structured ${structUnits.length} u / flattened ${flatUnits.length} u | eligible ${eligible.length} | routed ${routed}`,
    );
  }

  console.log('\n=== REHEARSAL SUMMARY (topic mode) ===');
  console.log(`fetched ${fetched}/${rows.length}; sample volume ${Math.round(sampleKb)}KB`);
  console.log(`multi-unit (would split): ${multiUnit}/${fetched}`);
  console.log(`units: structured ${sumStructUnits}, flattened ${sumFlatUnits}`);
  console.log(
    `boundary agreement (flattened finds structured headings): ${agreeDen > 0 ? ((100 * agreeNum) / agreeDen).toFixed(1) : '?'}%`,
  );
  console.log(`eligible units (>=${MIN_UNIT_CHARS} chars): ${sumEligible}`);
  console.log(
    `routed rows: ${sumRouted} (${(sumRouted / Math.max(1, sampleKb)).toFixed(3)} rows/KB)`,
  );
}

/** Stored V1 topic fragments for a granule, by topic index. */
async function storedTopicFragments(url: string): Promise<Set<number>> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const rows = await getDb().execute(sql`
    SELECT DISTINCT url FROM documents WHERE url LIKE ${`${url}#frag-%`} AND url NOT LIKE '%-s%'`);
  const idx = new Set<number>();
  for (const r of rows.rows as Array<{ url: string }>) {
    const m = /#frag-(\d+)$/.exec(r.url);
    if (m) idx.add(Number(m[1]));
  }
  return idx;
}

// eslint-disable-next-line max-lines-per-function
async function rehearseComposite(rows: SampleRow[], apiKey: string): Promise<void> {
  let fetched = 0;
  let qualifying = 0;
  let topicUnits = 0;
  let leaves = 0;
  let speakerLeaves = 0;
  let matched = 0;
  let unmatched = 0;
  let openingAttributed = 0;
  let openingSegments = 0;
  let wouldSupersede = 0;
  let routedRows = 0;
  for (const r of rows) {
    await sleep(400);
    const structured = await fetchStructuredGranule(r.granule_id as string, apiKey);
    if (!structured) {
      console.log(`  doc ${r.id}: FETCH MISS`);
      continue;
    }
    fetched++;
    const members = r.speakers ?? [];
    const topics = splitStructuredGranule(structured);
    topicUnits += Math.max(topics.length, 1);
    const frags = splitComposite(structured, members, r.title);
    const qualifies = qualifiesComposite(frags);
    if (qualifies) qualifying++;
    const stored = await storedTopicFragments(r.url);
    let routed = 0;
    for (const f of frags) {
      leaves++;
      if (f.splitBySpeaker) speakerLeaves++;
      if (f.speakerSurname) {
        if (f.speaker) matched++;
        else unmatched++;
      } else if (f.splitBySpeaker) {
        openingSegments++;
        if (f.speaker) openingAttributed++;
      }
      if (qualifies) routed += classifyCrecToCategories(f.heading, f.text.slice(0, 6000)).length;
    }
    routedRows += routed;
    const supersede = new Set(frags.filter((f) => f.splitBySpeaker).map((f) => f.topicIndex));
    for (const t of supersede) if (stored.has(t)) wouldSupersede++;
    const turns = speakerTurns(structured).filter((t) => !t.procedural).length;
    console.log(
      `  doc ${r.id} (${Math.round(r.len / 1024)}KB, ${members.length} member(s), ${turns} turn(s)): topics ${topics.length} → leaves ${frags.length} (${frags.filter((f) => f.splitBySpeaker).length} speaker) | routed ${routed}${qualifies ? '' : ' | single leaf — untouched'}`,
    );
    for (const f of frags.filter((x) => x.speakerSurname && !x.speaker))
      console.log(
        `      unmatched marker: ${f.speakerSurname} (members: ${members.map((m) => m.memberName).join('; ') || 'none'})`,
      );
  }

  console.log('\n=== REHEARSAL SUMMARY (composite topic × speaker) ===');
  console.log(`fetched ${fetched}/${rows.length}; qualifying (>1 leaf): ${qualifying}`);
  console.log(`topic units ${topicUnits}; leaves ${leaves} (${speakerLeaves} speaker children)`);
  console.log(`speaker markers resolved to a listed member: ${matched}; unmatched: ${unmatched}`);
  console.log(
    `opening segments attributed to the one unclaimed member: ${openingAttributed}/${openingSegments}`,
  );
  console.log(`stored V1 topic fragments that would be superseded: ${wouldSupersede}`);
  console.log(`fragment rows the fleet would insert for this sample: ${routedRows}`);
  console.log(
    `extrapolate: rows per sampled granule ${(routedRows / Math.max(1, fetched)).toFixed(1)} × candidate count from \`pnpm crec:build-fragments\` (dry run)`,
  );
}

async function main(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) throw new Error('GOVINFO_API_KEY not configured');
  const args = process.argv.slice(2);
  const sampleN = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 40;
  const minKb = args.includes('--min-kb') ? Number(args[args.indexOf('--min-kb') + 1]) : 100;
  const composite = args.includes('--composite');
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : T2_INAUGURATION;

  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const where = composite
    ? compositeCandidateSql(from)
    : sql`source_origin = 'crec' AND length(content) > ${minKb * 1024} AND metadata->>'granuleId' IS NOT NULL`;
  const rows = (
    await db.execute(sql`
      SELECT DISTINCT ON (metadata->>'granuleId')
        id, title, url, length(content) AS len, content,
        metadata->>'granuleId' AS granule_id, metadata->'speakers' AS speakers
      FROM documents
      WHERE ${where}
      ORDER BY metadata->>'granuleId', md5(id::text) LIMIT ${sampleN}`)
  ).rows as unknown as SampleRow[];
  console.log(
    `[rehearse] sample: ${rows.length} stored CREC granules (${composite ? `composite candidates published ≥ ${from}` : `> ${minKb}KB`})`,
  );
  if (composite) await rehearseComposite(rows, apiKey);
  else await rehearseTopics(rows, apiKey);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm crec:rehearse-split [--sample N] [--min-kb N] [--composite [--from YYYY-MM-DD]]',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[rehearse] Fatal:', err);
      process.exit(1);
    });
}
