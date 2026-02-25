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
};

/** Per-convergence-status colors for heatmap/timeline visualizations. */
export const CONVERGENCE_STATUS_COLORS = {
  light: {
    Stable: '#94a3b8',
    Elevated: '#6366f1',
    Divergent: '#8b5cf6',
    ConfirmedConcern: '#ef4444',
  },
  dark: {
    Stable: '#64748b',
    Elevated: '#818cf8',
    Divergent: '#a78bfa',
    ConfirmedConcern: '#f87171',
  },
} as const;
