import { useEffect, useState } from 'react';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import type { WeekExplanation } from '@/lib/types/explanation';

/** Shape of a row from /api/categories/summary */
export interface CategorySummary {
  category: string;
  title: string;
  status: string;
  insufficientData: boolean;
  convergenceStatus: string | null;
  structuralElevated: boolean;
  aiElevated: boolean;
  thematicElevated: boolean;
  decayWeightedScore: number;
  documentCount: number;
}

export interface WeekDetailState {
  categorySummaries: CategorySummary[];
  overviewNarrative: { expert: string; public: string } | null;
  explanation: WeekExplanation | null;
  layers: CategoryDetailLatestWeek | null;
  baseline: { avg: number; stddev: number };
  loading: boolean;
}

export function useWeekDetail(
  categoryKey: string | undefined,
  weekDate: string | undefined,
): WeekDetailState {
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);
  const [overviewNarrative, setOverviewNarrative] = useState<{
    expert: string;
    public: string;
  } | null>(null);
  const [explanation, setExplanation] = useState<WeekExplanation | null>(null);
  const [layers, setLayers] = useState<CategoryDetailLatestWeek | null>(null);
  const [baseline, setBaseline] = useState({ avg: 0, stddev: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!categoryKey || !weekDate) return;

    async function loadData() {
      try {
        const [summaryRes, overviewRes, explainRes, catRes] = await Promise.all([
          fetch(`/api/categories/summary?week=${weekDate}`),
          fetch(`/api/narratives/overview?weekOf=${weekDate}`),
          fetch(`/api/explain/week?category=${categoryKey}&weekOf=${weekDate}&top=200`),
          fetch(`/api/category/${categoryKey}?weekOf=${weekDate}`),
        ]);

        if (summaryRes.ok) setCategorySummaries(await summaryRes.json());
        if (overviewRes.ok) setOverviewNarrative(await overviewRes.json());
        if (explainRes.ok) setExplanation(await explainRes.json());
        if (catRes.ok) {
          const catData = await catRes.json();
          setBaseline(catData.baseline ?? { avg: 0, stddev: 0 });
          setLayers(catData.latestWeek ?? null);
        }
      } catch (err) {
        console.error('Failed to load week detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [categoryKey, weekDate]);

  return {
    categorySummaries,
    overviewNarrative,
    explanation,
    layers,
    baseline,
    loading,
  };
}
