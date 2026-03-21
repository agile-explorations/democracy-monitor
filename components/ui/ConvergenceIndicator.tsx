import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import { LAYER_DESCRIPTIONS } from '@/lib/data/convergence-explanations';

export interface ConvergenceIndicatorProps {
  structural: boolean;
  ai: boolean;
  thematic: boolean;
  scores?: {
    structural?: number | null;
    ai?: number | null;
    thematic?: number | null;
  };
}

const LABELS = ['L1 Structural (context)', 'L2 AI (active)', 'L3 Thematic (context)'] as const;
const SCORE_KEYS = ['structural', 'ai', 'thematic'] as const;

export function ConvergenceIndicator({
  structural,
  ai,
  thematic,
  scores,
}: ConvergenceIndicatorProps) {
  const { resolvedMode } = useTheme();
  const activeFill = CONVERGENCE_STATUS_COLORS[resolvedMode].Elevated;
  const inactiveFill = resolvedMode === 'dark' ? '#334155' : '#e2e8f0';
  const flags = [structural, ai, thematic];

  return (
    <div className="flex items-center gap-2.5" role="group" aria-label="Layer elevation status">
      {flags.map((active, i) => {
        const scoreVal = scores?.[SCORE_KEYS[i]];
        const suffix = scoreVal != null ? ` (${scoreVal.toFixed(1)})` : '';
        return (
          <span
            key={LABELS[i]}
            title={`${LABELS[i]}: ${active ? 'elevated' : 'normal'}${suffix} — ${LAYER_DESCRIPTIONS[i]}`}
            className="inline-block w-2.5 h-2.5 rounded-full border"
            style={{
              backgroundColor: active ? activeFill : inactiveFill,
              borderColor: active ? activeFill : inactiveFill,
            }}
          />
        );
      })}
    </div>
  );
}
