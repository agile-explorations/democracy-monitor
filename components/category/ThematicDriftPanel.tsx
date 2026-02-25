import type { ThematicDriftScore } from '@/lib/types/structural';

export interface ThematicDriftPanelProps {
  drift: ThematicDriftScore | null;
  readingLevel: 'summary' | 'detailed';
}

export function ThematicDriftPanel({ drift, readingLevel }: ThematicDriftPanelProps) {
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

  // Summary mode
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

  // Detailed mode
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

      {/* Rolling window info */}
      <div className="text-[11px] text-dm-muted">
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
