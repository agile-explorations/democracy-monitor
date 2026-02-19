import type { StatusLevel } from '@/lib/types';

const ICONS: Record<StatusLevel, string> = {
  Stable: '\u2014', // em dash —
  Warning: '\u25B3', // open triangle △
  Drift: '\u25B2', // filled triangle ▲
  Capture: '\u25C6', // filled diamond ◆
};

const STYLE: Record<StatusLevel, string> = {
  Stable: 'bg-status-stable/15 text-status-stable border-status-stable/30',
  Warning: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  Drift: 'bg-status-drift/15 text-status-drift border-status-drift/30',
  Capture: 'bg-status-capture/15 text-status-capture border-status-capture/30',
};

const TOOLTIPS: Record<StatusLevel, string> = {
  Stable: 'Within baseline range — no unusual signals detected',
  Warning: 'Mildly elevated — isolated signals worth watching',
  Drift: 'Structurally concerning — a pattern is emerging',
  Capture: 'Severe — institutional integrity may be at risk',
};

export function StatusPill({ level }: { level: StatusLevel }) {
  return (
    <span
      role="status"
      aria-label={`Status: ${level}. ${TOOLTIPS[level]}`}
      title={TOOLTIPS[level]}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${STYLE[level]}`}
    >
      <span aria-hidden="true">{ICONS[level]}</span>
      {level}
    </span>
  );
}
