/**
 * R-TIPWIRE-3 coverage check (#861, #865): which news domains count as
 * "national" for the graded coverage label. A GDELT hit from any of these
 * means the finding is likely covered; hits only from elsewhere are "niche",
 * which for a national reporter is often the better tip ("only US Border
 * News has touched this"). Operator-facing heuristic — never asserted to a
 * reporter.
 */

export const NATIONAL_OUTLET_DOMAINS: readonly string[] = [
  'nytimes.com',
  'washingtonpost.com',
  'wsj.com',
  'apnews.com',
  'reuters.com',
  'bloomberg.com',
  'politico.com',
  'axios.com',
  'cnn.com',
  'nbcnews.com',
  'abcnews.go.com',
  'cbsnews.com',
  'foxnews.com',
  'npr.org',
  'thehill.com',
  'usatoday.com',
  'latimes.com',
  'propublica.org',
  'govexec.com',
  'federalnewsnetwork.com',
  'rollcall.com',
  'theguardian.com',
  'bbc.com',
  'time.com',
];

/** At or below this many non-national hits the label is "niche". */
export const NICHE_MAX_HITS = 3;

/** GDELT lookback for the coverage check. */
export const COVERAGE_WINDOW_DAYS = 30;

/** True when `host` is `domain` or a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function isNationalOutlet(host: string): boolean {
  return NATIONAL_OUTLET_DOMAINS.some((d) => hostMatchesDomain(host, d));
}
