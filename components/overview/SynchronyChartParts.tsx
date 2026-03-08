import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { SynchronyPoint } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export type StatusColorMap = Record<
  'Stable' | 'Elevated' | 'Divergent' | 'ConfirmedConcern',
  string
>;

export interface TrendPoint extends SynchronyPoint {
  trend: number;
}

export type TooltipPayload = Array<{ payload: TrendPoint }>;

export interface ComparisonTooltipProps {
  showComparison?: boolean;
  comparisonColors?: { trumpT1: string; bidenT1: string };
}

function ComparisonRows({
  d,
  showComparison,
  comparisonColors,
}: { d: TrendPoint } & ComparisonTooltipProps) {
  if (!showComparison || !comparisonColors) return null;
  return (
    <>
      {d.trumpT1Trend != null && (
        <p style={{ color: comparisonColors.trumpT1 }}>Trump T1: {d.trumpT1Trend.toFixed(1)}</p>
      )}
      {d.bidenT1Trend != null && (
        <p style={{ color: comparisonColors.bidenT1 }}>Biden T1: {d.bidenT1Trend.toFixed(1)}</p>
      )}
    </>
  );
}

export function SummaryTooltip({
  active,
  payload,
  showComparison,
  comparisonColors,
}: { active?: boolean; payload?: TooltipPayload } & ComparisonTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <p className="text-dm-text-secondary mt-1">Concern score: {d.weightedScore}</p>
      <p className="text-dm-text-secondary">Trend: {d.trend.toFixed(1)}</p>
      <ComparisonRows d={d} showComparison={showComparison} comparisonColors={comparisonColors} />
    </div>
  );
}

export function DetailedTooltip({
  active,
  payload,
  statusColors,
  showComparison,
  comparisonColors,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  statusColors: StatusColorMap;
} & ComparisonTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <div className="mt-1 space-y-0.5">
        {d.confirmedWeighted > 0 && (
          <p style={{ color: statusColors.ConfirmedConcern }}>
            Confirmed Concern: {d.confirmedWeighted}
          </p>
        )}
        {d.divergentWeighted > 0 && (
          <p style={{ color: statusColors.Divergent }}>Divergent: {d.divergentWeighted}</p>
        )}
        {d.elevatedWeighted > 0 && (
          <p style={{ color: statusColors.Elevated }}>Elevated: {d.elevatedWeighted}</p>
        )}
      </div>
      <p className="text-dm-text-secondary mt-1">Total: {d.weightedScore}</p>
      <p className="text-dm-text-secondary">Trend: {d.trend.toFixed(1)}</p>
      <ComparisonRows d={d} showComparison={showComparison} comparisonColors={comparisonColors} />
    </div>
  );
}

function Swatch({ color, opacity }: { color: string; opacity?: number }) {
  return (
    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity }} />
  );
}

function DashedSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-0.5"
      style={{ backgroundColor: color, borderTop: `2px dashed ${color}` }}
    />
  );
}

export function ChartLegend({
  readingLevel,
  statusColors,
  trendColor,
  showComparison,
  comparisonColors,
  hasComparison,
  onToggleComparison,
}: {
  readingLevel: ReadingLevel;
  statusColors: StatusColorMap;
  trendColor: string;
  showComparison: boolean;
  comparisonColors: { trumpT1: string; bidenT1: string };
  hasComparison: boolean;
  onToggleComparison: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dm-text-secondary mb-1">
      {readingLevel === 'summary' ? (
        <span className="flex items-center gap-1">
          <Swatch color={statusColors.Elevated} opacity={0.5} />
          Concern Score
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.Elevated} /> Elevated
          </span>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.Divergent} /> Divergent
          </span>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.ConfirmedConcern} /> Confirmed
          </span>
        </>
      )}
      <span className="flex items-center gap-1">
        <DashedSwatch color={trendColor} />
        Trend
      </span>
      {showComparison && (
        <>
          <span className="flex items-center gap-1">
            <DashedSwatch color={comparisonColors.trumpT1} />
            Trump T1
          </span>
          <span className="flex items-center gap-1">
            <DashedSwatch color={comparisonColors.bidenT1} />
            Biden T1
          </span>
        </>
      )}
      {hasComparison && (
        <button
          type="button"
          className={[
            'ml-auto rounded px-1.5 py-0.5 border text-[10px] font-medium transition-colors',
            showComparison
              ? 'border-dm-accent bg-dm-accent/10 text-dm-accent'
              : 'border-dm-border text-dm-text-secondary hover:border-dm-accent',
          ].join(' ')}
          onClick={onToggleComparison}
        >
          Compare Previous Administrations
        </button>
      )}
    </div>
  );
}
