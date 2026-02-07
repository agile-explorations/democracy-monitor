import React, { useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { CATEGORIES } from '@/lib/data/categories';
import { CategoryCard } from '@/components/dashboard/CategoryCard';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFooter } from '@/components/dashboard/DashboardFooter';
import { StatusLegend } from '@/components/dashboard/StatusLegend';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function ExecutivePowerDriftDashboard() {
  const [refreshMs, setRefreshMs] = useLocalStorage<number>('epd.refresh', WEEK);
  const [statusMap, setStatusMap] = useLocalStorage<Record<string, string>>('epd.status', {});
  const [lastTick, setLastTick] = useState<number>(Date.now());

  const setStatus = (k: string, v: string) => setStatusMap({ ...statusMap, [k]: v });

  const saved = useRef(() => setLastTick(Date.now()));
  useEffect(() => { saved.current = () => setLastTick(Date.now()); }, []);
  useEffect(() => {
    const id = setInterval(() => saved.current(), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <DashboardHeader refreshMs={refreshMs} setRefreshMs={setRefreshMs} />
        <StatusLegend />

        <div className="grid grid-cols-1 gap-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.key + '-' + lastTick}>
              <CategoryCard cat={cat} statusMap={statusMap} setStatus={setStatus} />
            </div>
          ))}
        </div>

        <DashboardFooter lastTick={lastTick} />
      </div>
    </div>
  );
}
