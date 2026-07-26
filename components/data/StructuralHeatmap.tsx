import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keyToSlug } from '@/lib/data/category-slugs';
import { Z_SCORE_SCALE_COLORS } from '@/lib/data/chart-colors';
import { buildMarkersByWeek, isCountComparabilityBroken } from '@/lib/data/instrument-changes';
import type { StructuralDimension, StructuralHeatmapRow } from '@/lib/types/overview';
import { divergingZScoreColor } from '@/lib/utils/color';
import { addDays, formatWeekLabel } from '@/lib/utils/date-utils';

export interface StructuralHeatmapProps {
  rows: StructuralHeatmapRow[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}

type DimensionOption = 'composite' | StructuralDimension;

const DIMENSION_OPTIONS: Array<{ key: DimensionOption; label: string }> = [
  { key: 'composite', label: 'Composite' },
  { key: 'volume', label: 'Volume' },
  { key: 'typeComposition', label: 'Type' },
  { key: 'functionalDistribution', label: 'Functional' },
  { key: 'agencyActivity', label: 'Agency' },
  { key: 'publicationTempo', label: 'Tempo' },
  { key: 'sourceConvergence', label: 'Convergence' },
];

/** Dimensions whose values derive from document counts vs the baseline. */
const COUNT_DERIVED_DIMENSIONS = new Set<DimensionOption>(['volume', 'publicationTempo']);

const DIMENSION_FULL_LABELS: Record<DimensionOption, string> = {
  composite: 'Composite',
  volume: 'Volume',
  typeComposition: 'Type Composition',
  functionalDistribution: 'Functional Distribution',
  agencyActivity: 'Agency Activity',
  publicationTempo: 'Publication Tempo',
  sourceConvergence: 'Source Convergence',
};

function getZScore(
  week: StructuralHeatmapRow['weeks'][number],
  dimension: DimensionOption,
): number | null {
  if (dimension === 'composite') return week.composite;
  return week.dimensions[dimension] ?? null;
}

function noDataBg(mode: 'light' | 'dark'): string {
  const bg = mode === 'dark' ? '%231e293b' : '%23f1f5f9';
  const stripe = mode === 'dark' ? '%23334155' : '%23e2e8f0';
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><rect width='6' height='6' fill='${bg}'/><path d='M0 6L6 0' stroke='${stripe}' stroke-width='1'/></svg>`,
  )}")`;
}

function buildTooltip(
  title: string,
  weekLabel: string,
  week: StructuralHeatmapRow['weeks'][number],
): string {
  const lines = [`${title} \u2014 ${weekLabel}`];
  if (week.composite !== null) {
    lines.push(`Composite: ${week.composite.toFixed(2)}${week.anomalous ? ' (anomalous)' : ''}`);
  } else {
    lines.push('No documents that week \u2014 structural analysis not applicable');
  }
  const dimKeys: StructuralDimension[] = [
    'volume',
    'typeComposition',
    'functionalDistribution',
    'agencyActivity',
    'publicationTempo',
    'sourceConvergence',
  ];
  for (const key of dimKeys) {
    const val = week.dimensions[key];
    const label = DIMENSION_FULL_LABELS[key];
    lines.push(`${label}: ${val !== null && val !== undefined ? val.toFixed(2) : 'N/A'}`);
  }
  return lines.join('\n');
}

function DimensionSelector({
  selected,
  onChange,
}: {
  selected: DimensionOption;
  onChange: (d: DimensionOption) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Dimension selector">
      {DIMENSION_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={selected === key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
            selected === key
              ? 'bg-dm-accent text-white'
              : 'bg-dm-card text-dm-text-secondary hover:text-dm-text-primary border border-dm-border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function GradientLegend({
  mode,
  dimension,
}: {
  mode: 'light' | 'dark';
  dimension: DimensionOption;
}) {
  const colors = Z_SCORE_SCALE_COLORS[mode];
  return (
    <div className="flex items-center gap-2 mb-3 text-[11px] text-dm-text-secondary">
      <span>quieter than baseline</span>
      <div
        className="h-3 w-32 rounded-sm"
        style={{
          background: `linear-gradient(to right, ${colors.low}, ${colors.mid}, ${colors.high})`,
        }}
      />
      <span>busier than baseline</span>
      <span className="ml-2 text-dm-muted">z-score −4 to +4</span>
      <span className="flex items-center gap-1 ml-3">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: noDataBg(mode) }} />
        No documents that week
      </span>
      {COUNT_DERIVED_DIMENSIONS.has(dimension) && (
        <span className="flex items-center gap-1 ml-3">
          <span
            className="inline-block w-3 h-3 rounded-sm bg-dm-text-secondary"
            style={{ opacity: 0.1 }}
          />
          Collection breadth changed — not baseline-comparable
        </span>
      )}
    </div>
  );
}

export function StructuralHeatmap({ rows, mode, onCellClick }: StructuralHeatmapProps) {
  const [dimension, setDimension] = useState<DimensionOption>('composite');

  const weeks = useMemo(() => {
    if (rows.length === 0 || rows[0].weeks.length === 0) return [];
    return rows[0].weeks.map((w) => w.week);
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No structural data available.</p>;
  }

  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));
  const markersByWeek = buildMarkersByWeek(weeks);

