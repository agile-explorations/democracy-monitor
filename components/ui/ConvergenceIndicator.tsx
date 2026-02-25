import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';

export interface ConvergenceIndicatorProps {
  structural: boolean;
  ai: boolean;
  thematic: boolean;
}

const LABELS = ['L1 Structural', 'L2 AI', 'L3 Thematic'] as const;

export function ConvergenceIndicator({ structural, ai, thematic }: ConvergenceIndicatorProps) {
  const { resolvedMode } = useTheme();
  const activeFill = CONVERGENCE_STATUS_COLORS[resolvedMode].Elevated;
  const inactiveFill = resolvedMode === 'dark' ? '#334155' : '#e2e8f0';
  const flags = [structural, ai, thematic];

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Layer elevation status">
      {flags.map((active, i) => (
        <span
          key={LABELS[i]}
          title={`${LABELS[i]}: ${active ? 'elevated' : 'normal'}`}
          className="inline-block w-2.5 h-2.5 rounded-full border"
          style={{
            backgroundColor: active ? activeFill : inactiveFill,
            borderColor: active ? activeFill : inactiveFill,
          }}
        />
      ))}
    </div>
  );
}
