import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorialRecord } from '@/lib/types';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import type { WeekExplanation } from '@/lib/types/explanation';
import type { ConvergenceSynthesis } from '@/lib/types/structural';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export type TimeRangePreset = '3mo' | '6mo' | '1yr' | 'all';

export interface CategoryDetailInitialParams {
  weekOf?: string;
  from?: string;
  to?: string;
}

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

/** Find the closest weekOf in data to the target date string */
function findClosestWeek(data: WeeklyRow[], target: string): string | null {
  if (data.length === 0) return null;
  let best = data[0].weekOf;
  let bestDist = Math.abs(new Date(target).getTime() - new Date(best).getTime());
  for (let i = 1; i < data.length; i++) {
    const dist = Math.abs(new Date(target).getTime() - new Date(data[i].weekOf).getTime());
    if (dist < bestDist) {
      bestDist = dist;
      best = data[i].weekOf;
    }
  }
  return best;
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
  editorial: EditorialRecord | null;
}

export interface CategoryDetailState {
  weeklyData: WeeklyRow[];
  baseline: { avg: number; stddev: number };
  title: string;
  convergenceStatus: ConvergenceSynthesis | null;
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

export function useCategoryDetail(
  key: string | undefined,
  initialParams?: CategoryDetailInitialParams,
): CategoryDetailState {
  const [weeklyData, setWeeklyData] = useState<WeeklyRow[]>([]);
  const [baseline, setBaseline] = useState({ avg: 0, stddev: 0 });
  const [title, setTitle] = useState('');
  const [convergenceStatus, setConvergenceStatus] = useState<ConvergenceSynthesis | null>(null);
  const [loading, setLoading] = useState(true);

  // Range state
  const [rangePreset, setRangePreset] = useState<TimeRangePreset>('6mo');
  const [brushStartIndex, setBrushStartIndex] = useState<number | undefined>(undefined);
  const [brushEndIndex, setBrushEndIndex] = useState<number | undefined>(undefined);

  // Week selection
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);

  // Ref to read initialParams inside closures without adding as a dependency
  const initialParamsRef = useRef(initialParams);
  initialParamsRef.current = initialParams;

  // When true, the preset effect skips one recalculation to avoid
  // overwriting brush indices set by initial params
  const skipPresetRecalc = useRef(false);

  // Initial data load
  useEffect(() => {
    if (!key) return;

    async function loadData() {
      try {
        const [weeklyRes, detailRes] = await Promise.all([
          fetch(`/api/history/weekly-scores?category=${key}&from=2025-01-20`),
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
    if (skipPresetRecalc.current) {
      skipPresetRecalc.current = false;
      return;
    }
    const weeks = presetToWeekCount(rangePreset, weeklyData.length);
    const start = Math.max(0, weeklyData.length - weeks);
    const end = weeklyData.length - 1;
    setBrushStartIndex(start);
    setBrushEndIndex(end);
  }, [rangePreset, weeklyData.length]);

  // Apply initial from/to params after the chart has mounted with
  // default brush. Recharts Brush renders correctly for prop *changes*
  // but not for initial controlled values, so we let it mount with
  // the default 6mo range first, then apply the custom range as a
  // deferred update on the next animation frame.
  const initialRangeApplied = useRef(false);
  useEffect(() => {
    if (weeklyData.length === 0 || initialRangeApplied.current) return;
    const params = initialParamsRef.current;
    if (!params?.from || !params?.to) return;

    initialRangeApplied.current = true;
    const id = requestAnimationFrame(() => {
      const fromIdx = weeklyData.findIndex((r) => r.weekOf >= params.from!);
      const toIdx = weeklyData.findIndex((r) => r.weekOf > params.to!);
      setBrushStartIndex(fromIdx >= 0 ? fromIdx : 0);
      setBrushEndIndex(toIdx >= 0 ? toIdx - 1 : weeklyData.length - 1);
      skipPresetRecalc.current = true;
      setRangePreset('all');
    });
    return () => cancelAnimationFrame(id);
  }, [weeklyData]);

  // Apply initial weekOf selection — must run after selectWeek is defined
  const initialWeekApplied = useRef(false);

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

  // Load week-specific data when a week is selected.
  // The chart ReferenceLine matches on the exact weekOf string in data,
  // so we snap to the closest available week for the visual indicator
  // while using the original date for API fetches.
  const selectWeek = useCallback(
    (week: string | null) => {
      if (!week || !key) {
        setSelectedWeek(null);
        setWeekData(null);
        return;
      }

      // Snap to nearest week in data for the chart indicator
      const chartWeek = findClosestWeek(weeklyData, week);
      setSelectedWeek(chartWeek ?? week);

      setWeekLoading(true);
      Promise.all([
        fetch(`/api/category/${key}?weekOf=${week}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/explain/week?category=${key}&weekOf=${week}&top=20`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`/api/narratives/${key}?weekOf=${week}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/narratives/${key}?weekOf=${week}&editorial=true`).then((r) =>
          r.ok ? r.json() : null,
        ),
      ])
        .then(([catData, explanation, narrative, editorial]) => {
          setWeekData({
            layers: catData?.latestWeek ?? null,
            explanation,
            narrative,
            editorial: editorial?.expertDraft || editorial?.feedback ? editorial : null,
          });
        })
        .catch((err) => {
          console.error('Failed to load week detail:', err);
          setWeekData(null);
        })
        .finally(() => setWeekLoading(false));
    },
    [key, weeklyData],
  );

  // Apply initial weekOf after selectWeek is available and data loaded
  useEffect(() => {
    if (initialWeekApplied.current || !initialParams?.weekOf) return;
    if (weeklyData.length === 0) return;
    initialWeekApplied.current = true;
    selectWeek(initialParams.weekOf);
  }, [weeklyData, initialParams, selectWeek]);

  return {
    weeklyData,
    baseline,
    title,
    convergenceStatus,
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
