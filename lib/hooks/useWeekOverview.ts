import { useEffect, useState } from 'react';

/** Shape of a row from /api/categories/summary */
export interface CategorySummary {
  category: string;
  title: string;
  convergenceStatus: string | null;
  structuralElevated: boolean;
  aiElevated: boolean;
  thematicElevated: boolean;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  documentCount: number;
}

export interface WeekOverviewState {
  categorySummaries: CategorySummary[];
  overviewNarrative: { expert: string; public: string } | null;
  loading: boolean;
}

export function useWeekOverview(weekDate: string | undefined): WeekOverviewState {
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);
  const [overviewNarrative, setOverviewNarrative] = useState<{
    expert: string;
    public: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekDate) return;

    async function loadData() {
      try {
        const [summaryRes, overviewRes] = await Promise.all([
          fetch(`/api/categories/summary?week=${weekDate}`),
          fetch(`/api/narratives/overview?weekOf=${weekDate}`),
        ]);

        if (summaryRes.ok) setCategorySummaries(await summaryRes.json());
        if (overviewRes.ok) setOverviewNarrative(await overviewRes.json());
      } catch (err) {
        console.error('Failed to load week overview:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [weekDate]);

  return { categorySummaries, overviewNarrative, loading };
}
