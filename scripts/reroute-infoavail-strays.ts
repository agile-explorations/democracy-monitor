/**
 * R-INFOAVAIL #833: reroute confirmed off-topic infoAvailability FR strays.
 *
 * Reads the owner-approved inventory (docs/internal/INFOAVAIL_STRAY_INVENTORY_833.json,
 * dispositions finalized 2026-09-01 after content triage), then:
 *   1. create-path: copies the document row to its target category (idempotent);
 *   2. runs the standard Layer-2 pipeline per (category, week) group — the
 *      orchestrator's existing-P1/P2 dedupe prevents duplicate calls (#563).
 *
 * Spend protocol: configureAiCallBudget(--max-calls); budget exhaustion exits 3
 * and is never retried. --canary runs only the first group. --group-limit N
 * caps groups for verification runs.
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { getDocumentsForCategoryWeek } from '@/lib/cron/backfill-document-review';
import { getDb } from '@/lib/db';
import { configureAiCallBudget, getAiCallCount } from '@/lib/services/ai-call-budget';
import { runLayer2Assessment } from '@/lib/services/document-review-orchestrator';

const INVENTORY = 'docs/internal/INFOAVAIL_STRAY_INVENTORY_833.json';

interface StrayRow {
  url: string;
  title: string;
  published: string;
  needs_action: string;
  proposed_target: string | null;
  baseline_period: boolean;
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function ensureTargetRow(url: string, target: string): Promise<'created' | 'existed'> {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO documents (source_type, category, title, content, url, published_at,
      fetched_at, metadata, embedding, embedded_at, source_origin, case_id,
      content_type, speaker, retrieval_relevant, counting_scope, parent_id)
    SELECT source_type, ${target}, title, content, url, published_at,
      fetched_at, metadata, embedding, embedded_at, source_origin, case_id,
      content_type, speaker, true, counting_scope, parent_id
    FROM documents d
    WHERE d.url = ${url} AND d.category = 'infoAvailability'
      AND NOT EXISTS (
        SELECT 1 FROM documents e WHERE e.url = ${url} AND e.category = ${target}
      )`);
  return (result.rowCount ?? 0) > 0 ? 'created' : 'existed';
}

async function main() {
  const args = process.argv.slice(2);
  const canary = args.includes('--canary');
  const maxCallsArg = args.indexOf('--max-calls');
  const maxCalls = maxCallsArg >= 0 ? parseInt(args[maxCallsArg + 1], 10) : 160;
  configureAiCallBudget(maxCalls);

  const inv: StrayRow[] = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const reroute = inv.filter(
    (r) =>
      r.proposed_target &&
      (r.needs_action.startsWith('create') || r.needs_action.startsWith('assess')),
  );
  console.log(`[reroute-833] ${reroute.length} reroute-path docs, cap ${maxCalls} calls`);

  // 1. Ensure target rows exist for create-path docs.
  let created = 0;
  for (const r of reroute.filter((r) => r.needs_action.startsWith('create'))) {
    const outcome = await ensureTargetRow(r.url, r.proposed_target as string);
    if (outcome === 'created') created++;
    console.log(`  row ${outcome}: [${r.proposed_target}] ${r.title.slice(0, 70)}`);
  }
  console.log(`[reroute-833] target rows created: ${created}`);

  // 2. Group by (target category, Monday week) and run the L2 pipeline.
  const groups = new Map<string, StrayRow[]>();
  for (const r of reroute) {
    const key = `${r.proposed_target}|${mondayOf(r.published)}`;
    if (!groups.has(key)) groups.set(key, []);
    (groups.get(key) as StrayRow[]).push(r);
  }
  console.log(
    `[reroute-833] ${groups.size} (category, week) groups${canary ? ' — CANARY: first group only' : ''}`,
  );

  let groupsRun = 0;
  for (const [key, rows] of groups) {
    const [category, weekOf] = key.split('|');
    const urls = new Set(rows.map((r) => r.url));
    const weekItems = await getDocumentsForCategoryWeek(category, weekOf);
    const items = weekItems.filter((i) => i.link && urls.has(i.link));
    if (items.length === 0) {
      console.log(`  SKIP ${key}: 0 eligible items (of ${rows.length} targeted)`);
      continue;
    }
    const before = getAiCallCount();
    const summary = await runLayer2Assessment(items, category, weekOf, {});
    console.log(
      `  ${key}: ${items.length} docs · calls ${getAiCallCount() - before} · flagged ${summary?.flagCount ?? '?'}`,
    );
    groupsRun++;
    if (canary) break;
  }
  console.log(
    `[reroute-833] DONE groups=${groupsRun}/${groups.size} totalCalls=${getAiCallCount()} rowsCreated=${created}`,
  );
  process.exit(0);
}

main().catch((err) => {
  if ((err as Error).message?.includes('AI call budget')) {
    console.error('[reroute-833] CALL BUDGET EXHAUSTED — stopping, do not retry (exit 3)');
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
});
