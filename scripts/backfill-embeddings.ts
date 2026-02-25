/**
 * One-time script: embed all unprocessed documents.
 * Usage: npx tsx scripts/backfill-embeddings.ts
 *
 * Calls embedUnprocessedDocuments() in a loop until all documents are embedded.
 * Logs progress every 500 docs. Safe to interrupt and resume.
 */
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { embedUnprocessedDocuments } from '../lib/services/document-embedder';

const BATCH_SIZE = 50;
const LOG_INTERVAL = 500;

async function main() {
  let totalEmbedded = 0;
  let batchCount = 0;

  console.log(`[backfill-embeddings] Starting embedding backfill (batch size: ${BATCH_SIZE})...`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const embedded = await embedUnprocessedDocuments(BATCH_SIZE);

    if (embedded === 0) break;

    totalEmbedded += embedded;
    batchCount++;

    if (totalEmbedded % LOG_INTERVAL < BATCH_SIZE) {
      console.log(
        `[backfill-embeddings] Progress: ${totalEmbedded} documents embedded (${batchCount} batches)`,
      );
    }
  }

  console.log(
    `[backfill-embeddings] Done. Total embedded: ${totalEmbedded} documents in ${batchCount} batches.`,
  );
  process.exit(0);
}

loadEnvConfig(process.cwd());
main().catch((err) => {
  console.error('[backfill-embeddings] Fatal error:', err);
  process.exit(1);
});
