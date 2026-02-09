import type { MaturityBadge as MaturityLevel } from '@/lib/data/category-maturity';

const COLORS: Record<MaturityLevel, string> = {
  Experimental: 'bg-purple-100 text-purple-800 border-purple-200',
  Calibrating: 'bg-blue-100 text-blue-800 border-blue-200',
  Validated: 'bg-green-100 text-green-800 border-green-200',
};

const TOOLTIPS: Record<MaturityLevel, string> = {
  Experimental:
    'This category uses preliminary scoring rules that have not yet been validated against historical data',
  Calibrating: 'Scoring rules are being calibrated against historical data but may still change',
  Validated: 'Scoring rules have been validated against historical data and peer-reviewed',
};

export function MaturityBadge({ level }: { level: MaturityLevel }) {
  return (
    <span
      title={TOOLTIPS[level]}
      className={`px-2 py-1 rounded-full border text-xs font-medium ${COLORS[level]} cursor-help`}
    >
      {level}
    </span>
  );
}
