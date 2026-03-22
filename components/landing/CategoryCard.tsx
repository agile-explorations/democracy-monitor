import Link from 'next/link';
import { ConcernLevelPill } from '@/components/ui/ConcernLevelPill';
import { Sparkline } from '@/components/ui/Sparkline';
import {
  AI_FLAG_RATE_THRESHOLD,
  STRUCTURAL_ANOMALY_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { ConcernLevel } from '@/lib/types/structural';

export interface CategoryCardProps {
  category: string;
  title: string;
  insufficientData?: boolean;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  flaggedCount: number;
  summary: string;
  readingLevel: 'summary' | 'detailed';
  showExperimentalBadge?: boolean;
  linkBase?: string;
  convergenceStatus?: ConcernLevel | null;
  structuralElevated?: boolean;
  aiElevated?: boolean;
  thematicElevated?: boolean;
}

const LAYER_LABELS = ['L1', 'L2', 'L3'] as const;
const LAYER_THRESHOLDS = [
  STRUCTURAL_ANOMALY_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
] as const;

export function CategoryCard({
  category,
  title,
  insufficientData,
  structuralScore,
  aiScore,
  thematicScore,
  baselineAvg,
  baselineStdDev,
  sparklineData,
  documentCount,
  flaggedCount,
  summary,
  readingLevel,
  showExperimentalBadge = true,
  linkBase = '/category',
  convergenceStatus,
  structuralElevated = false,
  aiElevated = false,
  thematicElevated = false,
}: CategoryCardProps) {
  const layerScores = [structuralScore, aiScore, thematicScore];
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
        ) : convergenceStatus ? (
          <ConcernLevelPill status={convergenceStatus} />
        ) : (
          <span className="text-[10px] text-dm-muted">{'\u2014'}</span>
        )}
      </div>

      {/* Concern level */}
      {convergenceStatus && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-dm-text-secondary">{convergenceStatus}</span>
        </div>
      )}

      {/* Technical key (Detailed mode only) */}
      {readingLevel === 'detailed' && (
        <p className="text-[11px] font-mono text-dm-text-secondary mb-3">{category}</p>
      )}

      {/* Sparkline */}
      <div className={readingLevel === 'detailed' ? '' : 'mt-3'}>
        <Sparkline data={sparklineData} baselineAvg={baselineAvg} baselineStdDev={baselineStdDev} />
      </div>

      {/* Layer z-scores */}
      <div className="flex items-baseline gap-3 mt-2 text-xs">
        {LAYER_LABELS.map((label, i) => {
          const score = layerScores[i];
          const elevated = score != null && score >= LAYER_THRESHOLDS[i];
          return (
            <span key={label} className={elevated ? 'text-dm-accent font-medium' : 'text-dm-muted'}>
              {label}: {score != null ? score.toFixed(1) : '\u2014'}
            </span>
          );
        })}
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
