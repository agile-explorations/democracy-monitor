/**
 * #704 Path A / #929 composite: split CREC granules into retrieval-grade
 * fragment documents — one per topic, and one per speaker inside a topic
 * where several members spoke.
 *
 * Runs in two places (#852): as the weekly snapshot step
 * (`lib/cron/snapshot-crec-fragments.ts`, before the embedding pass so new
 * fragments are searchable the same night) and as a CLI for backfills.
 * Safe to run directly against prod (#850): inserts are additive and
 * idempotent, parents are never modified beyond the assessed marker, and
 * fragments sit outside the counting and L2 populations
 * (counting_scope=false, parent_id set — see #704 Path A/B), so there is no
 * counting change, no assessment change, no re-aggregation and no flip risk.
 *
 * Idempotent and resumable: granules carrying the `fragmentsAssessedV2`
 * marker are skipped; fragment inserts are ON CONFLICT DO NOTHING on
 * (url, category). A topic fragment stored by the V1 (topic-only) build whose
 * text turns out to hold several speakers is superseded once its speaker
 * children exist (superseded + retrieval_relevant=false + supersededBy — the
 * G8 contract). A GovInfo fetch miss leaves the granule unmarked so the next
 * run retries it.
 *
 * Usage:
 *   pnpm crec:build-fragments              # Dry run: candidate counts only
 *   pnpm crec:build-fragments --confirm    # Fetch, split, insert
 *   pnpm crec:build-fragments --confirm --limit N   # First N parents only
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import type { CrecSpeaker } from '@/lib/services/crec-fetcher';
import {
  FRAGMENTS_ASSESSED_MARKER,
  compositeCandidateSql,
  fetchStructuredGranule,
} from '@/lib/services/crec-fragments';
import { qualifiesComposite, splitComposite } from '@/lib/services/crec-splitter';
import type { CompositeFragment } from '@/lib/services/crec-splitter';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const FETCH_POLITENESS_MS = 350;
const PROGRESS_EVERY = 100;

interface ParentRow {
  id: number;
  url: string;
  title: string;
  published_at: string;
  granule_id: string;
  speakers: CrecSpeaker[] | null;
}

export interface CrecFragmentBuildOptions {
  /** Fetch, split and insert. Without it, only the candidate count is reported. */
  confirm: boolean;
  /** Process at most this many granules (CLI convenience). */
  limit?: number | null;
  /** GovInfo API key; required when `confirm` is set. */
  apiKey?: string;
}

export interface CrecFragmentBuildResult {
  /** Granules (whole-day or multi-speaker) not yet assessed by the composite build. */
  candidates: number;
  /** Granules fetched, split (or found single-leaf) and marked assessed. */
  processed: number;
  /** Fragment rows inserted across all categories. */
  inserted: number;
  /** V1 topic fragments superseded by their speaker children. */
  superseded: number;
  /** Granules whose GovInfo fetch failed — left unmarked, retried next run. */
  misses: number;
}

async function selectParents(limit: number | null): Promise<ParentRow[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (metadata->>'granuleId')
      id, url, title, published_at, metadata->>'granuleId' AS granule_id, metadata->'speakers' AS speakers
    FROM documents
    WHERE ${compositeCandidateSql()}
    ORDER BY metadata->>'granuleId', id
    ${limit ? sql`LIMIT ${limit}` : sql``}`);
  return rows.rows as unknown as ParentRow[];
}

/** Categories for a leaf: the classifier's, plus — for a speaker child — every
 *  category its stored topic fragment reached, so no category loses coverage. */
async function leafCategories(parent: ParentRow, leaf: CompositeFragment): Promise<string[]> {
  const own = classifyCrecToCategories(leaf.heading, leaf.text.slice(0, 6000));
  if (!leaf.splitBySpeaker) return own;
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const stored = await getDb().execute(sql`
    SELECT category FROM documents WHERE url = ${`${parent.url}#frag-${leaf.topicIndex}`}`);
  return [...new Set([...own, ...stored.rows.map((r) => (r as { category: string }).category)])];
}

function leafMetadata(parent: ParentRow, leaf: CompositeFragment): string {
  const speaker = leaf.speaker ?? null;
  return JSON.stringify({
    granuleId: parent.granule_id,
    fragmentIndex: leaf.topicIndex,
    topicHeading: leaf.topicHeading,
    fragmentMode: 'composite',
    ...(leaf.speakerIndex !== undefined ? { speakerIndex: leaf.speakerIndex } : {}),
    ...(leaf.speakerSurname ? { speakerSurname: leaf.speakerSurname } : {}),
    ...(speaker
      ? {
          speakers: [speaker],
          agency: `${speaker.memberName} (${speaker.party || '?'}-${speaker.state || '?'})`,
        }
      : {}),
  });
}

async function insertLeaf(parent: ParentRow, leaf: CompositeFragment): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  let inserted = 0;
  for (const category of await leafCategories(parent, leaf)) {
    const result = await db.execute(sql`
      INSERT INTO documents (
        source_type, category, title, content, url, published_at,
        source_origin, content_type, parent_id, counting_scope, speaker, metadata
      ) VALUES (
        'floor_speech', ${category}, ${leaf.heading}, ${leaf.text},
        ${`${parent.url}${leaf.suffix}`}, ${parent.published_at},
        'crec', 'full_text', ${parent.id}, false, ${leaf.speaker?.memberName ?? null},
        ${leafMetadata(parent, leaf)}::jsonb
      )
      ON CONFLICT (url, category) DO NOTHING`);
    inserted += Number(result.rowCount ?? 0);
  }
  return inserted;
}

/** A V1 topic fragment whose speaker children now exist leaves search the way a
 *  superseded opinion revision does (#741, G8): superseded, out of evidence,
 *  with the keeper recorded. Only when at least one child row is present. */
async function supersedeTopicFragment(parent: ParentRow, topicIndex: number): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const topicUrl = `${parent.url}#frag-${topicIndex}`;
  const result = await db.execute(sql`
    UPDATE documents
    SET superseded = true, retrieval_relevant = false,
        metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ supersededBy: `${topicUrl}-s*` })}::jsonb
    WHERE url = ${topicUrl} AND parent_id IS NOT NULL AND superseded IS NOT TRUE
      AND EXISTS (SELECT 1 FROM documents c WHERE c.url LIKE ${`${topicUrl}-s%`})`);
  return Number(result.rowCount ?? 0);
}

