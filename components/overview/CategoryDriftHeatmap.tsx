import { useMemo } from 'react';
import type { HeatmapRow } from '@/lib/types/overview';
import { lerpColor } from '@/lib/utils/color';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface CategoryDriftHeatmapProps {
  rows: HeatmapRow[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}

/**
 * Map a convergence score [0, max] to a background color.
 * Returns null for null scores (no data computed).
 * Uses a 4-stop scale: neutral -> indigo -> violet -> red.
 */
function scoreToColor(score: number | null, mode: 'light' | 'dark'): string | null {
  if (score === null) return null;
  if (score <= 0) return mode === 'dark' ? '#1e293b' : '#f1f5f9';
  // Normalize score to 0-1 range (cap at 1.0 for very high scores)
  const t = Math.min(score / 1.0, 1);

  if (mode === 'dark') {
    // dark: slate-800 -> indigo-800 -> violet-700 -> red-700
    if (t < 0.33) return lerpColor('#1e293b', '#3730a3', t / 0.33);
    if (t < 0.66) return lerpColor('#3730a3', '#6d28d9', (t - 0.33) / 0.33);
    return lerpColor('#6d28d9', '#b91c1c', (t - 0.66) / 0.34);
  }
  // light: slate-100 -> indigo-200 -> violet-300 -> red-300
  if (t < 0.33) return lerpColor('#f1f5f9', '#c7d2fe', t / 0.33);
  if (t < 0.66) return lerpColor('#c7d2fe', '#c4b5fd', (t - 0.33) / 0.33);
  return lerpColor('#c4b5fd', '#fca5a5', (t - 0.66) / 0.34);
}

/** SVG pattern ID for null/no-data cells. */
const NO_DATA_PATTERN_ID = 'heatmap-no-data';

function NoDataPatternDef({ mode }: { mode: 'light' | 'dark' }) {
  const bg = mode === 'dark' ? '#1e293b' : '#f1f5f9';
  const stripe = mode === 'dark' ? '#334155' : '#e2e8f0';
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <pattern id={NO_DATA_PATTERN_ID} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={bg} />
          <path d="M0 6L6 0" stroke={stripe} strokeWidth="1" />
        </pattern>
      </defs>
    </svg>
  );
}

export function CategoryDriftHeatmap({ rows, mode, onCellClick }: CategoryDriftHeatmapProps) {
  const weeks = useMemo(() => {
    if (rows.length === 0 || rows[0].weeks.length === 0) return [];
    return rows[0].weeks.map((w) => w.week);
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No heatmap data available.</p>;
  }

  // Show every Nth label to avoid crowding
  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));

  return (
    <div className="overflow-x-auto relative">
      <NoDataPatternDef mode={mode} />
      <div
        className="grid gap-px min-w-[600px]"
        style={{
          gridTemplateColumns: `140px repeat(${weeks.length}, 1fr)`,
        }}
        role="table"
        aria-label="Category drift heatmap"
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

        {/* Data rows */}
        {rows.map((row) => (
          <HeatmapRowComponent key={row.category} row={row} mode={mode} onCellClick={onCellClick} />
        ))}
      </div>
    </div>
  );
}

function HeatmapRowComponent({
  row,
  mode,
  onCellClick,
}: {
  row: HeatmapRow;
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate px-1 py-1 flex items-center"
        role="rowheader"
        title={row.title}
      >
        {row.title}
      </div>
      {row.weeks.map((cell) => {
        const color = scoreToColor(cell.score, mode);
        const isNoData = color === null;
        const displayScore = cell.score !== null ? cell.score.toFixed(2) : 'No data';

        return (
          <div
            key={cell.week}
            className={`rounded-sm min-h-[24px]${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
            style={
              isNoData
                ? {
                    background: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><rect width='6' height='6' fill='${mode === 'dark' ? '%231e293b' : '%23f1f5f9'}'/><path d='M0 6L6 0' stroke='${mode === 'dark' ? '%23334155' : '%23e2e8f0'}' stroke-width='1'/></svg>`)}")`,
                  }
                : { backgroundColor: color }
            }
            title={`${row.title} \u2014 ${formatWeekLabel(cell.week)}: ${displayScore}`}
            role="cell"
            onClick={onCellClick ? () => onCellClick(row.category, cell.week) : undefined}
          />
        );
      })}
    </>
  );
}
