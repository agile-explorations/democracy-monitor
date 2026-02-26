export type SignalType =
  | 'json'
  | 'rss'
  | 'html'
  | 'federal_register'
  | 'tracker_scrape'
  | 'courtlistener'
  | 'doj_json';

export type SourceOrigin =
  | 'federal_register'
  | 'whitehouse'
  | 'gdelt'
  | 'courtlistener'
  | 'doj'
  | 'govinfo'
  | 'legiscan'
  | 'fec'
  | 'rss'
  | 'html'
  | 'json';

export type StatusLevel = 'Stable' | 'Warning' | 'Drift' | 'Capture';

export type SourceStatus = 'healthy' | 'degraded' | 'unavailable' | 'silent';

export type ExpectedFrequency = 'daily' | 'weekly' | 'weekly_during_term';

export interface SignalHealthConfig {
  isCanary: boolean;
  expectedFrequency: ExpectedFrequency;
  maxSilentDays: number;
  expectedMinWeeklyDocs: number;
}

export interface Signal {
  id: string;
  name: string;
  url: string;
  type: SignalType;
  note?: string;
  health?: SignalHealthConfig;
}

export interface Category {
  key: string;
  title: string;
  description: string;
  signals: Signal[];
}
