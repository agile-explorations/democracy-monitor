import { useEffect, useState } from 'react';
import type { EditorialRecord } from '@/lib/types';

interface NarrativeData {
  expert: string;
  public: string;
}

export interface SignificantWeekLink {
  weekOf: string;
  reasons: { type: string; detail: string }[];
  rank: number;
}

interface LandingNarrativesState {
  termNarrative: NarrativeData | null;
  termWeekOf: string | null;
  termNarrativeLoading: boolean;
  termEditorial: EditorialRecord | null;
  significantWeeks: SignificantWeekLink[];
  weeklyNarrative: NarrativeData | null;
  weeklyNarrativeLoading: boolean;
  weeklyEditorial: EditorialRecord | null;
}

async function fetchNarrative(
  url: string,
): Promise<{ narrative: NarrativeData | null; editorial: EditorialRecord | null }> {
  const sep = url.includes('?') ? '&' : '?';
  const [narRes, edRes] = await Promise.all([fetch(url), fetch(`${url}${sep}editorial=true`)]);
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
 * Fetches narratives for the landing page.
 *
 * - Term summary: the single living document — fetched once, week-independent.
 * - Significant weeks: deterministic notable-week index — fetched once.
 * - Weekly overview: re-fetched when the selected week changes.
 */
export function useLandingNarratives(
  latestWeek: string | null,
  selectedWeek: string | null,
): LandingNarrativesState {
  const [termNarrative, setTermNarrative] = useState<NarrativeData | null>(null);
  const [termWeekOf, setTermWeekOf] = useState<string | null>(null);
  const [termEditorial, setTermEditorial] = useState<EditorialRecord | null>(null);
  const [termNarrativeLoading, setTermNarrativeLoading] = useState(false);
  const [significantWeeks, setSignificantWeeks] = useState<SignificantWeekLink[]>([]);
  const [weeklyNarrative, setWeeklyNarrative] = useState<NarrativeData | null>(null);
  const [weeklyEditorial, setWeeklyEditorial] = useState<EditorialRecord | null>(null);
  const [weeklyNarrativeLoading, setWeeklyNarrativeLoading] = useState(false);

  // Fetch the living term summary and significant-weeks index once
  useEffect(() => {
    let cancelled = false;
    setTermNarrativeLoading(true);
    (async () => {
      try {
        const [result, swRes] = await Promise.all([
          fetchNarrative('/api/narratives/term-summary'),
          fetch('/api/significant-weeks'),
        ]);
        const swData = swRes.ok ? await swRes.json() : null;
        if (!cancelled) {
          setTermNarrative(result.narrative);
          setTermWeekOf((result.narrative as { weekOf?: string } | null)?.weekOf ?? null);
          setTermEditorial(result.editorial);
          setSignificantWeeks(Array.isArray(swData?.weeks) ? swData.weeks : []);
        }
      } catch {
        if (!cancelled) {
          setTermNarrative(null);
          setTermWeekOf(null);
          setTermEditorial(null);
          setSignificantWeeks([]);
        }
      } finally {
        if (!cancelled) setTermNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    termWeekOf,
    termNarrativeLoading,
    termEditorial,
    significantWeeks,
    weeklyNarrative,
    weeklyNarrativeLoading,
    weeklyEditorial,
  };
}
