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

/** Per-category hex colors for multi-line charts. */
export const CATEGORY_COLORS: Record<string, string> = {
  civilService: '#6366f1',
  fiscal: '#8b5cf6',
  executiveOversight: '#a855f7',
  hatch: '#d946ef',
  judicialIndependence: '#ec4899',
  military: '#f43f5e',
  rulemaking: '#f97316',
  executiveActions: '#eab308',
  infoAvailability: '#22c55e',
  elections: '#14b8a6',
  mediaFreedom: '#06b6d4',
  lawEnforcement: '#0ea5e9',
  civilLiberties: '#3b82f6',
  immigrationEnforcement: '#0284c7',
};

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

/** Per-convergence-status colors for heatmap/timeline visualizations. */
export const CONVERGENCE_STATUS_COLORS = {
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
