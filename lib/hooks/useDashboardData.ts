import { useEffect, useState } from 'react';
import type { CategorySummary } from '@/lib/services/category-summary-service';
import type { MetaAssessment } from '@/lib/services/meta-assessment-service';
import type { SourceHealthCheck, SourceHealthSummary } from '@/lib/services/source-health-service';
import type { OverviewSummary } from '@/lib/types/overview';

export interface DashboardData {
  categories: CategorySummary[];
  overview: OverviewSummary | null;
  meta: MetaAssessment | null;
  healthSummary: SourceHealthSummary | null;
  lastCheckedAt: string | null;
  loading: boolean;
}

/** Fetches all initial dashboard data in parallel. */
export function useDashboardData(): DashboardData {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [meta, setMeta] = useState<MetaAssessment | null>(null);
  const [healthSummary, setHealthSummary] = useState<SourceHealthSummary | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [catRes, overviewRes, metaRes, srcRes] = await Promise.all([
          fetch('/api/categories/summary'),
          fetch('/api/overview/summary'),
          fetch('/api/health/meta'),
          fetch('/api/health/sources'),
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (metaRes.ok) setMeta(await metaRes.json());
        if (srcRes.ok) {
          const srcData = await srcRes.json();
          if (srcData.summary) setHealthSummary(srcData.summary);
          if (srcData.sources?.length) {
            const latest = (srcData.sources as SourceHealthCheck[]).reduce(
              (max: string, s: SourceHealthCheck) => (s.checkedAt > max ? s.checkedAt : max),
              srcData.sources[0].checkedAt,
            );
            setLastCheckedAt(latest);
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return { categories, overview, meta, healthSummary, lastCheckedAt, loading };
}
