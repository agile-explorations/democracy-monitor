/**
 * Halfvec distance expressions (#724, v1.9.44): ranking queries run against
 * the fp16 expression index idx_documents_embedding_halfvec_hnsw — HALF the
 * RAM of the fp32 index (1.38 vs 3.24 GB on prod), so the search working set
 * (halfvec + FTS GIN ≈ 2.6 GB) finally fits the Pro-4gb page cache. Gate
 * evidence (2026-08-17, 28 questions, recall@30 vs exact): halfvec@ef200
 * 97.9% mean vs fp32@ef40 85.7%, every returned doc within exact top-40;
 * fixes two live catastrophic-miss questions (fp32 0%/3% → 100%/93%).
 *
 * The SQL text must match the index expression EXACTLY (embedding::halfvec(1536))
 * or the planner falls back to a sequential scan. Display-only cosine
 * columns stay fp32 — they never touch an index.
 */

import { sql } from 'drizzle-orm';
import type { getDb } from '@/lib/db';
import { dbWorkGate } from '@/lib/services/db-work-gate';

type Db = ReturnType<typeof getDb>;
type SqlQuery = ReturnType<typeof sql>;

/**
 * Execute a filtered vector query with HNSW iterative scanning. Tier/date
 * filters post-filter the HNSW candidate stream; iterative scan keeps
 * scanning until the LIMIT is satisfied. ef_search=200 is part of the
 * halfvec candidate config (#724): at ef=40 the entry-point descent gets
 * captured by a wrong basin on some queries (measured 0% recall@30 on two
 * live questions); ef=200 fixes every catastrophic miss. The old "never
 * raise ef" warning was measured on the 3.24GB fp32 index that thrashed the
 * page cache — the 1.38GB halfvec index fits it (176-345ms cold on prod).
 * SET LOCAL scopes both GUCs to this transaction.
 */
export async function executeFilteredVectorQuery(db: Db, query: SqlQuery) {
  // Under the request's DB budget (#782 WO-5): vector scans beside a burst
  // of validation counts ran 2x slower cold; sharing one gate lets them
  // interleave instead of compete.
  return dbWorkGate(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`);
      await tx.execute(sql`SET LOCAL hnsw.ef_search = 200`);
      return tx.execute(query);
    }),
  );
}

/** Distance for queries whose FROM aliases documents as `d`. */
export function halfvecDistanceDoc(vectorStr: string): ReturnType<typeof sql> {
  return sql`d.embedding::halfvec(1536) <=> ${vectorStr}::vector::halfvec(1536)`;
}

/** Distance for queries selecting from documents without an alias. */
export function halfvecDistanceBare(vectorStr: string): ReturnType<typeof sql> {
  return sql`embedding::halfvec(1536) <=> ${vectorStr}::vector::halfvec(1536)`;
}
