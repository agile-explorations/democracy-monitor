/**
 * CLI: npx tsx lib/cron/prewarm-indexes.ts   (also: pnpm db:prewarm)
 *
 * Re-warms the big search indexes after the weekly pg_dump evicts them from
 * cache (#722): the ~3.1 GB HNSW embedding index otherwise serves a week of
 * random cold reads (the "post-dump HNSW evictions" latency multiplier).
 * pg_prewarm 'read' mode pulls pages through the OS page cache — the index
 * exceeds shared_buffers, so the OS cache is the one that matters. Invoked by
 * the dump runner right after a successful dump, BEFORE the slower B2
 * uploads; best-effort there (a prewarm failure never fails the dump).
 * Exit 0 = warmed (or index absent, logged); exit 1 = failed.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';

/** Warm order matters: the two indexes TOGETHER (~4.1 GB) exceed effective
 *  cache (~3.75 GB), so the LAST index warmed wins retention — the HNSW goes
 *  last because vector traversal is the dominant cold cost. NOTE: run this
 *  only when the cache is already cold (post-dump); an ad-hoc mid-week run
 *  DISPLACES the live working set and makes queries slower until traffic
 *  re-warms it (measured 2026-08-15: 42s → 60s on the heaviest question). */
// FTS GIN + halfvec HNSW (#724): together ~2.6 GB — the first working set
// that actually FITS the Pro-4gb page cache (~3.75 GB effective), so this
// warm can survive instead of self-evicting like the 4.2 GB fp32 set did.
const INDEXES = ['idx_documents_search_vector', 'idx_documents_embedding_halfvec_hnsw'];

/** Warm the search working set. Callable in-process (#729 mop-up) as well
 *  as from the CLI/dump runner. Measured ~15s on prod for GIN + halfvec. */
export async function prewarmSearchIndexes(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not set');
  // Dual CLI/library module: the CLI entry (main) calls loadEnvConfig;
  // in-process callers (#729 mop-up) already run inside the Next.js env.
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_prewarm`);
  // Sequentially reading ~2.6 GB can legitimately take minutes on network disks.
  await db.execute(sql`SET statement_timeout = 600000`);
  for (const index of INDEXES) {
    const exists = await db.execute(sql`SELECT 1 FROM pg_class WHERE relname = ${index}`);
    if (exists.rows.length === 0) {
      console.warn(`[prewarm] index ${index} not found — skipping`);
      continue;
    }
    const started = Date.now();
    const result = await db.execute(sql`SELECT pg_prewarm(${index}::regclass, 'read') AS blocks`);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[prewarm] ${index}: ${result.rows[0]?.blocks} blocks in ${seconds}s`);
  }
}

async function main(): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  await prewarmSearchIndexes();
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[prewarm] failed:', err);
    process.exit(1);
  });
}
