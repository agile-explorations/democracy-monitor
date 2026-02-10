import { eq, desc, gte, and } from 'drizzle-orm';
import { MONITORED_SITES } from '@/lib/data/monitored-sites';
import { isDbAvailable, getDb } from '@/lib/db';
import { siteUptime } from '@/lib/db/schema';
import type { UptimeResult, UptimeHistory, MonitoredSite } from '@/lib/types/resilience';
import { ONE_WEEK_MS } from '@/lib/utils/date-utils';

const CHECK_TIMEOUT_MS = 10000;

export async function checkSite(site: MonitoredSite): Promise<UptimeResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    const res = await fetch(`https://${site.hostname}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);
    const responseTimeMs = Date.now() - start;

    return {
      hostname: site.hostname,
      status: res.status,
      responseTimeMs,
      isUp: res.status >= 200 && res.status < 400,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      hostname: site.hostname,
      status: 0,
      responseTimeMs: null,
      isUp: false,
      checkedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function checkAllSites(): Promise<UptimeResult[]> {
  const results = await Promise.allSettled(MONITORED_SITES.map((site) => checkSite(site)));

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          hostname: 'unknown',
          status: 0,
          responseTimeMs: null,
          isUp: false,
          checkedAt: new Date().toISOString(),
          error: 'Check failed',
        },
  );
}

export async function recordResults(results: UptimeResult[]): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();
  for (const result of results) {
    await db.insert(siteUptime).values({
      hostname: result.hostname,
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      isUp: result.isUp,
    });
  }
}

async function findDownSince(
  db: ReturnType<typeof getDb>,
  hostname: string,
): Promise<string | null> {
  const recentChecks = await db
    .select()
    .from(siteUptime)
    .where(eq(siteUptime.hostname, hostname))
    .orderBy(desc(siteUptime.checkedAt))
    .limit(100);

  let downSince: string | null = null;
  for (const check of recentChecks) {
    if (check.isUp) break;
    downSince = check.checkedAt?.toISOString() ?? null;
  }
  return downSince;
}

function uptimePercent(checks: { isUp: boolean }[]): number {
  if (checks.length === 0) return 100;
  return (checks.filter((c) => c.isUp).length / checks.length) * 100;
}

async function buildSiteHistory(
  db: ReturnType<typeof getDb>,
  site: MonitoredSite,
  oneDayAgo: Date,
  sevenDaysAgo: Date,
): Promise<UptimeHistory> {
  const latest = await db
    .select()
    .from(siteUptime)
    .where(eq(siteUptime.hostname, site.hostname))
    .orderBy(desc(siteUptime.checkedAt))
    .limit(1);

  const checks24h = await db
    .select()
    .from(siteUptime)
    .where(and(eq(siteUptime.hostname, site.hostname), gte(siteUptime.checkedAt, oneDayAgo)));

  const checks7d = await db
    .select()
    .from(siteUptime)
    .where(and(eq(siteUptime.hostname, site.hostname), gte(siteUptime.checkedAt, sevenDaysAgo)));

  const downSince = latest[0] && !latest[0].isUp ? await findDownSince(db, site.hostname) : null;

  return {
    hostname: site.hostname,
    name: site.name,
    current: latest[0]
      ? {
          hostname: site.hostname,
          status: latest[0].status,
          responseTimeMs: latest[0].responseTimeMs,
          isUp: latest[0].isUp,
          checkedAt: latest[0].checkedAt?.toISOString() ?? new Date().toISOString(),
        }
      : {
          hostname: site.hostname,
          status: 0,
          responseTimeMs: null,
          isUp: true,
          checkedAt: new Date().toISOString(),
        },
    uptime24h: uptimePercent(checks24h),
    uptime7d: uptimePercent(checks7d),
    downSince,
  };
}

export async function getUptimeHistory(): Promise<UptimeHistory[]> {
  if (!isDbAvailable()) {
    return MONITORED_SITES.map((site) => ({
      hostname: site.hostname,
      name: site.name,
      current: {
        hostname: site.hostname,
        status: 0,
        responseTimeMs: null,
        isUp: true,
        checkedAt: new Date().toISOString(),
      },
      uptime24h: 100,
      uptime7d: 100,
      downSince: null,
    }));
  }

  const db = getDb();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - ONE_WEEK_MS);

  const histories: UptimeHistory[] = [];
  for (const site of MONITORED_SITES) {
    histories.push(await buildSiteHistory(db, site, oneDayAgo, sevenDaysAgo));
  }
  return histories;
}
