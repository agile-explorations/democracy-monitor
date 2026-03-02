import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CategorySummary } from '@/lib/services/category-summary-service';

export interface WeekSelectionState {
  selectedWeek: string | null;
  weekLoading: boolean;
  displayedCategories: CategorySummary[];
  availableWeeks: string[];
  handleWeekHeaderClick: (week: string) => void;
  handleWeekChange: (week: string) => void;
}

/**
 * Manages week selection state for the landing page.
 * Fetches week-specific category data when a non-latest week is selected.
 */
export function useWeekSelection(
  categories: CategorySummary[],
  filteredWeeks: string[],
): WeekSelectionState {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekCategories, setWeekCategories] = useState<CategorySummary[] | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);

  // Reset selectedWeek when available weeks change (brush/preset change)
  useEffect(() => {
    if (filteredWeeks.length === 0) return;
    setSelectedWeek((prev) => {
      if (prev && filteredWeeks.includes(prev)) return prev;
      return filteredWeeks[filteredWeeks.length - 1];
    });
  }, [filteredWeeks]);

  // Determine the latest week from initial categories data
  const latestCategoryWeek = useMemo(() => {
    if (!categories.length) return null;
    const sparkline = categories[0]?.sparklineData;
    return sparkline?.[sparkline.length - 1]?.week ?? null;
  }, [categories]);

  // Fetch week-specific data when selectedWeek differs from initial load data
  useEffect(() => {
    if (!selectedWeek || selectedWeek === latestCategoryWeek) {
      setWeekCategories(null);
      return;
    }
    let cancelled = false;
    setWeekLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/categories/summary?week=${selectedWeek}`);
        const data = res.ok ? await res.json() : null;
        if (!cancelled && data) setWeekCategories(data);
      } catch {
        // Network error — keep existing data
      } finally {
        if (!cancelled) setWeekLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, latestCategoryWeek]);

  const handleWeekHeaderClick = useCallback((week: string) => setSelectedWeek(week), []);
  const handleWeekChange = useCallback((week: string) => setSelectedWeek(week), []);

  return {
    selectedWeek,
    weekLoading,
    displayedCategories: weekCategories ?? categories,
    availableWeeks: filteredWeeks,
    handleWeekHeaderClick,
    handleWeekChange,
  };
}
