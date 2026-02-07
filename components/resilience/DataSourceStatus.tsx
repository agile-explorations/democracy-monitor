import { useEffect, useState } from 'react';
import { UptimeIndicator } from '@/components/dashboard/UptimeIndicator';
import { Card } from '@/components/ui/Card';
import type { UptimeHistory } from '@/lib/types/resilience';

interface StatusData {
  sites: UptimeHistory[];
  availability: {
    sitesUp: number;
    sitesDown: number;
    sitesTotal: number;
    overallStatus: string;
    reason: string;
  };
}

export function DataSourceStatus() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/uptime/status');
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Silently fail — uptime is supplementary
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const { availability, sites } = data;
  const downSites = sites.filter((s) => !s.current.isUp);

  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-slate-900">
            Data Source Status{' '}
            <span className="font-normal text-slate-400">(website availability)</span>
          </h4>
          <div className="flex gap-1">
            {sites.map((site) => (
              <UptimeIndicator key={site.hostname} site={site} compact />
            ))}
          </div>
          <span className="text-xs text-slate-500 ml-auto">
            {availability.sitesUp}/{availability.sitesTotal} up
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>

        {downSites.length > 0 && !expanded && (
          <p className="text-xs text-red-600">
            {downSites.map((s) => s.name).join(', ')} — currently down
          </p>
        )}

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {sites.map((site) => (
              <UptimeIndicator key={site.hostname} site={site} />
            ))}
            <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
              {availability.reason}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
