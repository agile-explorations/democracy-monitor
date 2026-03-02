import type { ConvergenceStatus } from './structural';

export interface HeatmapRow {
  category: string;
  title: string;
  weeks: Array<{ week: string; score: number | null }>;
}

export interface StatusTimelineEntry {
  category: string;
  title: string;
  segments: Array<{ week: string; status: ConvergenceStatus | null }>;
}

export interface SynchronyPoint {
  week: string;
  elevatedCount: number;
}

export interface FetchWeekHealth {
  week: string;
  total: number;
  complete: number;
  partial: number;
  failed: number;
}

export interface OverviewSummary {
  heatmap: HeatmapRow[];
  statusTimeline: StatusTimelineEntry[];
  synchrony: SynchronyPoint[];
  statusCounts: Record<ConvergenceStatus, number>;
  weekRange: { from: string; to: string };
}
