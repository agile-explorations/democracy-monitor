import React, { useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { CATEGORIES } from '@/lib/data/categories';
import type { IntentAssessment, GovernanceCategory } from '@/lib/types/intent';
import { getCrossReference } from '@/lib/services/cross-reference-service';
import type { StatusLevel } from '@/lib/types';
import { CategoryCard } from '@/components/dashboard/CategoryCard';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFooter } from '@/components/dashboard/DashboardFooter';
import { StatusLegend } from '@/components/dashboard/StatusLegend';
import { IntentSection } from '@/components/intent/IntentSection';
import { SystemHealthOverview } from '@/components/integration/SystemHealthOverview';
import { CrossSectionBanner } from '@/components/integration/CrossSectionBanner';
import { DataSourceStatus } from '@/components/resilience/DataSourceStatus';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function ExecutivePowerDriftDashboard() {
  const [refreshMs, setRefreshMs] = useLocalStorage<number>('epd.refresh', WEEK);
  const [statusMap, setStatusMap] = useLocalStorage<Record<string, string>>('epd.status', {});
  const [lastTick, setLastTick] = useState<number>(Date.now());
  const [intentAssessment, setIntentAssessment] = useState<IntentAssessment | null>(null);

  const setStatus = (k: string, v: string) => setStatusMap({ ...statusMap, [k]: v });

  const saved = useRef(() => setLastTick(Date.now()));
  useEffect(() => { saved.current = () => setLastTick(Date.now()); }, []);
  useEffect(() => {
    const id = setInterval(() => saved.current(), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  // Compute cross-references for each category
  const getCrossRef = (categoryKey: string) => {
    if (!intentAssessment) return null;
    const status = statusMap[categoryKey] as StatusLevel | undefined;
    if (!status || !['Stable', 'Warning', 'Drift', 'Capture'].includes(status)) return null;
    return getCrossReference(intentAssessment.overall as GovernanceCategory, status);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <DashboardHeader refreshMs={refreshMs} setRefreshMs={setRefreshMs} />

        {/* Navigation */}
        <nav className="flex gap-4 text-xs text-slate-500">
          <a href="/methodology" className="hover:text-blue-600 underline">Methodology</a>
          <a href="/sources" className="hover:text-blue-600 underline">Data Sources</a>
          <a href="/digest" className="hover:text-blue-600 underline">Daily Digests</a>
        </nav>

        <StatusLegend />

        {/* System Health Overview */}
        <SystemHealthOverview statusMap={statusMap} />

        {/* Cross-section analysis banner */}
        <CrossSectionBanner intentAssessment={intentAssessment} statusMap={statusMap} />

        {/* Data Source Status */}
        <DataSourceStatus />

        {/* Section 1: Administration's Intent */}
        <IntentSection onAssessmentLoaded={setIntentAssessment} />

        {/* Section 2: System Drift — Institutional Health */}
        <h2 className="text-lg font-bold text-slate-900 pt-2">Section 2: Institutional Health (System Drift)</h2>

        <div className="grid grid-cols-1 gap-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.key + '-' + lastTick}>
              <CategoryCard
                cat={cat}
                statusMap={statusMap}
                setStatus={setStatus}
                crossRef={getCrossRef(cat.key)}
              />
            </div>
          ))}
        </div>

        <DashboardFooter lastTick={lastTick} />
      </div>
    </div>
  );
}
