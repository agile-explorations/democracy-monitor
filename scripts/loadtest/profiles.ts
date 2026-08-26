/** Load-test profile definitions (#781) — plain data, consumed by runner.ts. */

export interface RampStage {
  /** Seconds between launching successive distinct-question probes. */
  intervalS: number;
  /** Number of probes launched in this stage. */
  probes: number;
}

export interface Profile {
  key: 'p0' | 'p1' | 'p2' | 'p3';
  title: string;
  /** Concurrent browse VUs (0 = none). */
  browseVus: number;
  /** Browse duration in seconds (ignored when browseVus = 0). */
  browseDurationS: number;
  /** Sequential cold probes (P0-style); 0 for ramp profiles. */
  sequentialProbes: number;
  /** Gap between sequential probes, seconds. */
  sequentialGapS: number;
  /** Ramp stages (P3); empty otherwise. */
  ramp: RampStage[];
}

export const PROFILES: Record<string, Profile> = {
  p0: {
    key: 'p0',
    title: 'single-user cold novel search (lead metric)',
    browseVus: 0,
    browseDurationS: 0,
    sequentialProbes: 5,
    sequentialGapS: 30,
    ramp: [],
  },
  p1: {
    key: 'p1',
    title: 'browse-only baseline',
    browseVus: 5,
    browseDurationS: 600,
    sequentialProbes: 0,
    sequentialGapS: 0,
    ramp: [],
  },
  p2: {
    key: 'p2',
    title: 'browse + one research build',
    browseVus: 5,
    browseDurationS: 600,
    sequentialProbes: 1,
    sequentialGapS: 0,
    ramp: [],
  },
  p3: {
    key: 'p3',
    title: 'ramp of concurrent distinct novel builds',
    browseVus: 3,
    browseDurationS: 1500,
    sequentialProbes: 0,
    sequentialGapS: 0,
    ramp: [
      { intervalS: 60, probes: 10 },
      { intervalS: 30, probes: 20 },
      { intervalS: 15, probes: 20 },
    ],
  },
};

/** Browse endpoint set (the homepage/category/explore read path). */
export const BROWSE_ENDPOINTS = [
  '/api/categories/summary',
  '/api/overview/summary',
  '/api/health/meta',
  '/api/stats/document-count',
  '/api/search?mode=explore&q=executive%20order&page=1',
];
