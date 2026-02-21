import Link from 'next/link';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusPill } from '@/components/ui/StatusPill';
import type { StatusLevel } from '@/lib/types';

export interface CategoryCardProps {
  category: string;
  title: string;
  status: StatusLevel;
  insufficientData?: boolean;
  decayWeightedScore: number;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  flaggedCount: number;
  summary: string;
  readingLevel: 'summary' | 'detailed';
  showExperimentalBadge?: boolean;
  linkBase?: string;
}

function formatRatio(score: number, baseline: number): string {
  if (baseline <= 0) return '';
  const ratio = score / baseline;
  return `(${ratio.toFixed(1)}\u00d7 baseline)`;
}

export function CategoryCard({
  category,
  title,
  status,
  insufficientData,
  decayWeightedScore,
  baselineAvg,
  baselineStdDev,
  sparklineData,
  documentCount,
  flaggedCount,
  summary,
  readingLevel,
  showExperimentalBadge = true,
  linkBase = '/category',
}: CategoryCardProps) {
  return (
    <Link
      href={`${linkBase}/${category}`}
      className="block rounded-lg border border-dm-border bg-dm-card p-6 transition-all hover:shadow-lg hover:border-dm-accent/50 hover:-translate-y-0.5 cursor-pointer"
    >
      {/* Header: name + status pill */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-dm-text-primary leading-tight">{title}</h3>
        {insufficientData ? (
          <span
            role="status"
            aria-label="Status: No Data. Insufficient evidence to assess this category."
            title="Insufficient evidence to assess this category"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold bg-dm-border/20 text-dm-muted border-dm-border"
          >
            No Data
          </span>
        ) : (
          <StatusPill level={status} />
        )}
      </div>

      {/* Technical key (Detailed mode only) */}
      {readingLevel === 'detailed' && (
        <p className="text-[11px] font-mono text-dm-text-secondary mb-3">{category}</p>
      )}

      {/* Sparkline */}
      <div className={readingLevel === 'detailed' ? '' : 'mt-3'}>
        <Sparkline data={sparklineData} baselineAvg={baselineAvg} baselineStdDev={baselineStdDev} />
      </div>

      {/* Score vs baseline */}
      <div className="flex items-baseline gap-2 mt-2 text-xs">
        <span className="text-dm-text-primary font-medium">
          Current: {decayWeightedScore.toFixed(1)}
        </span>
        <span className="text-dm-text-secondary">Baseline avg: {baselineAvg.toFixed(1)}</span>
        {baselineAvg > 0 && (
          <span className="text-dm-text-secondary">
            {formatRatio(decayWeightedScore, baselineAvg)}
          </span>
        )}
      </div>

      {/* Summary text */}
      <p className="mt-3 text-xs text-dm-text-secondary leading-relaxed line-clamp-3">{summary}</p>

      {/* Document count context */}
      <p className="mt-2 text-[11px] text-dm-muted">
        {documentCount} docs this week
        {flaggedCount > 0 && <> &middot; {flaggedCount} flagged</>}
      </p>

      {/* Experimental badge */}
      {showExperimentalBadge && (
        <div className="mt-3 pt-3 border-t border-dm-border/50 flex items-center gap-2 text-[10px] text-dm-muted">
          <span className="px-1.5 py-0.5 rounded border border-dm-border text-dm-text-secondary">
            Experimental
          </span>
        </div>
      )}
    </Link>
  );
}
