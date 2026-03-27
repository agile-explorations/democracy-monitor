import { useCallback, useRef, useState } from 'react';

interface ShiftLabels {
  fromTerms: string[];
  toTerms: string[];
}

/** Cache fetched shift labels in-memory to avoid refetching on re-hover. */
const shiftLabelCache = new Map<string, ShiftLabels | 'empty'>();

/**
 * Heatmap cell tooltip with lazy-loaded drift shift labels.
 * Shows existing metrics immediately on hover. Fetches shift labels
 * from /api/data/thematic-detail?labelsOnly=true and caches in-memory.
 */
export function HeatmapTooltip({
  category,
  week,
  tooltipText,
  children,
}: {
  category: string;
  week: string;
  tooltipText: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [labels, setLabels] = useState<ShiftLabels | 'empty' | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLabels = useCallback(async () => {
    const key = `${category}:${week}`;
    const cached = shiftLabelCache.get(key);
    if (cached) {
      setLabels(cached);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data/thematic-detail?category=${encodeURIComponent(category)}&weekOf=${encodeURIComponent(week)}&labelsOnly=true`,
      );
      if (res.ok) {
        const data = await res.json();
        const sl = data.shiftLabels as ShiftLabels;
        const value = sl.fromTerms.length > 0 || sl.toTerms.length > 0 ? sl : 'empty';
        shiftLabelCache.set(key, value);
        setLabels(value);
      }
    } catch {
      // Silently fail — tooltip still shows metrics
    } finally {
      setLoading(false);
    }
  }, [category, week]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        setVisible(true);
        if (!labels && !loading) fetchLabels();
      }}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded shadow-lg text-[10px] leading-relaxed whitespace-pre-line pointer-events-none bg-dm-card border border-dm-border text-dm-text-primary min-w-[180px] max-w-[280px]">
          {tooltipText}
          {loading && <p className="text-dm-muted italic mt-1">Loading drift labels…</p>}
          {labels && labels !== 'empty' && (
            <p className="mt-1 border-t border-dm-border pt-1">
              {labels.fromTerms.length > 0 && (
                <>
                  <span className="text-dm-muted">From: </span>
                  <span className="font-medium">{labels.fromTerms.join(', ')}</span>
                </>
              )}
              {labels.fromTerms.length > 0 && labels.toTerms.length > 0 && (
                <span className="text-dm-muted"> → </span>
              )}
              {labels.toTerms.length > 0 && (
                <>
                  <span className="text-dm-muted">To: </span>
                  <span className="font-medium">{labels.toTerms.join(', ')}</span>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
