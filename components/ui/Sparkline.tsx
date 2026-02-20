export interface SparklineProps {
  /** Weekly score data points (most recent last) */
  data: Array<{ week: string; score: number }>;
  /** Baseline average value */
  baselineAvg: number;
  /** Baseline standard deviation */
  baselineStdDev: number;
  /** SVG width (defaults to 200) */
  width?: number;
  /** SVG height (defaults to 40) */
  height?: number;
  /** Line color CSS value (defaults to indigo-500) */
  lineColor?: string;
  /** Week date string to highlight with a dot (e.g., '2025-02-03') */
  highlightWeek?: string;
}

const PADDING_X = 4;
const PADDING_Y = 4;

function toPath(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function toAreaPath(points: Array<{ x: number; y: number }>, bottom: number): string {
  if (points.length === 0) return '';
  const line = toPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L${last.x},${bottom} L${first.x},${bottom} Z`;
}

export function Sparkline({
  data,
  baselineAvg,
  baselineStdDev,
  width = 200,
  height = 40,
  lineColor = '#6366f1',
  highlightWeek,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="No data available"
        className="w-full"
      />
    );
  }

  const innerW = width - PADDING_X * 2;
  const innerH = height - PADDING_Y * 2;

  const scores = data.map((d) => d.score);
  const allValues = [...scores, baselineAvg + baselineStdDev, 0];
  const maxVal = Math.max(...allValues);
  const scaleY = maxVal > 0 ? innerH / maxVal : 1;

  const toY = (v: number) => PADDING_Y + innerH - v * scaleY;
  const toX = (i: number) =>
    PADDING_X + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.score) }));

  const bandTop = toY(Math.min(baselineAvg + baselineStdDev, maxVal));
  const bandBottom = toY(Math.max(baselineAvg - baselineStdDev, 0));
  const baselineY = toY(baselineAvg);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Sparkline showing ${data.length} weeks of scores. Current: ${scores[scores.length - 1]?.toFixed(1)}, baseline: ${baselineAvg.toFixed(1)}`}
      className="w-full"
    >
      {/* Baseline ±1 stddev band */}
      <rect
        x={PADDING_X}
        y={bandTop}
        width={innerW}
        height={Math.max(bandBottom - bandTop, 0)}
        fill="var(--color-baseline-fill)"
        stroke="var(--color-baseline-border)"
        strokeWidth={0.5}
      />

      {/* Baseline average line */}
      <line
        x1={PADDING_X}
        y1={baselineY}
        x2={width - PADDING_X}
        y2={baselineY}
        stroke="var(--color-muted)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />

      {/* Area fill under line */}
      <path d={toAreaPath(points, PADDING_Y + innerH)} fill={lineColor} fillOpacity={0.1} />

      {/* Data line */}
      <path d={toPath(points)} fill="none" stroke={lineColor} strokeWidth={2} />

      {/* Highlighted week dot */}
      {highlightWeek &&
        (() => {
          const idx = data.findIndex((d) => d.week === highlightWeek);
          if (idx < 0) return null;
          const p = points[idx];
          return (
            <circle cx={p.x} cy={p.y} r={4} fill={lineColor} stroke="white" strokeWidth={1.5} />
          );
        })()}
    </svg>
  );
}
