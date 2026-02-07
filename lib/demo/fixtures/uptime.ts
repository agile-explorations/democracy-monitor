/**
 * Uptime monitoring fixtures for all 15 monitored sites.
 */

import { MONITORED_SITES } from '@/lib/data/monitored-sites';
import type { UptimeResult, UptimeHistory, InformationAvailabilityStatus } from '@/lib/types';
import type { ScenarioName } from '../scenarios';
import { DEMO_SCENARIOS } from '../scenarios';

function now(): string {
  return new Date().toISOString();
}

// Sites that go down first in degraded scenarios (most critical transparency sites)
const DOWN_PRIORITY = [
  'www.oversight.gov',
  'www.gao.gov',
  'oig.ssa.gov',
  'www.cbo.gov',
  'www.opm.gov',
];

function makeSiteResults(downCount: number): {
  results: UptimeResult[];
  histories: UptimeHistory[];
} {
  const downSet = new Set(DOWN_PRIORITY.slice(0, downCount));
  const checkedAt = now();

  const results: UptimeResult[] = MONITORED_SITES.map((site) => {
    const isDown = downSet.has(site.hostname);
    return {
      hostname: site.hostname,
      status: isDown ? 0 : 200,
      responseTimeMs: isDown ? null : Math.floor(100 + Math.random() * 400),
      isUp: !isDown,
      checkedAt,
      ...(isDown ? { error: 'Connection timed out' } : {}),
    };
  });

  const histories: UptimeHistory[] = MONITORED_SITES.map((site, i) => {
    const isDown = downSet.has(site.hostname);
    return {
      hostname: site.hostname,
      name: site.name,
      current: results[i],
      uptime24h: isDown ? 0.4 : 1.0,
      uptime7d: isDown ? 0.75 : 0.99,
      downSince: isDown ? new Date(Date.now() - 6 * 3600000).toISOString() : null,
    };
  });

  return { results, histories };
}

function makeAvailability(downCount: number): InformationAvailabilityStatus {
  const total = MONITORED_SITES.length;
  const status: InformationAvailabilityStatus['overallStatus'] =
    downCount >= 4 ? 'Drift' : downCount >= 2 ? 'Warning' : downCount >= 1 ? 'Warning' : 'Stable';

  return {
    sitesUp: total - downCount,
    sitesDown: downCount,
    sitesTotal: total,
    suppressionAlerts:
      downCount > 0
        ? [
            {
              url: `https://${DOWN_PRIORITY[0]}`,
              type: 'site_down',
              severity: 'drift',
              message: `${DOWN_PRIORITY[0]} has been unreachable for over 6 hours`,
              detectedAt: now(),
            },
          ]
        : [],
    missingReports: [],
    overallStatus: status,
    reason:
      downCount === 0
        ? 'All monitored government sites are accessible.'
        : `${downCount} of ${total} monitored sites are currently unreachable.`,
  };
}

export function getDemoUptimeStatus(scenario: ScenarioName): {
  sites: UptimeHistory[];
  availability: InformationAvailabilityStatus;
  checkedAt: string;
} {
  const downCount = DEMO_SCENARIOS[scenario].uptimeDownCount;
  const { histories } = makeSiteResults(downCount);
  return {
    sites: histories,
    availability: makeAvailability(downCount),
    checkedAt: now(),
  };
}

export function getDemoUptimeCheck(scenario: ScenarioName): {
  checked: number;
  up: number;
  down: number;
  results: UptimeResult[];
  checkedAt: string;
} {
  const downCount = DEMO_SCENARIOS[scenario].uptimeDownCount;
  const { results } = makeSiteResults(downCount);
  return {
    checked: results.length,
    up: results.filter((r) => r.isUp).length,
    down: results.filter((r) => !r.isUp).length,
    results,
    checkedAt: now(),
  };
}
