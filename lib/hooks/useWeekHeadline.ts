import { useEffect, useState } from 'react';

/** Fetch the one-line event headline for a week (#539); null while loading/absent. */
export function useWeekHeadline(weekOf: string | null): string | null {
  const [headline, setHeadline] = useState<string | null>(null);

  useEffect(() => {
    if (!weekOf) {
      setHeadline(null);
      return;
    }
    let cancelled = false;
    setHeadline(null);
    (async () => {
      try {
        const res = await fetch(`/api/week-headline?week=${weekOf}`);
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setHeadline(data?.headline?.headline ?? null);
      } catch {
        // keep null — strip falls back gracefully
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekOf]);

  return headline;
}
