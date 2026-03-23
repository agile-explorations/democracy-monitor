/** Resolved chart colors per mode — recharts SVG attrs don't support CSS var(). */
export const CHART_COLORS = {
  light: {
    accent: '#4f46e5',
    border: '#e2e8f0',
    textSecondary: '#64748b',
  },
  dark: {
    accent: '#818cf8',
    border: '#334155',
    textSecondary: '#94a3b8',
  },
} as const;

/** Per-mode colors for the source health timeline strip. */
export const HEALTH_STRIP_COLORS = {
  light: { complete: '#22c55e', partial: '#f59e0b', failed: '#ef4444' },
  dark: { complete: '#4ade80', partial: '#fbbf24', failed: '#f87171' },
} as const;

/** Comparison trend line colors for historical administration overlays. */
export const COMPARISON_COLORS = {
  light: { trumpT1: '#e11d48', bidenT1: '#2563eb' },
  dark: { trumpT1: '#fb7185', bidenT1: '#60a5fa' },
} as const;

/** Per-concern-level colors for heatmap/timeline visualizations. */
export const CONCERN_LEVEL_COLORS = {
  light: {
    Stable: '#94a3b8',
    Elevated: '#6366f1',
    Divergent: '#f59e0b',
    ConfirmedConcern: '#ef4444',
  },
  dark: {
    Stable: '#64748b',
    Elevated: '#818cf8',
    Divergent: '#fbbf24',
    ConfirmedConcern: '#f87171',
  },
} as const;

/** Diverging z-score color scale for structural dimension heatmap. */
export const Z_SCORE_SCALE_COLORS = {
  light: { low: '#2563eb', mid: '#f1f5f9', high: '#dc2626' },
  dark: { low: '#60a5fa', mid: '#1e293b', high: '#f87171' },
} as const;

/** Sequential scale for non-z-score thematic metrics (neutral → orange → red). */
export const SEQUENTIAL_SCALE_COLORS = {
  light: { low: '#f1f5f9', mid: '#f97316', high: '#dc2626' },
  dark: { low: '#1e293b', mid: '#fb923c', high: '#f87171' },
} as const;

/** Structural/AI/thematic metric line colors (sky/orange/violet). */
export const METRIC_LINE_COLORS = {
  light: { structural: '#0ea5e9', ai: '#f97316', thematic: '#8b5cf6' },
  dark: { structural: '#38bdf8', ai: '#fb923c', thematic: '#a78bfa' },
} as const;
