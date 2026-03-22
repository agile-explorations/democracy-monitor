import { Z_SCORE_SCALE_COLORS } from '@/lib/data/chart-colors';

/** Linear interpolate between two hex colors. t is clamped to [0, 1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * clamped);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * clamped);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * clamped);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/**
 * Map a z-score to a diverging color (blue → neutral → red).
 * Clamped to [-4, 4]. Null z-scores return null.
 */
export function divergingZScoreColor(zScore: number | null, mode: 'light' | 'dark'): string | null {
  if (zScore === null) return null;
  const colors = Z_SCORE_SCALE_COLORS[mode];
  const clamped = Math.max(-4, Math.min(4, zScore));
  // Map [-4, 4] to [0, 1]
  const t = (clamped + 4) / 8;
  if (t < 0.5) {
    // blue → neutral
    return lerpColor(colors.low, colors.mid, t / 0.5);
  }
  // neutral → red
  return lerpColor(colors.mid, colors.high, (t - 0.5) / 0.5);
}
