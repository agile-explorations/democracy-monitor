import type { StatusLevel } from '@/lib/types';

const COLORS: Record<StatusLevel, string> = {
  Stable: 'bg-green-100 text-green-800 border-green-200',
  Warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Drift: 'bg-orange-100 text-orange-800 border-orange-200',
  Capture: 'bg-red-100 text-red-800 border-red-200',
};

const TOOLTIPS: Record<StatusLevel, string> = {
  Stable: 'No warning signs detected — institutions are functioning normally',
  Warning: 'Some concerns found, but checks and balances appear intact',
  Drift: 'Multiple warning signs — power is becoming more centralized',
  Capture: 'Serious violations — laws or court orders are being ignored',
};

export function StatusPill({ level }: { level: StatusLevel }) {
  return (
    <span
      title={TOOLTIPS[level]}
      className={`px-2 py-1 rounded-full border text-xs font-medium ${COLORS[level]} cursor-help`}
    >
      {level}
    </span>
  );
}
