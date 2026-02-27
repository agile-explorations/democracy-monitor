import { buildSignalLookup } from '@/lib/data/categories';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';
import { fetchSignalWithMetadata } from '@/lib/services/feed-fetcher';
import { recordSnapshotSignalResults } from '@/lib/services/fetch-log-store';
import {
  getLatestSourceHealth,
  recordSourceHealthChecks,
} from '@/lib/services/source-health-service';
import { getWeekOfDate } from '@/lib/services/weekly-aggregator';
import { addDays } from '@/lib/utils/date-utils';

/** Signal types eligible for retry (RSS/HTML/JSON/FR — not API signals). */
const RETRYABLE_TYPES = new Set(['rss', 'html', 'json', 'federal_register']);

/** Process a single recovered signal: store docs + scores. */
function handleRecovery(result: SignalFetchResult, categoryKey: string): void {
  storeDocuments(result.items, categoryKey).catch((err) =>
    console.error(`[retry] Store failed for ${result.signalId}:`, err),
  );

  const docScores = scoreDocumentBatch(result.items, categoryKey);
  storeDocumentScores(docScores).catch((err) =>
    console.error(`[retry] Score storage failed for ${result.signalId}:`, err),
  );
}

/** Record updated health + fetch_log for a retried signal. */
async function recordRetryOutcome(result: SignalFetchResult, categoryKey: string): Promise<void> {
  await recordSourceHealthChecks(categoryKey, [result]);

  const weekStart = getWeekOfDate();
  await recordSnapshotSignalResults(categoryKey, weekStart, addDays(weekStart, 6), [result]);
}

export async function retryFailedSignals(): Promise<void> {
  const start = Date.now();
  console.log('[retry] Checking for failed signals to retry...');

  const healthChecks = await getLatestSourceHealth();
  const failed = healthChecks.filter(
    (h) => h.status === 'unavailable' && RETRYABLE_TYPES.has(h.sourceType),
  );

  if (failed.length === 0) {
    console.log('[retry] No failed retryable signals found');
    return;
  }

  console.log(`[retry] Found ${failed.length} failed signals to retry`);
  const signalMap = buildSignalLookup();
  let recovered = 0;
  let stillFailed = 0;

  for (const check of failed) {
    const entry = signalMap.get(check.sourceId);
    if (!entry) {
      console.warn(`[retry] Signal ${check.sourceId} not found in CATEGORIES, skipping`);
      continue;
    }

    console.log(`[retry] Retrying ${check.sourceId} (${check.sourceType})...`);
    const result = await fetchSignalWithMetadata(entry.signal);

    if (result.success && result.documentCount > 0) {
      recovered++;
      console.log(`[retry]   Recovered ${result.documentCount} documents`);
      handleRecovery(result, entry.categoryKey);
    } else {
      stillFailed++;
      console.log(`[retry]   Still failing: ${result.errorMessage || 'no documents'}`);
    }

    await recordRetryOutcome(result, entry.categoryKey);
  }

  const elapsed = Date.now() - start;
  console.log(`[retry] Done in ${elapsed}ms: ${recovered} recovered, ${stillFailed} failed`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  retryFailedSignals()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[retry] Fatal error:', err);
      process.exit(1);
    });
}
