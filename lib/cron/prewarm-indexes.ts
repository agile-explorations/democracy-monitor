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

async function main(): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (!isDbAvailable()) throw new Error('DATABASE_URL not set');
  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_prewarm`);
  // Sequentially reading ~4 GB can legitimately take minutes on network disks.
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
  process.exit(0);
}

main().catch((err) => {
  console.error('[prewarm] failed:', err);
  process.exit(1);
});
