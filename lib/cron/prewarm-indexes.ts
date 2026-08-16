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

const INDEXES = ['idx_documents_embedding_hnsw', 'idx_documents_search_vector'];

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
