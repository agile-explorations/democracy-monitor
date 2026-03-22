import { CONCERN_LEVEL_TOOLTIPS } from '@/lib/data/concern-level-explanations';
import type { ConcernLevel } from '@/lib/types/structural';

const DISPLAY_LABELS: Record<ConcernLevel, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  Divergent: 'Divergent',
  ConfirmedConcern: 'Confirmed Concern',
};

const ICONS: Record<ConcernLevel, string> = {
  Stable: '\u2014', // em dash —
  Elevated: '\u25B3', // open triangle △
  Divergent: '\u25B2', // filled triangle ▲
  ConfirmedConcern: '\u25C6', // filled diamond ◆
};

const STYLE: Record<ConcernLevel, string> = {
  Stable: 'bg-convergence-stable/15 text-convergence-stable border-convergence-stable/30',
  Elevated: 'bg-convergence-elevated/15 text-convergence-elevated border-convergence-elevated/30',
  Divergent:
    'bg-convergence-divergent/15 text-convergence-divergent border-convergence-divergent/30',
  ConfirmedConcern:
    'bg-convergence-confirmed/15 text-convergence-confirmed border-convergence-confirmed/30',
};

export function ConcernLevelPill({ status }: { status: ConcernLevel }) {
  return (
    <span
      role="status"
      aria-label={`Status: ${DISPLAY_LABELS[status]}. ${CONCERN_LEVEL_TOOLTIPS[status]}`}
      title={CONCERN_LEVEL_TOOLTIPS[status]}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${STYLE[status]}`}
    >
      <span aria-hidden="true">{ICONS[status]}</span>
      {DISPLAY_LABELS[status]}
    </span>
  );
}
