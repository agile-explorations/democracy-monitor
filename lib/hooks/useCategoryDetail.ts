import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import type { WeekExplanation } from '@/lib/types/explanation';
import type { ConvergenceSynthesis } from '@/lib/types/structural';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export type TimeRangePreset = '3mo' | '6mo' | '1yr' | 'all';

function presetToWeekCount(preset: TimeRangePreset, totalWeeks: number): number {
  switch (preset) {
    case '3mo':
      return 13;
    case '6mo':
      return 26;
    case '1yr':
      return 52;
    case 'all':
      return totalWeeks;
  }
}

/** Shape of a row from /api/history/weekly-scores */
export interface WeeklyRow {
  weekOf: string;
  totalSeverity: number;
  documentCount: number;
  avgSeverityPerDoc: number;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  convergenceScore: number | null;
  convergenceDetail: ConvergenceSynthesis | null;
}

interface WeekData {
  layers: CategoryDetailLatestWeek | null;
  explanation: WeekExplanation | null;
  narrative: { expert: string; public: string } | null;
}

export interface CategoryDetailState {
  weeklyData: WeeklyRow[];
  baseline: { avg: number; stddev: number };
  title: string;
  convergenceStatus: ConvergenceSynthesis | null;
  dataCoverage: number | null;
  rangePreset: TimeRangePreset;
  brushStartIndex: number | undefined;
  brushEndIndex: number | undefined;
  rangeLabel: string;
  selectedWeek: string | null;
  weekData: WeekData | null;
  weekLoading: boolean;
  setRangePreset: (p: TimeRangePreset) => void;
  setBrushRange: (start: number, end: number) => void;
  selectWeek: (week: string | null) => void;
  loading: boolean;
}

export function useCategoryDetail(key: string | undefined): CategoryDetailState {
  const [weeklyData, setWeeklyData] = useState<WeeklyRow[]>([]);
  const [baseline, setBaseline] = useState({ avg: 0, stddev: 0 });
  const [title, setTitle] = useState('');
  const [convergenceStatus, setConvergenceStatus] = useState<ConvergenceSynthesis | null>(null);
  const [dataCoverage, setDataCoverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Range state
  const [rangePreset, setRangePreset] = useState<TimeRangePreset>('6mo');
  const [brushStartIndex, setBrushStartIndex] = useState<number | undefined>(undefined);
  const [brushEndIndex, setBrushEndIndex] = useState<number | undefined>(undefined);

  // Week selection
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);

  // Initial data load
  useEffect(() => {
    if (!key) return;

    async function loadData() {
      try {
        const [weeklyRes, detailRes] = await Promise.all([
          fetch(`/api/history/weekly-scores?category=${key}`),
          fetch(`/api/category/${key}`),
        ]);

        if (weeklyRes.ok) {
          const rows: WeeklyRow[] = await weeklyRes.json();
          setWeeklyData(rows);
        }

        if (detailRes.ok) {
          const detail = await detailRes.json();
          setTitle(detail.title ?? '');
          setBaseline(detail.baseline ?? { avg: 0, stddev: 0 });
          setConvergenceStatus(detail.latestWeek?.convergenceDetail ?? null);
          setDataCoverage(detail.assessment?.dataCoverage ?? null);
        }
      } catch (err) {
        console.error('Failed to load category detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [key]);

  // Apply range preset when weekly data changes or preset changes
  useEffect(() => {
    if (weeklyData.length === 0) return;
    const weeks = presetToWeekCount(rangePreset, weeklyData.length);
    const start = Math.max(0, weeklyData.length - weeks);
    const end = weeklyData.length - 1;
    setBrushStartIndex(start);
    setBrushEndIndex(end);
  }, [rangePreset, weeklyData.length]);

  const setBrushRange = useCallback((start: number, end: number) => {
    setBrushStartIndex(start);
    setBrushEndIndex(end);
  }, []);

  // Range label
  const rangeLabel = useMemo(() => {
    if (weeklyData.length === 0) return '';
    const si = brushStartIndex ?? 0;
    const ei = brushEndIndex ?? weeklyData.length - 1;
    const startWeek = weeklyData[si]?.weekOf;
    const endWeek = weeklyData[ei]?.weekOf;
    if (!startWeek || !endWeek) return '';
    return `${formatWeekLabel(startWeek)} \u2013 ${formatWeekLabel(endWeek)}`;
  }, [weeklyData, brushStartIndex, brushEndIndex]);

  // Load week-specific data when a week is selected
  const selectWeek = useCallback(
    (week: string | null) => {
      setSelectedWeek(week);
      if (!week || !key) {
        setWeekData(null);
        return;
      }

      setWeekLoading(true);
      Promise.all([
        fetch(`/api/category/${key}?weekOf=${week}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/explain/week?category=${key}&weekOf=${week}&top=200`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`/api/narratives/${key}?weekOf=${week}`).then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([catData, explanation, narrative]) => {
          setWeekData({
            layers: catData?.latestWeek ?? null,
            explanation,
            narrative,
          });
        })
        .catch((err) => {
          console.error('Failed to load week detail:', err);
          setWeekData(null);
        })
        .finally(() => setWeekLoading(false));
    },
    [key],
  );

  return {
    weeklyData,
    baseline,
    title,
    convergenceStatus,
    dataCoverage,
    rangePreset,
    brushStartIndex,
    brushEndIndex,
    rangeLabel,
    selectedWeek,
    weekData,
    weekLoading,
    setRangePreset,
    setBrushRange,
    selectWeek,
    loading,
  };
}
