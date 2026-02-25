import { useMemo } from 'react';
import type { HeatmapRow } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface CategoryDriftHeatmapProps {
  rows: HeatmapRow[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}

/**
 * Map a convergence score [0, max] to a background color.
 * Uses a 4-stop scale: neutral → indigo → violet → red.
 */
function scoreToColor(score: number, mode: 'light' | 'dark'): string {
  if (score <= 0) return mode === 'dark' ? '#1e293b' : '#f1f5f9';
  // Normalize score to 0–1 range (cap at 1.0 for very high scores)
  const t = Math.min(score / 1.0, 1);

  if (mode === 'dark') {
    // dark: slate-800 → indigo-800 → violet-700 → red-700
    if (t < 0.33) return lerpColor('#1e293b', '#3730a3', t / 0.33);
    if (t < 0.66) return lerpColor('#3730a3', '#6d28d9', (t - 0.33) / 0.33);
    return lerpColor('#6d28d9', '#b91c1c', (t - 0.66) / 0.34);
  }
  // light: slate-100 → indigo-200 → violet-300 → red-300
  if (t < 0.33) return lerpColor('#f1f5f9', '#c7d2fe', t / 0.33);
  if (t < 0.66) return lerpColor('#c7d2fe', '#c4b5fd', (t - 0.33) / 0.33);
  return lerpColor('#c4b5fd', '#fca5a5', (t - 0.66) / 0.34);
}

/** Linear interpolate between two hex colors. */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
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
    <div className="overflow-x-auto">
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
      {row.weeks.map((cell) => (
        <div
          key={cell.week}
          className={`rounded-sm min-h-[24px]${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
          style={{ backgroundColor: scoreToColor(cell.score, mode) }}
          title={`${row.title} — ${formatWeekLabel(cell.week)}: ${cell.score.toFixed(2)}`}
          role="cell"
          onClick={onCellClick ? () => onCellClick(row.category, cell.week) : undefined}
        />
      ))}
    </>
  );
}
