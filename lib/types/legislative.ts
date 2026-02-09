export type LegislativeItemType = 'hearing' | 'floor_action' | 'bill' | 'resolution' | 'report';

export interface LegislativeItem {
  id: string;
  title: string;
  type: LegislativeItemType;
  date: string;
  url: string;
  chamber: 'senate' | 'house' | 'joint';
  committee?: string;
  relevantCategories: string[];
  summary?: string;
}

export interface LegislativeTrackingSummary {
  totalItems: number;
  byType: Record<string, number>;
  byChamber: Record<string, number>;
  byCategory: Record<string, number>;
  recentItems: LegislativeItem[];
}
