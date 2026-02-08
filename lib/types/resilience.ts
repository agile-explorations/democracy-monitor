export interface MonitoredSite {
  hostname: string;
  name: string;
  category: string;
  critical: boolean;
  expectedContentPatterns?: string[];
}

export interface UptimeResult {
  hostname: string;
  status: number;
  responseTimeMs: number | null;
  isUp: boolean;
  checkedAt: string;
  error?: string;
}

export interface UptimeHistory {
  hostname: string;
  name: string;
  current: UptimeResult;
  uptime24h: number;
  uptime7d: number;
  downSince: string | null;
}

export interface SuppressionAlert {
  url: string;
  type: 'content_removed' | 'content_changed' | 'site_down' | 'report_missing';
  severity: 'warning' | 'drift' | 'capture';
  message: string;
  detectedAt: string;
  previousHash?: string;
  currentHash?: string;
}

export interface ExpectedReport {
  name: string;
  agency: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  url: string;
  lastExpected?: string;
}

export interface InformationAvailabilityStatus {
  sitesUp: number;
  sitesDown: number;
  sitesTotal: number;
  suppressionAlerts: SuppressionAlert[];
  missingReports: ExpectedReport[];
  overallStatus: 'Stable' | 'Warning' | 'Drift' | 'Capture';
  reason: string;
}
