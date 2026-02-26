export type SignalType =
  | 'json'
  | 'rss'
  | 'html'
  | 'federal_register'
  | 'tracker_scrape'
  | 'courtlistener'
  | 'doj_json'
  | 'govinfo'
  | 'fec_json';

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