  return (
    <div>
      <DimensionSelector selected={dimension} onChange={setDimension} />
      <GradientLegend mode={mode} dimension={dimension} />
      <div className="overflow-x-auto">
        <div
          className="grid gap-px min-w-[600px]"
          style={{ gridTemplateColumns: `280px repeat(${weeks.length}, 1fr)` }}
          role="table"
          aria-label="Structural dimension heatmap"
        >
          {/* Header row */}
          <div className="text-[10px] text-dm-muted font-medium px-1 py-1" role="columnheader" />
          {weeks.map((week, i) => (
            <div
              key={week}
              className="text-[10px] text-dm-muted text-center py-1"
              role="columnheader"
            >
              {i % labelInterval === 0 ? formatWeekLabel(week) : ''}
            </div>
          ))}

          {/* Methodology-change markers (#576): ingest changes are regime
              shifts — mark them so pipeline changes aren't read as government
              behavior. */}
          {markersByWeek.size > 0 && (
            <>
              <div
                className="text-[9px] text-dm-muted uppercase tracking-wider px-1 pb-1 flex items-end"
                role="rowheader"
              >
                Collection changes
              </div>
              {weeks.map((week) => {
                const changes = markersByWeek.get(week);
                return (
                  <div key={`marker-${week}`} className="text-center pb-1" role="cell">
                    {changes && (
                      <span
                        className="text-[9px] text-dm-accent cursor-help"
                        title={changes.map((c) => `Data collection change: ${c}`).join('\n')}
                        aria-label={`Data collection change in week of ${formatWeekLabel(week)}`}
                      >
                        ▲
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Data rows */}
          {rows.map((row) => (
            <HeatmapRow
              key={row.category}
              row={row}
              mode={mode}
              dimension={dimension}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeatmapRow({
  row,
  mode,
  dimension,
  onCellClick,
}: {
  row: StructuralHeatmapRow;
  mode: 'light' | 'dark';
  dimension: DimensionOption;
  onCellClick?: (category: string, week: string) => void;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate pl-1 pr-3 py-1 flex items-center"
        role="rowheader"
        title={row.title}
      >
        <Link
          href={`/category/${keyToSlug(row.category)}`}
          className="hover:text-dm-accent transition-colors"
        >
          {row.title}
        </Link>
      </div>
      {row.weeks.map((week) => {
        const z = getZScore(week, dimension);
        const color = divergingZScoreColor(z, mode);
        const weekLabel = formatWeekLabel(week.week);
        // Count-derived dimensions compare against the category's baseline;
        // after a collection-breadth change they measure the instrument, not
        // the government — dim them until #587 makes counting consistent.
        const masked =
          COUNT_DERIVED_DIMENSIONS.has(dimension) &&
          isCountComparabilityBroken(row.category, week.week);
        const tooltip =
          buildTooltip(row.title, weekLabel, week) +
          (masked
            ? '\nCollection breadth changed — not comparable to this category\u2019s baseline'
            : '');

        return (
          <div
            key={week.week}
            className={`rounded-sm min-h-[24px]${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
            style={
              color === null
                ? { background: noDataBg(mode) }
                : { backgroundColor: color, ...(masked ? { opacity: 0.1 } : {}) }
            }
            title={tooltip}
            role="cell"
            onClick={onCellClick ? () => onCellClick(row.category, week.week) : undefined}
          />
        );
      })}
    </>
  );
}
