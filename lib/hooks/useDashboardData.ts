import { useEffect, useState } from 'react';
import type { CategorySummary } from '@/lib/services/category-summary-service';
import type { MetaAssessment } from '@/lib/services/meta-assessment-service';
import type { SourceHealthCheck, SourceHealthSummary } from '@/lib/services/source-health-service';
import type { FetchWeekHealth, OverviewSummary } from '@/lib/types/overview';

export interface DashboardData {
  categories: CategorySummary[];
  overview: OverviewSummary | null;
  meta: MetaAssessment | null;
  healthSummary: SourceHealthSummary | null;
  fetchTimeline: FetchWeekHealth[];
  lastCheckedAt: string | null;
  documentCount: number | null;
  fullTextCount: number | null;
  loading: boolean;
}

/** Fetches all initial dashboard data in parallel. */
export function useDashboardData(): DashboardData {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [meta, setMeta] = useState<MetaAssessment | null>(null);
  const [healthSummary, setHealthSummary] = useState<SourceHealthSummary | null>(null);
  const [fetchTimeline, setFetchTimeline] = useState<FetchWeekHealth[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [fullTextCount, setFullTextCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Corpus counts load independently — a slow stats endpoint must never
        // block the dashboard (2026-07-25 incident: the whole homepage hung on
        // this fetch inside Promise.all).
        fetch('/api/stats/document-count')
          .then(async (r) => {
            if (!r.ok) return;
            const { total, fullText } = await r.json();
            setDocumentCount(total);
            if (typeof fullText === 'number') setFullTextCount(fullText);
          })
          .catch(() => {});

        const [catRes, overviewRes, metaRes, srcRes, timelineRes] = await Promise.all([
          fetch('/api/categories/summary'),
          fetch('/api/overview/summary'),
          fetch('/api/health/meta'),
          fetch('/api/health/sources'),
          fetch('/api/health/fetch-timeline'),
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (metaRes.ok) setMeta(await metaRes.json());
        if (timelineRes.ok) setFetchTimeline(await timelineRes.json());
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

  return {
    categories,
    overview,
    meta,
    healthSummary,
    fetchTimeline,
    lastCheckedAt,
    documentCount,
    fullTextCount,
    loading,
  };
}
