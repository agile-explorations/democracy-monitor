import { ConvergenceIndicator } from '@/components/ui/ConvergenceIndicator';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { ConvergenceSynthesis } from '@/lib/types/structural';

export interface ConvergenceHeaderProps {
  synthesis: ConvergenceSynthesis | null;
}

const STATUS_EXPLANATIONS: Record<string, string> = {
  Stable: 'No detection layers are elevated. Patterns are within normal baseline range.',
  Elevated: 'One detection layer shows anomalous activity. Monitoring increased.',
  Divergent: 'Multiple detection layers independently flag anomalies in this category.',
  ConfirmedConcern:
    'Multiple layers elevated with high AI concern rate. Warrants close examination.',
};

export function ConvergenceHeader({ synthesis }: ConvergenceHeaderProps) {
  const { resolvedMode } = useTheme();

  if (!synthesis) {
    return (
      <div className="rounded-lg border border-dm-border bg-dm-card p-4 mb-6">
        <p className="text-xs text-dm-muted italic">No convergence data available.</p>
      </div>
    );
  }

  const statusColor = CONVERGENCE_STATUS_COLORS[resolvedMode][synthesis.status];

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        {/* Left: indicator dots */}
        <ConvergenceIndicator
          structural={synthesis.structuralElevated}
          ai={synthesis.aiElevated}
          thematic={synthesis.thematicElevated}
        />

        {/* Center: status + pattern */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: statusColor }}>
              {synthesis.status}
            </span>
            {synthesis.bootstrap && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-dm-border text-dm-muted">
                Bootstrap
              </span>
            )}
          </div>
          {synthesis.pattern && (
            <p className="text-xs text-dm-text-secondary mt-0.5 truncate">{synthesis.pattern}</p>
          )}
        </div>

        {/* Right: layers count */}
        <p className="text-xs text-dm-text-secondary whitespace-nowrap">
          {synthesis.layersElevated} of 3 layers elevated
        </p>
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-dm-muted mt-2">
        {STATUS_EXPLANATIONS[synthesis.status] ?? ''}
      </p>
    </div>
  );
}
