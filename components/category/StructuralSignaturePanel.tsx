import {
  STRUCTURAL_ANOMALY_THRESHOLD,
  STRUCTURAL_DIMENSION_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { StructuralScore } from '@/lib/types/structural';

export interface StructuralSignaturePanelProps {
  score: StructuralScore | null;
  readingLevel: 'summary' | 'detailed';
}

const DIMENSION_LABELS: Record<string, string> = {
  volume: 'Volume',
  typeComposition: 'Type Composition',
  functionalDistribution: 'Functional Distribution',
  agencyActivity: 'Agency Activity',
  publicationTempo: 'Publication Tempo',
  sourceConvergence: 'Source Convergence',
};

const DIMENSION_ORDER = [
  'volume',
  'typeComposition',
  'functionalDistribution',
  'agencyActivity',
  'publicationTempo',
  'sourceConvergence',
] as const;

const DRIFT_ARROWS: Record<string, string> = {
  increasing: '\u2191',
  decreasing: '\u2193',
  stable: '\u2192',
};

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const elevated = value >= STRUCTURAL_DIMENSION_ELEVATED;
  return (
    <div className="w-16 h-1.5 bg-dm-border/50 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${elevated ? 'bg-status-drift' : 'bg-dm-accent'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StructuralSignaturePanel({ score, readingLevel }: StructuralSignaturePanelProps) {
  if (!score) {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Structural Signature (Layer 1)
        </h2>
        <p className="text-xs text-dm-muted italic">No structural data available.</p>
      </section>
    );
  }

  const anomalousClass = score.anomalous ? 'text-status-drift' : 'text-dm-text-primary';

  // Summary mode: just composite + anomalous indicator
  if (readingLevel === 'summary') {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Structural Signature (Layer 1)
        </h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${anomalousClass}`}>
            {score.composite.toFixed(2)}
          </span>
          <span className="text-xs text-dm-text-secondary">
            / {STRUCTURAL_ANOMALY_THRESHOLD} threshold
          </span>
          {score.anomalous && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-drift/10 text-status-drift font-medium">
              Anomalous
            </span>
          )}
        </div>
      </section>
    );
  }

  // Detailed mode: full breakdown
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        Structural Signature (Layer 1)
      </h2>

      {/* Composite score */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-sm font-medium ${anomalousClass}`}>
          Composite: {score.composite.toFixed(2)}
        </span>
        <span className="text-xs text-dm-text-secondary">
          / {STRUCTURAL_ANOMALY_THRESHOLD} threshold
        </span>
        {score.anomalous && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-drift/10 text-status-drift font-medium">
            Anomalous
          </span>
        )}
      </div>

      {/* Dimension rows */}
      <div className="space-y-2 mb-4">
        {DIMENSION_ORDER.map((dim) => {
          const d = score.dimensions[dim];
          if (!d || !d.available) return null;
          return (
            <div key={dim} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="w-28 sm:w-36 text-dm-text-secondary shrink-0">
                {DIMENSION_LABELS[dim]}
              </span>
              <ScoreBar value={Math.abs(d.zScore)} max={4} />
              <span className="text-dm-text-primary font-mono w-12 text-right">
                z={d.zScore.toFixed(1)}
              </span>
              <span className="text-dm-muted w-16 text-right hidden sm:inline">
                {d.value.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Functional shifts */}
      {score.functionalShifts.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1.5">
            Functional Shifts
          </h3>
          <ul className="space-y-1">
            {score.functionalShifts.map((shift, i) => (
              <li key={i} className="text-xs text-dm-text-secondary flex items-center gap-2">
                <span className="font-mono text-dm-text-primary">{shift.bucket}</span>
                <span className="text-dm-muted">
                  {(shift.baselineRate * 100).toFixed(1)}% {'\u2192'}{' '}
                  {(shift.currentRate * 100).toFixed(1)}%
                </span>
                <span className="text-[10px] text-dm-muted">({shift.direction})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Long horizon */}
      <div className="text-xs text-dm-text-secondary flex flex-wrap gap-x-2 gap-y-0.5">
        <span>Cumulative deviation: {score.longHorizon.cumulativeDeviation.toFixed(2)}</span>
        <span>over {score.longHorizon.cumulativeWindow} weeks</span>
        <span>
          Trend: {DRIFT_ARROWS[score.longHorizon.driftTrend]} {score.longHorizon.driftTrend}
        </span>
      </div>
    </section>
  );
}
