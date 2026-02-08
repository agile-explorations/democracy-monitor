import type { SuppressionAlert } from '@/lib/types/resilience';

export async function checkSiteDown(
  hostname: string,
  downSinceDays: number,
): Promise<SuppressionAlert | null> {
  if (downSinceDays >= 7) {
    return {
      url: `https://${hostname}`,
      type: 'site_down',
      severity: downSinceDays >= 30 ? 'capture' : 'drift',
      message: `${hostname} has been down for ${downSinceDays} days`,
      detectedAt: new Date().toISOString(),
    };
  }

  if (downSinceDays >= 1) {
    return {
      url: `https://${hostname}`,
      type: 'site_down',
      severity: 'warning',
      message: `${hostname} has been down for ${downSinceDays} day${downSinceDays !== 1 ? 's' : ''}`,
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}
