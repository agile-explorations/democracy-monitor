/**
 * One-off purge for #528: remove the every-federal-opinion noise ingested by
 * the broken NOS opinion-first queries (CL type=o ignores nature_of_suit).
 *
 * Scope: judicial_opinion rows from courtlistener, published 2026-04-20→now,
 * in civilLiberties/lawEnforcement (the only categories the broken path wrote).
 *
 * A row is KEPT if any of:
 *   (a) its case_id matches a stored docket with in-scope NOS (440/530/890) —
 *       the docket-first path's legitimate civil-rights scope;
 *   (b) its content matches the first-amendment query's intent (\bfirst amendment\b);
 *   (c) the opinion classifier routes it to the row's category (i.e. the new
 *       court-scoped pipeline would have stored it there anyway).
 * Everything else is deleted, along with its ai_document_assessments and
 * document_scores rows for that (url, category).
 *
 * Usage:
 *   tsx scripts/purge-cl-opinion-noise-528.ts             # dry run (counts + samples)
 *   tsx scripts/purge-cl-opinion-noise-528.ts --confirm   # delete
 *
 * ARCHIVE FIRST (see #528 runbook): \copy the scoped rows to CSV before --confirm.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { classifyOpinionToCategories } from '@/lib/services/crec-classifier';

const SCOPE_FROM = '2026-04-20';
const CATEGORIES = ['civilLiberties', 'lawEnforcement'];
const FIRST_AMENDMENT_RE = /\bfirst amendment\b/i;
const BATCH = 500;

interface Row {
  id: number;
  url: string;
  category: string;
  title: string;
  head: string | null;
  nos_ok: boolean;
}

async function loadCandidates(): Promise<Row[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT o.id, o.url, o.category, o.title, left(o.content, 8000) AS head,
      EXISTS (
        SELECT 1 FROM documents d
        WHERE d.case_id = o.case_id
          AND d.source_type IN ('court_opinion', 'docket')
          AND d.metadata->>'suitNature' ~ '^(440|530|890)'
      ) AS nos_ok
    FROM documents o
    WHERE o.source_origin = 'courtlistener'
      AND o.source_type = 'judicial_opinion'
      AND o.published_at >= ${SCOPE_FROM}
      AND o.category IN (${sql.join(
        CATEGORIES.map((c) => sql`${c}`),
        sql`, `,
      )})
  `);
  return rows.rows as unknown as Row[];
}

function shouldKeep(row: Row): { keep: boolean; reason: string } {
  if (row.nos_ok) return { keep: true, reason: 'nos-docket' };
  if (row.head && FIRST_AMENDMENT_RE.test(row.head)) return { keep: true, reason: '1a-text' };
  const cats = classifyOpinionToCategories(row.title, row.head);
  if (cats.includes(row.category)) return { keep: true, reason: 'classifier' };
  return { keep: false, reason: 'no-criteria' };
}

async function purge(ids: number[], urlCats: Array<{ url: string; category: string }>) {
  const db = getDb();
  for (let i = 0; i < urlCats.length; i += BATCH) {
    const slice = urlCats.slice(i, i + BATCH);
    const pairs = sql.join(
      slice.map((r) => sql`(${r.url}, ${r.category})`),
      sql`, `,
    );
    await db.execute(sql`DELETE FROM ai_document_assessments WHERE (url, category) IN (${pairs})`);
    await db.execute(sql`DELETE FROM document_scores WHERE (url, category) IN (${pairs})`);
  }
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    await db.execute(
      sql`DELETE FROM documents WHERE id IN (${sql.join(
        slice.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    console.log(`[purge-528] deleted ${Math.min(i + BATCH, ids.length)}/${ids.length} documents`);
  }
}

async function main() {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const confirm = process.argv.includes('--confirm');

  const rows = await loadCandidates();
  console.log(`[purge-528] ${rows.length} candidate rows in scope`);

  const keepReasons: Record<string, number> = {};
  const toDelete: Row[] = [];
  for (const row of rows) {
    const { keep, reason } = shouldKeep(row);
    if (keep) keepReasons[reason] = (keepReasons[reason] ?? 0) + 1;
    else toDelete.push(row);
  }

  console.log(`[purge-528] keep:`, JSON.stringify(keepReasons));
  console.log(`[purge-528] delete: ${toDelete.length} rows`);
  console.log('[purge-528] delete samples:');
  const step = Math.max(1, Math.floor(toDelete.length / 10));
  for (const r of toDelete.filter((_, i) => i % step === 0).slice(0, 10)) {
    console.log(`  - ${r.title.slice(0, 60)} [${r.category}]`);
  }

  if (!confirm) {
    console.log('[purge-528] DRY RUN — re-run with --confirm to delete (archive CSV first!)');
    return;
  }

  await purge(
    toDelete.map((r) => r.id),
    toDelete.map((r) => ({ url: r.url, category: r.category })),
  );
  console.log(`[purge-528] Done: ${toDelete.length} rows purged.`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[purge-528] Fatal:', err);
      process.exit(1);
    });
}
