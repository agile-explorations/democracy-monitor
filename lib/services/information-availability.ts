import { MONITORED_SITES } from '@/lib/data/monitored-sites';
import type { StatusLevel } from '@/lib/types';
import type { InformationAvailabilityStatus, SuppressionAlert } from '@/lib/types/resilience';
import { checkSiteDown } from './suppression-detection';
import { getUptimeHistory } from './uptime-service';

function determineOverallStatus(params: {
  criticalDown: { name: string }[];
  captureAlerts: SuppressionAlert[];
  driftAlerts: SuppressionAlert[];
  sitesDown: number;
  sitesTotal: number;
  suppressionAlerts: SuppressionAlert[];
}): { overallStatus: StatusLevel; reason: string } {
  const { criticalDown, captureAlerts, driftAlerts, sitesDown, sitesTotal, suppressionAlerts } =
    params;

  if (captureAlerts.length > 0 || criticalDown.length >= 3) {
    return {
      overallStatus: 'Capture',
      reason:
        captureAlerts.length > 0
          ? `Critical information suppression detected: ${captureAlerts[0].message}`
          : `${criticalDown.length} critical government sites are down`,
    };
  }
  if (driftAlerts.length > 0 || criticalDown.length >= 1) {
    return {
      overallStatus: 'Drift',
      reason:
        criticalDown.length > 0
          ? `${criticalDown.length} critical site${criticalDown.length > 1 ? 's' : ''} down: ${criticalDown.map((c) => c.name).join(', ')}`
          : `Information availability concerns: ${driftAlerts[0].message}`,
    };
  }
  if (sitesDown > 0 || suppressionAlerts.length > 0) {
    return {
      overallStatus: 'Warning',
      reason:
        sitesDown > 0
          ? `${sitesDown} government site${sitesDown > 1 ? 's' : ''} currently unreachable`
          : `Minor availability concerns detected`,
    };
  }
  return {
    overallStatus: 'Stable',
    reason: `All ${sitesTotal} monitored government sites are accessible`,
  };
}

export async function assessInformationAvailability(): Promise<InformationAvailabilityStatus> {
  const uptimeHistories = await getUptimeHistory();
  const suppressionAlerts: SuppressionAlert[] = [];

  let sitesUp = 0;
  let sitesDown = 0;
  const sitesTotal = MONITORED_SITES.length;

  for (const history of uptimeHistories) {
    if (history.current.isUp) {
      sitesUp++;
    } else {
      sitesDown++;

      if (history.downSince) {
        const downSinceDays = Math.floor(
          (Date.now() - new Date(history.downSince).getTime()) / (1000 * 60 * 60 * 24),
        );
        const alert = await checkSiteDown(history.hostname, downSinceDays);
        if (alert) suppressionAlerts.push(alert);
      }
    }
  }

  const criticalDown = uptimeHistories.filter((h) => {
    const site = MONITORED_SITES.find((s) => s.hostname === h.hostname);
    return site?.critical && !h.current.isUp;
  });

  const captureAlerts = suppressionAlerts.filter((a) => a.severity === 'capture');
  const driftAlerts = suppressionAlerts.filter((a) => a.severity === 'drift');

  const { overallStatus, reason } = determineOverallStatus({
    criticalDown,
    captureAlerts,
    driftAlerts,
    sitesDown,
    sitesTotal,
    suppressionAlerts,
  });

  return {
    sitesUp,
    sitesDown,
    sitesTotal,
    suppressionAlerts,
    missingReports: [],
    overallStatus,
    reason,
  };
}
