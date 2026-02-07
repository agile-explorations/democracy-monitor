import type { InformationAvailabilityStatus, SuppressionAlert } from '@/lib/types/resilience';
import type { StatusLevel } from '@/lib/types';
import { MONITORED_SITES } from '@/lib/data/monitored-sites';
import { getUptimeHistory } from './uptime-service';
import { checkSiteDown } from './suppression-detection';

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

      // Check if it's been down long enough to raise an alert
      if (history.downSince) {
        const downSinceDays = Math.floor(
          (Date.now() - new Date(history.downSince).getTime()) / (1000 * 60 * 60 * 24),
        );
        const alert = await checkSiteDown(history.hostname, downSinceDays);
        if (alert) suppressionAlerts.push(alert);
      }
    }
  }

  // Determine overall status based on escalation rules
  const criticalSites = MONITORED_SITES.filter((s) => s.critical);
  const criticalDown = uptimeHistories.filter((h) => {
    const site = MONITORED_SITES.find((s) => s.hostname === h.hostname);
    return site?.critical && !h.current.isUp;
  });

  const captureAlerts = suppressionAlerts.filter((a) => a.severity === 'capture');
  const driftAlerts = suppressionAlerts.filter((a) => a.severity === 'drift');

  let overallStatus: StatusLevel;
  let reason: string;

  if (captureAlerts.length > 0 || criticalDown.length >= 3) {
    overallStatus = 'Capture';
    reason =
      captureAlerts.length > 0
        ? `Critical information suppression detected: ${captureAlerts[0].message}`
        : `${criticalDown.length} critical government sites are down`;
  } else if (driftAlerts.length > 0 || criticalDown.length >= 1) {
    overallStatus = 'Drift';
    reason =
      criticalDown.length > 0
        ? `${criticalDown.length} critical site${criticalDown.length > 1 ? 's' : ''} down: ${criticalDown.map((c) => c.name).join(', ')}`
        : `Information availability concerns: ${driftAlerts[0].message}`;
  } else if (sitesDown > 0 || suppressionAlerts.length > 0) {
    overallStatus = 'Warning';
    reason =
      sitesDown > 0
        ? `${sitesDown} government site${sitesDown > 1 ? 's' : ''} currently unreachable`
        : `Minor availability concerns detected`;
  } else {
    overallStatus = 'Stable';
    reason = `All ${sitesTotal} monitored government sites are accessible`;
  }

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
