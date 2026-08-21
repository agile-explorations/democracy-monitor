/**
 * Robots-compliance registry (owner directive 2026-08-08): every host the
 * pipeline consumes from — or plans to — with the representative path prefixes
 * we request. Audited programmatically on EVERY weekly snapshot run
 * (robots-compliance service) and on demand via `pnpm validate:robots`.
 *
 * kind 'api' entries are keyed/documented APIs (authorized by their terms, not
 * by crawling norms) — still audited so a policy change is noticed, but a
 * robots mismatch on an API host is a warning, not a violation.
 *
 * Origin: the R-DHS-PRESS baseline recovery inadvertently crawled
 * dhs.gov/archive/ against a `Disallow: /archive/` rule (caught 2026-08-08 by
 * the first manual audit; data re-sourced from the Internet Archive). The
 * registry + weekly check exist so that class of miss cannot recur silently.
 */

export interface RobotsRegistryEntry {
  host: string;
  /** Path prefixes this pipeline requests on the host. */
  paths: string[];
  kind: 'crawl' | 'api';
  status: 'active' | 'planned';
  note?: string;
}

export const ROBOTS_REGISTRY: ReadonlyArray<RobotsRegistryEntry> = [
  // --- Active crawl sources ---
  {
    host: 'www.dhs.gov',
    paths: ['/news-releases/press-releases', '/news/2025/01/01/example'],
    kind: 'crawl',
    status: 'active',
    note: '/archive/ is Disallowed — pre-2025 DHS content comes from the Internet Archive instead',
  },
  {
    host: 'www.ice.gov',
    paths: ['/newsroom', '/news/releases/example', '/sitemap.xml'],
    kind: 'crawl',
    status: 'active',
  },
  {
    host: 'www.cbp.gov',
    paths: [
      '/newsroom/media-releases/all',
      '/newsroom/national-media-release/example',
      '/sitemap.xml',
    ],
    kind: 'crawl',
    status: 'active',
  },
  {
    host: 'oig.dhs.gov',
    paths: ['/reports/audits-inspections-and-evaluations'],
    kind: 'crawl',
    status: 'active',
  },
  { host: 'www.oversight.gov', paths: ['/reports/federal'], kind: 'crawl', status: 'active' },
  { host: 'oig.hhs.gov', paths: ['/reports/all/'], kind: 'crawl', status: 'active' },
  { host: 'oig.ssa.gov', paths: ['/audit-reports/'], kind: 'crawl', status: 'active' },
  { host: 'oig.justice.gov', paths: ['/reports'], kind: 'crawl', status: 'active' },
  {
    host: 'web.archive.org',
    paths: ['/cdx/search/cdx', '/web/2022/https://example.gov/'],
    kind: 'crawl',
    status: 'active',
    note: 'CDX enumeration + replay fetches (DHS pre-2025 re-sourcing; GAO product ingest #739 — gao.gov WAF-blocks non-browser fetches)',
  },
  {
    host: 'www.govinfo.gov',
    paths: ['/app/details/example'],
    kind: 'crawl',
    status: 'active',
    note: 'content links from the keyed api.govinfo.gov API',
  },
  // --- Active API sources (keyed/documented; robots mismatch = warning) ---
  {
    host: 'www.federalregister.gov',
    paths: ['/api/v1/documents.json'],
    kind: 'api',
    status: 'active',
  },
  { host: 'api.govinfo.gov', paths: ['/'], kind: 'api', status: 'active' },
  { host: 'www.courtlistener.com', paths: ['/api/rest/v4/'], kind: 'api', status: 'active' },
  {
    host: 'www.justice.gov',
    paths: ['/api/v1/press_releases.json'],
    kind: 'api',
    status: 'active',
  },
  { host: 'api.open.fec.gov', paths: ['/v1/'], kind: 'api', status: 'active' },
  { host: 'api.legiscan.com', paths: ['/'], kind: 'api', status: 'active' },
  // --- Planned sources (feasibility-confirmed 2026-08-08; audit before + during use) ---
  { host: 'osc.gov', paths: ['/news/', '/sitemap.xml'], kind: 'crawl', status: 'planned' },
  {
    host: 'www.mspb.gov',
    paths: [
      '/decisions/precedential/PrecedentialDecisions_Manifest_Table.json',
      '/decisions/nonprecedential/NonPrecedentialDecisions_Manifest_Table.json',
    ],
    kind: 'crawl',
    status: 'planned',
  },
  {
    host: 'www.reginfo.gov',
    paths: ['/public/do/XMLViewFileAction', '/public/do/XMLReportList'],
    kind: 'crawl',
    status: 'planned',
  },
  {
    host: 'www.justice.gov',
    paths: ['/olc/opinions', '/olc/opinion/example'],
    kind: 'crawl',
    status: 'planned',
    note: 'plain paths only — the WAF rejects query strings regardless of robots',
  },
  {
    host: 'www.uscis.gov',
    paths: ['/newsroom/all-news', '/sitemap.xml'],
    kind: 'crawl',
    status: 'planned',
  },
  {
    host: 'www.secretservice.gov',
    paths: ['/newsroom/releases'],
    kind: 'crawl',
    status: 'planned',
  },
];