async function insertComposite(
  parent: ParentRow,
  structuredText: string,
): Promise<{ inserted: number; superseded: number }> {
  const leaves = splitComposite(structuredText, parent.speakers ?? [], parent.title);
  if (!qualifiesComposite(leaves)) return { inserted: 0, superseded: 0 };
  let inserted = 0;
  let superseded = 0;
  for (const leaf of leaves) inserted += await insertLeaf(parent, leaf);
  const splitTopics = new Set(leaves.filter((l) => l.splitBySpeaker).map((l) => l.topicIndex));
  for (const topicIndex of splitTopics)
    superseded += await supersedeTopicFragment(parent, topicIndex);
  return { inserted, superseded };
}

/** Record that a granule was assessed by the composite build — including
 *  granules that produced zero fragments — so the ingest-health detector
 *  (countUnfragmentedCrecGranules) never re-flags it. Set on every
 *  per-category row of the granule. */
async function markGranuleAssessed(granuleId: string): Promise<void> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  await db.execute(sql`
    UPDATE documents
    SET metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ [FRAGMENTS_ASSESSED_MARKER]: true })}::jsonb
    WHERE source_origin = 'crec' AND parent_id IS NULL
      AND metadata->>'granuleId' = ${granuleId}`);
}

/** Fetch, split, insert and mark every unassessed candidate granule.
 *  Shared by the CLI and the weekly snapshot step (#852). */
export async function runCrecFragmentBuild(
  options: CrecFragmentBuildOptions,
): Promise<CrecFragmentBuildResult> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const { confirm, apiKey } = options;
  const limit = options.limit ?? null;
  if (confirm && !apiKey) throw new Error('GOVINFO_API_KEY not configured');

  const parents = await selectParents(limit);
  console.log(`[frag] ${parents.length} candidate granule(s) not yet assessed (composite)`);
  const result: CrecFragmentBuildResult = {
    candidates: parents.length,
    processed: 0,
    inserted: 0,
    superseded: 0,
    misses: 0,
  };
  if (!confirm) {
    console.log('[frag] Dry run complete. Run with --confirm to fetch/split/insert.');
    return result;
  }

  for (const parent of parents) {
    await sleep(FETCH_POLITENESS_MS);
    const text = await fetchStructuredGranule(parent.granule_id, apiKey as string);
    if (!text) {
      result.misses++;
      continue;
    }
    const r = await insertComposite(parent, text);
    result.inserted += r.inserted;
    result.superseded += r.superseded;
    await markGranuleAssessed(parent.granule_id);
    result.processed++;
    if (result.processed % PROGRESS_EVERY === 0)
      console.log(
        `[frag] ${result.processed}/${parents.length} parents, ${result.inserted} fragments, ${result.superseded} superseded, ${result.misses} fetch misses`,
      );
  }
  console.log(
    `[frag] Complete: ${result.processed} parents assessed, ${result.inserted} fragment rows inserted, ${result.superseded} topic fragments superseded, ${result.misses} fetch misses.`,
  );
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;
  await runCrecFragmentBuild({ confirm, limit, apiKey: process.env.GOVINFO_API_KEY });
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    'Usage: pnpm crec:build-fragments [--confirm] [--limit N]  (also runs weekly in the snapshot cron, #852; composite topic × speaker since #929)',
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[frag] Fatal:', err);
      process.exit(1);
    });
}
