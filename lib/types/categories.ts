export type SignalType = 'json' | 'rss' | 'html' | 'federal_register' | 'tracker_scrape';

export type StatusLevel = 'Stable' | 'Warning' | 'Drift' | 'Capture';

export interface Signal {
  name: string;
  url: string;
  type: SignalType;
  note?: string;
}

export interface Category {
  key: string;
  title: string;
  description: string;
  signals: Signal[];
}
