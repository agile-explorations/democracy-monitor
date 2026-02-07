import { checkAllSites, recordResults } from '@/lib/services/uptime-service';

export async function runUptimeCheck(): Promise<void> {
  console.log('[uptime-check] Starting uptime check...');
  const start = Date.now();

  const results = await checkAllSites();
  await recordResults(results);

  const downSites = results.filter((r) => !r.isUp);
  const elapsed = Date.now() - start;

  console.log(
    `[uptime-check] Complete in ${elapsed}ms: ` +
      `${results.length - downSites.length}/${results.length} sites up`,
  );

  if (downSites.length > 0) {
    console.log('[uptime-check] Down sites:');
    for (const site of downSites) {
      console.log(`  - ${site.hostname}: ${site.error || `status ${site.status}`}`);
    }
  }
}

// Allow running directly with tsx
if (require.main === module) {
  runUptimeCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[uptime-check] Fatal error:', err);
      process.exit(1);
    });
}
