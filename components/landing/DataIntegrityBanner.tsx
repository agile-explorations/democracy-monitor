import Link from 'next/link';
import type { DataIntegrity } from '@/lib/services/meta-assessment-service';

export interface DataIntegrityBannerProps {
  dataIntegrity: DataIntegrity;
  summary: string;
  healthySources: number;
  totalSources: number;
}

const LEVEL_CONFIG: Record<
  Exclude<DataIntegrity, 'high'>,
  { icon: string; title: string; bg: string; border: string }
> = {
  moderate: {
    icon: '\u24D8', // ⓘ
    title: 'Data availability: moderate',
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-l-slate-400',
  },
  low: {
    icon: '\u25B3', // △
    title: 'Data availability: low',
    bg: 'bg-indigo-50 dark:bg-indigo-950',
    border: 'border-l-indigo-400',
  },
  critical: {
    icon: '\u25C6', // ◆
    title: 'DATA SOURCES CRITICALLY DEGRADED',
    bg: 'bg-indigo-100 dark:bg-indigo-900',
    border: 'border-l-indigo-600',
  },
};

export function DataIntegrityBanner({
  dataIntegrity,
  summary,
  healthySources,
  totalSources,
}: DataIntegrityBannerProps) {
  if (dataIntegrity === 'high') return null;

  const config = LEVEL_CONFIG[dataIntegrity];
  const isCritical = dataIntegrity === 'critical';

  return (
    <div
      className={`rounded-lg border-l-4 ${config.border} ${config.bg} ${isCritical ? 'p-6' : 'p-4'} mb-6`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className={`${isCritical ? 'text-lg' : 'text-sm'} shrink-0`}>{config.icon}</span>
        <div className="min-w-0">
          <p
            className={`${isCritical ? 'text-sm font-bold' : 'text-xs font-semibold'} text-dm-text-primary`}
          >
            {config.title}
          </p>
          <p className="mt-1 text-xs text-dm-text-secondary leading-relaxed">{summary}</p>
          <p className="mt-2 text-[11px] text-dm-muted">
            {healthySources} of {totalSources} sources healthy
          </p>
          {isCritical && (
            <p className="mt-2 text-xs text-dm-text-secondary italic">
              The absence of data may itself be a significant signal.
            </p>
          )}
          <Link
            href="/health"
            className="mt-2 inline-block text-xs font-medium text-dm-accent hover:underline"
          >
            {isCritical ? 'View source health details' : 'Source details'} &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
