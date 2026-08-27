/**
 * CLI: npx tsx lib/cron/replay-slow-aliases.ts   (also: pnpm aliases:replay)
 *
 * Monday alias replay (#729, widened by #788): pre-pays every arm and
 * validation count a real request executed as a cache miss during the
 * previous data week into the FRESH week's cache — arms first, then counts,
 * junk-class counts last; within a tier most recently demanded first —
 * `ALIAS_REPLAY_CONCURRENCY` at a time, until `ALIAS_REPLAY_BUDGET_MS` is
 * spent (work not started by then is skipped, in-flight work finishes).
 * A novel wording of a known topic then hits instead of paying cold.
 * Invoked by the dump runner after the B2 uploads and BEFORE the final
 * index prewarm — the replay's own heap reads are then mopped up by the
 * prewarm that follows. Best-effort per alias; exit 0 unless setup fails.
 */

import { desc, gte, sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import { slowAliases } from '@/lib/db/schema';
import { planReplay, summarizeReplay } from '@/lib/services/alias-replay-plan';
import { runCachedArm } from '@/lib/services/arm-cache';
import type { ArmKind } from '@/lib/services/arm-cache';
import { buildAliasArmQuery, buildExploreAliasArmQuery } from '@/lib/services/hybrid-arms';
import { warmAliasValidation } from '@/lib/services/query-expansion-service';
import { researchCandidateFilters } from '@/lib/services/research-retrieval';
import { buildFilterConditions } from '@/lib/services/search-queries';
import type { SearchFilters } from '@/lib/services/search-service';
import { mapConcurrentUntil } from '@/lib/utils/async';
import { envInt } from '@/lib/utils/env';

/** Replay demand seen in the previous data week (8 days overlaps the
 *  week boundary the way the cache TTL does). */
const REPLAY_WINDOW_DAYS = 8;
/** Wall-clock budget: the replay sits between the 05:00 dump and the
 *  06:00 docs pre-warm; work not started by the deadline is skipped. */
const REPLAY_BUDGET_MS = envInt('ALIAS_REPLAY_BUDGET_MS', 25 * 60 * 1000, 60_000, 3_600_000);
/** Off-peak Monday; the 2-vCPU tier is I/O-bound, so a few in flight is
 *  the whole win — the request-time gate does not apply outside requests. */
const REPLAY_CONCURRENCY = envInt('ALIAS_REPLAY_CONCURRENCY', 4, 1, 8);

function buildReplayQuery(kind: ArmKind, phrase: string, params: Record<string, string | null>) {
  // `matches` only affects fusion weighting, never the query text.
  const alias = { phrase, matches: 0 };
  if (kind === 'research') {
    const filters = researchCandidateFilters(
      params.dateFrom ?? undefined,
      params.dateTo ?? undefined,
      (params.tier ?? undefined) as DocumentTier | undefined,
    );
    return buildAliasArmQuery(alias, filters);
  }
  const filters: SearchFilters = {
    query: '',
    category: params.category ?? undefined,
    dateFrom: params.dateFrom ?? undefined,
    dateTo: params.dateTo ?? undefined,
    sourceOrigin: params.sourceOrigin ?? undefined,
    scoreMin: params.scoreMin != null ? Number(params.scoreMin) : undefined,
    scoreMax: params.scoreMax != null ? Number(params.scoreMax) : undefined,
    documentClass: params.documentClass ?? undefined,
  };
  const whereParts = [sql`d.embedding IS NOT NULL`, ...buildFilterConditions(filters)];
  return buildExploreAliasArmQuery(alias, sql.join(whereParts, sql` AND `));
}

export async function replaySlowAliases(): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not set');
  // Dual CLI/library module: the CLI entry (main) calls loadEnvConfig first.
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const startedAt = Date.now();
  const since = new Date(startedAt - REPLAY_WINDOW_DAYS * 86400 * 1000);
  const rows = await db
    .select()
    .from(slowAliases)
    .where(gte(slowAliases.lastSeenAt, since))
    .orderBy(desc(slowAliases.lastSeenAt), desc(slowAliases.lastDurationMs)); // final order: planReplay
  const work = planReplay(rows, new Date(startedAt), REPLAY_WINDOW_DAYS);
  console.log(
    `[alias-replay] ${work.length} ledger row(s) in window; budget ${REPLAY_BUDGET_MS / 60000}m, concurrency ${REPLAY_CONCURRENCY}`,
  );
  const tally = { arms: 0, counts: 0, failed: 0 };
  const deadline = startedAt + REPLAY_BUDGET_MS;
  const { skipped } = await mapConcurrentUntil(
    work,
    REPLAY_CONCURRENCY,
    () => Date.now() >= deadline,
    async (row) => {
      const params = row.params ?? {};
      try {
        // Validation rows (#729 follow-up) replay the expansion corpus-count;
        // research/explore rows replay the arm query.
        if (row.kind === 'validation') {
          await warmAliasValidation(row.phrase, {
            dateFrom: params.dateFrom ?? undefined,
            dateTo: params.dateTo ?? undefined,
            tier: (params.tier ?? undefined) as DocumentTier | undefined,
            category: params.category ?? undefined,
          });
          tally.counts += 1;
          return;
        }
        const query = buildReplayQuery(row.kind as ArmKind, row.phrase, params);
        await runCachedArm(
          db,
          {
            kind: row.kind as ArmKind,
            phrase: row.phrase,
            paramsHash: row.paramsHash,
            params,
            query,
          },
          true, // forceRefresh: always write the fresh week's cache
        );
        tally.arms += 1;
      } catch (err) {
        tally.failed += 1;
        console.warn(`[alias-replay] ${row.kind}/${row.phrase} failed (skipped):`, err);
      }
    },
  );
  console.log(
    summarizeReplay({
      ...tally,
      skipped,
      ledgered: work.length,
      elapsedMs: Date.now() - startedAt,
      budgetMs: REPLAY_BUDGET_MS,
    }),
  );
}

async function main(): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  await replaySlowAliases();
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[alias-replay] failed:', err);
    process.exit(1);
  });
}
