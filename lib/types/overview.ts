import type { ConcernLevel } from './structural';

export type ThematicMetric =
  | 'zScore'
  | 'centroidDistance'
  | 'novelDocRate'
  | 'varianceRatio'
  | 'crossAdminDistance';

export interface ThematicHeatmapRow {
  category: string;
  title: string;
  weeks: Array<{
    week: string;
    zScore: number | null;
    centroidDistance: number | null;
    novelDocRate: number | null;
    varianceRatio: number | null;
    crossAdminDistance: number | null;
    bootstrap: boolean;
  }>;
}

export type StructuralDimension =
  | 'volume'
  | 'typeComposition'
  | 'functionalDistribution'
  | 'agencyActivity'
  | 'publicationTempo'
  | 'sourceConvergence';

export interface StructuralHeatmapRow {
  category: string;
  title: string;
  weeks: Array<{
    week: string;
    dimensions: Partial<Record<StructuralDimension, number | null>>;
    composite: number | null;
    anomalous: boolean;
  }>;
}

export interface HeatmapRow {
  category: string;
  title: string;
  weeks: Array<{ week: string; score: number | null }>;
}

export interface StatusTimelineEntry {
  category: string;
  title: string;
  segments: Array<{ week: string; status: ConcernLevel | null }>;
}

export interface SynchronyPoint {
  week: string;
  elevatedCount: number;
  weightedScore: number;
  elevatedWeighted: number;
  divergentWeighted: number;
  confirmedWeighted: number;
  trumpT1Trend?: number | null;
  bidenT1Trend?: number | null;
}

export interface FetchSourceDetail {
  sourceOrigin: string;
  category: string;
  status: 'complete' | 'partial' | 'failed';
  itemsFetched: number;
  errors: string[] | null;
}

export interface FetchWeekHealth {
  week: string;
  total: number;
  complete: number;
  partial: number;
  failed: number;
  sources?: FetchSourceDetail[];
}

export interface OverviewSummary {
  heatmap: HeatmapRow[];
  statusTimeline: StatusTimelineEntry[];
  synchrony: SynchronyPoint[];
  statusCounts: Record<ConcernLevel, number>;
  weekRange: { from: string; to: string };
}
