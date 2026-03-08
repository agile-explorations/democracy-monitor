import { useEffect, useState } from 'react';
import type { EditorialRecord } from '@/lib/types';

interface NarrativeData {
  expert: string;
  public: string;
}

interface LandingNarrativesState {
  termNarrative: NarrativeData | null;
  termNarrativeLoading: boolean;
  termEditorial: EditorialRecord | null;
  weeklyNarrative: NarrativeData | null;
  weeklyNarrativeLoading: boolean;
  weeklyEditorial: EditorialRecord | null;
}

async function fetchNarrative(
  url: string,
): Promise<{ narrative: NarrativeData | null; editorial: EditorialRecord | null }> {
  const [narRes, edRes] = await Promise.all([fetch(url), fetch(`${url}&editorial=true`)]);
  const narData = narRes.ok ? await narRes.json() : null;
  const edData = edRes.ok ? await edRes.json() : null;
  const hasContent = narData?.expert || narData?.public;
  const hasEditorial = edData?.expertDraft || edData?.feedback;
  return {
    narrative: hasContent ? narData : null,
    editorial: hasEditorial ? edData : null,
  };
}

/**
 * Fetches term summary and weekly overview narratives for the landing page.
 *
 * - Term summary: fetched once using the latest available week.
 * - Weekly overview: re-fetched when the selected week changes.
 */
export function useLandingNarratives(
  latestWeek: string | null,
  selectedWeek: string | null,
): LandingNarrativesState {
  const [termNarrative, setTermNarrative] = useState<NarrativeData | null>(null);
  const [termEditorial, setTermEditorial] = useState<EditorialRecord | null>(null);
  const [termNarrativeLoading, setTermNarrativeLoading] = useState(false);
  const [weeklyNarrative, setWeeklyNarrative] = useState<NarrativeData | null>(null);
  const [weeklyEditorial, setWeeklyEditorial] = useState<EditorialRecord | null>(null);
  const [weeklyNarrativeLoading, setWeeklyNarrativeLoading] = useState(false);

  // Fetch term summary narrative when the latest week is known
  useEffect(() => {
    if (!latestWeek) return;
    let cancelled = false;
    setTermNarrativeLoading(true);
    (async () => {
      try {
        const result = await fetchNarrative(`/api/narratives/term-summary?weekOf=${latestWeek}`);
        if (!cancelled) {
          setTermNarrative(result.narrative);
          setTermEditorial(result.editorial);
        }
      } catch {
        if (!cancelled) {
          setTermNarrative(null);
          setTermEditorial(null);
        }
      } finally {
        if (!cancelled) setTermNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latestWeek]);

  // Fetch weekly overview narrative when a week is selected
  useEffect(() => {
    const week = selectedWeek ?? latestWeek;
    if (!week) return;
    let cancelled = false;
    setWeeklyNarrativeLoading(true);
    (async () => {
      try {
        const result = await fetchNarrative(`/api/narratives/overview?weekOf=${week}`);
        if (!cancelled) {
          setWeeklyNarrative(result.narrative);
          setWeeklyEditorial(result.editorial);
        }
      } catch {
        if (!cancelled) {
          setWeeklyNarrative(null);
          setWeeklyEditorial(null);
        }
      } finally {
        if (!cancelled) setWeeklyNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, latestWeek]);

  return {
    termNarrative,
    termNarrativeLoading,
    termEditorial,
    weeklyNarrative,
    weeklyNarrativeLoading,
    weeklyEditorial,
  };
}
