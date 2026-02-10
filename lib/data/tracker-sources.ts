export type TrackerSource = 'brookings' | 'naacp' | 'democracywatch' | 'progressive';

export interface TrackerConfig {
  url: string;
  selector: string;
  titleSelector: string;
  linkSelector: string;
  dateSelector?: string;
}

export const TRACKER_CONFIGS: Record<TrackerSource, TrackerConfig> = {
  brookings: {
    url: 'https://www.brookings.edu/articles/tracking-regulatory-changes-in-the-second-trump-administration/',
    selector: '.post-content table tr',
    titleSelector: 'td:first-child',
    linkSelector: 'td a',
    dateSelector: 'td:nth-child(2)',
  },
  naacp: {
    url: 'https://www.naacpldf.org/tracking-project-2025/',
    selector: '.tracking-item, article',
    titleSelector: 'h3, .title, h2',
    linkSelector: 'a',
  },
  democracywatch: {
    url: 'https://www.democracywatchtracker.org/',
    selector: '.legislation-item, .tracker-item',
    titleSelector: '.title, h3',
    linkSelector: 'a',
  },
  progressive: {
    url: 'https://progressivereform.org/tracking-trump-2/project-2025-executive-action-tracker/',
    selector: '.entry-content li, .tracker-list li',
    titleSelector: 'a, strong',
    linkSelector: 'a',
  },
};

export function isValidTrackerSource(source: string): source is TrackerSource {
  return source in TRACKER_CONFIGS;
}
