import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import {
  CONCERN_LEVEL_EXPLANATIONS,
  CONCERN_LEVEL_LABELS,
} from '@/lib/data/concern-level-explanations';
import type { ConcernAssessment } from '@/lib/types/structural';

export interface ConcernHeaderProps {
  synthesis: ConcernAssessment | null;
}

export function ConcernHeader({ synthesis }: ConcernHeaderProps) {
  const { resolvedMode } = useTheme();

  if (!synthesis) {
    return (
      <div className="rounded-lg border border-dm-border bg-dm-card p-4 mb-6">
        <p className="text-xs text-dm-muted italic">No status data available.</p>
      </div>
    );
  }

  const statusColor = CONCERN_LEVEL_COLORS[resolvedMode][synthesis.status];

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4 mb-6">
      <div className="flex items-center gap-4">
        {/* Status + pattern */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: statusColor }}>
              {CONCERN_LEVEL_LABELS[synthesis.status] ?? synthesis.status}
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
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-dm-muted mt-2">
        {CONCERN_LEVEL_EXPLANATIONS[synthesis.status] ?? ''}
      </p>
    </div>
  );
}
