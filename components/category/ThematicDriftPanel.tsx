import { useCallback, useEffect, useState } from 'react';
import type { ThematicDriftScore } from '@/lib/types/structural';

interface ShiftLabels {
  fromTerms: string[];
  toTerms: string[];
}

export interface ThematicDriftPanelProps {
  drift: ThematicDriftScore | null;
  readingLevel: 'summary' | 'detailed';
  category?: string;
  weekOf?: string;
}

function ShiftLabelsDisplay({ labels }: { labels: ShiftLabels }) {
  if (labels.fromTerms.length === 0 && labels.toTerms.length === 0) {
    return (
      <p className="text-[11px] text-dm-muted italic mt-3">
        Insufficient data for shift label computation.
      </p>
    );
  }
  return (
    <div className="mt-3 text-xs">
      <p className="text-dm-text-secondary">
        {labels.fromTerms.length > 0 && (
          <>
            <span className="text-dm-muted">Shifting from: </span>
            <span className="font-medium text-dm-text-primary">{labels.fromTerms.join(', ')}</span>
          </>
        )}
        {labels.fromTerms.length > 0 && labels.toTerms.length > 0 && (
          <span className="text-dm-muted mx-1.5">&rarr;</span>
        )}
        {labels.toTerms.length > 0 && (
          <>
            <span className="text-dm-muted">to: </span>
            <span className="font-medium text-dm-text-primary">{labels.toTerms.join(', ')}</span>
          </>
        )}
      </p>
    </div>
  );
}

export function ThematicDriftPanel({
  drift,
  readingLevel,
  category,
  weekOf,
}: ThematicDriftPanelProps) {
  const [shiftLabels, setShiftLabels] = useState<ShiftLabels | null>(null);
  const [loadingLabels, setLoadingLabels] = useState(false);

  const loadShiftLabels = useCallback(async () => {
    if (!category || !weekOf || loadingLabels || shiftLabels) return;
    setLoadingLabels(true);
    try {
      const res = await fetch(
        `/api/data/thematic-detail?category=${encodeURIComponent(category)}&weekOf=${encodeURIComponent(weekOf)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setShiftLabels(data.shiftLabels);
      }
    } finally {
      setLoadingLabels(false);
    }
  }, [category, weekOf, loadingLabels, shiftLabels]);

  useEffect(() => {
    if (readingLevel === 'detailed' && category && weekOf && drift) {
      loadShiftLabels();
    }
  }, [readingLevel, category, weekOf, drift, loadShiftLabels]);

  if (!drift) {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Thematic Drift (Layer 3)
        </h2>
        <p className="text-xs text-dm-muted italic">No thematic data available.</p>
      </section>
    );
  }

  if (readingLevel === 'summary') {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Thematic Drift (Layer 3)
        </h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-dm-text-secondary">
            Z-score:{' '}
            <span className="text-dm-text-primary font-mono">{drift.zScore.toFixed(2)}</span>
          </span>
          <span className="text-dm-text-secondary">
            Novel doc rate:{' '}
            <span className="text-dm-text-primary">
              {(drift.novelDocumentRate * 100).toFixed(1)}%
            </span>
          </span>
          {drift.bootstrap && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-dm-border text-dm-muted">
              Bootstrap
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        Thematic Drift (Layer 3)
      </h2>

      {drift.bootstrap && (
        <p className="text-[10px] px-2 py-1 rounded bg-dm-border/30 text-dm-muted mb-3 inline-block">
          Bootstrap period — insufficient history for full comparison
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-dm-muted">Centroid Distance</p>
          <p className="text-sm font-mono text-dm-text-primary">
            {drift.rollingCentroidDistance.toFixed(4)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Z-Score</p>
          <p className="text-sm font-mono text-dm-text-primary">{drift.zScore.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Novel Document Rate</p>
          <p className="text-sm text-dm-text-primary">
            {(drift.novelDocumentRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-dm-muted">Variance Ratio</p>
          <p className="text-sm font-mono text-dm-text-primary">{drift.varianceRatio.toFixed(3)}</p>
        </div>
        {drift.crossAdminDistance !== null && (
          <div>
            <p className="text-[11px] text-dm-muted">Cross-Admin Distance</p>
            <p className="text-sm font-mono text-dm-text-primary">
              {drift.crossAdminDistance.toFixed(4)}
            </p>
          </div>
        )}
      </div>

      {/* Shift labels */}
      {loadingLabels && <p className="text-[11px] text-dm-muted mt-3">Loading shift labels...</p>}
      {shiftLabels && <ShiftLabelsDisplay labels={shiftLabels} />}

      {/* Rolling window info */}
      <div className="text-[11px] text-dm-muted mt-3">
        Rolling window: {drift.rollingWindow.weeks} weeks &middot; Mean distance:{' '}
        {drift.rollingWindow.meanDistance.toFixed(4)} &middot; Std dev:{' '}
        {drift.rollingWindow.stdDev.toFixed(4)}
        {drift.crossAdminBaseline && (
          <span> &middot; Cross-admin baseline: {drift.crossAdminBaseline}</span>
        )}
      </div>
    </section>
  );
}
