/**
 * Load-test cache reset (#781): SCAN+DEL the question-keyed and arm-level
 * search namespaces on the DEV keyvalue instance, printing per-namespace
 * counts (recorded into run reports as the cache-state attestation).
 * NEVER FLUSHALL; `emb:*` (document embeddings — data, not per-question
 * state) is deliberately untouched.
 *
 * Usage: LOADTEST_REDIS_URL=<dev external url> npx tsx scripts/loadtest/reset-caches.ts
 */

import Redis from 'ioredis';
import { assertNotProd } from './guard';

const NAMESPACES = [
  'search:research:*',
  'search:rdocs:*',
  'search:qemb:*',
  'search:qexp:*',
  'search:qexpv:*',
  'search:qjudge:*',
  'search:arm:*',
  'search:vcount:*',
  'search:vtotal:*',
  'search:inflight:*',
  'search:buildslot:*',
  'rl:*',
];

async function main(): Promise<void> {
  const url = process.env.LOADTEST_REDIS_URL;
  if (!url) {
    console.error('LOADTEST_REDIS_URL is required (dev keyvalue EXTERNAL connection string)');
    process.exit(1);
  }
  assertNotProd({ redisUrl: url });
  const redis = new Redis(url, {
    tls: url.startsWith('rediss') ? {} : undefined,
    lazyConnect: true,
  });
  redis.on('error', (e) => {
    console.error('REDIS ERR:', String(e.message).slice(0, 120));
    process.exit(1);
  });
  await redis.connect();
  const counts: Record<string, number> = {};
  for (const pattern of NAMESPACES) {
    let cursor = '0';
    const keys: string[] = [];
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 200) {
      deleted += await redis.del(...keys.slice(i, i + 200));
    }
    counts[pattern] = deleted;
    console.log(`${pattern.padEnd(24)} deleted=${deleted}`);
  }
  await redis.quit();
  console.log(JSON.stringify({ cacheReset: counts }));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('reset failed:', err);
    process.exit(1);
  });
}
