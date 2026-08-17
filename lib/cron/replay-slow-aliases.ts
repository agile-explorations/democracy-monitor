/**
 * CLI: npx tsx lib/cron/replay-slow-aliases.ts   (also: pnpm aliases:replay)
 *
 * Monday slow-alias replay (#729): re-runs every recently-seen slow alias
 * arm SERIALLY into the fresh data week's arm cache, so recurring
 * pathological topics (broad phrases whose GIN phrase-recheck reads GBs)
 * have no first-payer. Invoked by the dump runner after the B2 uploads and
 * BEFORE the final prewarm — the replay's own heap reads are then mopped up
 * by the prewarm that follows. Best-effort per alias; exit 0 unless setup
 * itself fails.
 */

import { desc, gte, sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import { slowAliases } from '@/lib/db/schema';
import { runCachedArm } from '@/lib/services/arm-cache';
import type { ArmKind } from '@/lib/services/arm-cache';
import { buildAliasArmQuery, buildExploreAliasArmQuery } from '@/lib/services/hybrid-arms';
import { warmAliasValidation } from '@/lib/services/query-expansion-service';
import { researchCandidateFilters } from '@/lib/services/research-retrieval';
import { buildFilterConditions } from '@/lib/services/search-queries';
import type { SearchFilters } from '@/lib/services/search-service';

/** Replay aliases seen in the last N days; older entries age out naturally. */
const REPLAY_WINDOW_DAYS = 30;
/** Hard cap per run — the ledger should stay small; a runaway ledger must
 *  not turn the Monday cron into an hours-long grind. Logged when hit. */
const REPLAY_MAX_ALIASES = 60;

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
  const since = new Date(Date.now() - REPLAY_WINDOW_DAYS * 86400 * 1000);
  const rows = await db
    .select()
    .from(slowAliases)
    .where(gte(slowAliases.lastSeenAt, since))
    .orderBy(desc(slowAliases.lastDurationMs))
    .limit(REPLAY_MAX_ALIASES + 1);
  if (rows.length > REPLAY_MAX_ALIASES) {
    console.warn(`[alias-replay] ledger exceeds cap — replaying worst ${REPLAY_MAX_ALIASES} only`);
  }
  const toReplay = rows.slice(0, REPLAY_MAX_ALIASES);
  console.log(`[alias-replay] replaying ${toReplay.length} slow alias(es)`);
  for (const row of toReplay) {
    const started = Date.now();
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
        console.log(
          `[alias-replay] validation/${row.phrase}: counted in ${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
        continue;
      }
      const query = buildReplayQuery(row.kind as ArmKind, row.phrase, params);
      const result = await runCachedArm(
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
      console.log(
        `[alias-replay] ${row.kind}/${row.phrase}: ${result.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      console.warn(`[alias-replay] ${row.kind}/${row.phrase} failed (skipped):`, err);
    }
  }
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
