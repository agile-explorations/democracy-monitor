/**
 * R-TIPWIRE-3 coverage check (#861, #865; hit hygiene R-TIPWIRE-5 #921):
 * which hosts count as "national" for the graded coverage label, and which
 * hosts are not coverage at all. A hit from a national outlet means the
 * finding is likely covered; hits only from elsewhere are "niche", which for
 * a national reporter is often the better tip ("only US Border News has
 * touched this"). Operator-facing heuristic — never asserted to a reporter.
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

/** The document is not coverage of the document: court and docket databases
 *  that a general search engine ranks above the press (spike 2026-09-24, #861).
 *  Every `.gov` / `.mil` host is excluded by rule, not by list. */
const PRIMARY_SOURCE_DOMAINS: readonly string[] = [
  'courtlistener.com',
  'justia.com',
  'usps.com',
  'casetext.com',
  'pacermonitor.com',
  'docketalarm.com',
  'plainsite.org',
];

/** Reference and social pages a web index returns for any identifier; they
 *  would inflate the niche threshold (calibrated on a news-only index) into
 *  "likely covered" without a single newsroom having touched the story.
 *  Every `.edu` host is excluded by rule (university advisories, not coverage). */
const NON_COVERAGE_DOMAINS: readonly string[] = [
  'wikipedia.org',
  'britannica.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'youtube.com',
  'reddit.com',
];

/** At or below this many non-national hits the label is "niche". */
export const NICHE_MAX_HITS = 3;

/** Search-provider lookback for the coverage check. */
export const COVERAGE_WINDOW_DAYS = 30;

/** How long hit URLs stay on an open candidate before the sweep removes them
 *  (Brave Search API ToS §3(b): transient storage only). */
export const COVERAGE_URL_RETENTION_DAYS = 30;

/** True when `host` is `domain` or a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function isNationalOutlet(host: string): boolean {
  return NATIONAL_OUTLET_DOMAINS.some((d) => hostMatchesDomain(host, d));
}

/** Government hosts and legal-document databases: the record itself, never coverage of it. */
export function isPrimarySource(host: string): boolean {
  const h = host.toLowerCase();
  if (/\.(gov|mil)$/.test(h)) return true;
  return PRIMARY_SOURCE_DOMAINS.some((d) => hostMatchesDomain(h, d));
}

/** Reference, social and university hosts that never count as a newsroom having run the story. */
export function isNonCoverageHost(host: string): boolean {
  const h = host.toLowerCase();
  if (/\.edu$/.test(h)) return true;
  return NON_COVERAGE_DOMAINS.some((d) => hostMatchesDomain(h, d));
}
