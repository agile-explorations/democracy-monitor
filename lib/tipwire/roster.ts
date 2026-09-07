/**
 * R-TIPWIRE reporter roster (#853). Operator-only configuration for the
 * tip-candidate pipeline: which reporters we follow, how their bylines are
 * acquired, and which categories their beat maps to.
 *
 * Expansion is a config edit: flip `active` (and add a feed) — no code.
 * The beat→category mapping is a SOFT retrieval prior (a boost, never a
 * filter): the best tip may sit in a cross-category document.
 *
 * Acquisition strategies (probe-verified 2026-09-07, see #853):
 * - `rss`: a real feed. Attribution comes from the feed item when it carries
 *   an author element (`dc:creator` — ProPublica, Substack) or from the
 *   article page's author meta when it does not (GovExec `sailthru.author`).
 * - `author-page`: no feed exists; the outlet's author page lists articles
 *   and each article page carries JSON-LD + `article:author` metas (NOTUS).
 *
 * Outlets whose robots.txt or bot management does not permit either path
 * have `feed: null`. Owner decision 2026-09-07: no Google News RSS in this
 * pipeline (news.google.com disallows /rss/search), so Lawfare, POGO and the
 * paywalled nationals wait for a sanctioned path; a manual tip costs three
 * sentences and no robots questions.
 */

import { CATEGORIES } from '@/lib/data/categories';

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export type ReporterFeed =
  | {
      kind: 'rss';
      urls: string[];
      /** Where the byline lives: an item element (`dc:creator`) or a page meta name. */
      author: { in: 'item'; element: string } | { in: 'page'; meta: string };
    }
  | {
      kind: 'author-page';
      url: string;
      /** Article paths look like `/section/slug`; nav links do not. */
      articlePathPattern: RegExp;
      /** robots.txt Crawl-delay (ms) for the host. */
      politenessMs: number;
      /** `<meta>` name/property on article pages carrying the byline(s). */
      authorMeta: string;
      /** Optional monthly sitemap to intersect with the listing: only URLs
       *  present in the last `months` sitemaps are real, dated articles;
       *  `{YYYYMM}` is substituted. Cuts columnist/index links that share
       *  the article URL shape and orders newest-first by lastmod. */
      sitemap?: { urlTemplate: string; months: number };
    };

export interface ReporterEntry {
  id: string;
  name: string;
  outlet: string;
  /** Beat → categories; used as a soft retrieval prior and as query context. */
  categories: CategoryKey[];
  /** null = no sanctioned acquisition path yet; the entry is inert. */
  feed: ReporterFeed | null;
  /** v1 activates three; the rest wait on the #857 gate + #859. */
  active: boolean;
  note?: string;
}

const NO_PATH_NATIONAL =
  'No author RSS; site disallows or walls automated access. Waits for a sanctioned path (#859).';

export const ROSTER: ReadonlyArray<ReporterEntry> = [
  {
    id: 'katz',
    name: 'Eric Katz',
    outlet: 'NOTUS',
    categories: ['civilService', 'fiscal'],
    feed: {
      kind: 'author-page',
      url: 'https://www.notus.org/eric-katz',
      // /section/slug, excluding site chrome that shares the shape.
      articlePathPattern:
        /^https:\/\/www\.notus\.org\/(?!about-us|account|authors?|topics|tags|newsletters|search|cms|legal)[a-z0-9-]+\/[a-z0-9-]+$/,
      politenessMs: 10_000,
      authorMeta: 'article:author',
      sitemap: { urlTemplate: 'https://www.notus.org/sitemap-{YYYYMM}.xml', months: 2 },
    },
    active: true,
    note: 'No RSS anywhere on notus.org; robots allows with Crawl-delay 10. Author page ∩ monthly sitemap = dated real articles.',
  },
  {
    id: 'wagner',
    name: 'Erich Wagner',
    outlet: 'Government Executive',
    categories: ['civilService'],
    feed: {
      kind: 'rss',
      urls: [
        'https://www.govexec.com/rss/all/',
        'https://www.govexec.com/rss/pay-benefits/',
        'https://www.govexec.com/rss/workforce/',
      ],
      author: { in: 'page', meta: 'sailthru.author' },
    },
    active: true,
    note: 'Feed items carry no author; the article page does.',
  },
  {
    id: 'rosenberg',
    name: 'Mica Rosenberg',
    outlet: 'ProPublica',
    categories: ['immigrationEnforcement'],
    feed: {
      kind: 'author-page',
      url: 'https://www.propublica.org/people/mica-rosenberg',
      articlePathPattern: /^https:\/\/www\.propublica\.org\/article\/[a-z0-9-]+$/,
      politenessMs: 2_000,
      authorMeta: 'parsely-author',
    },
    active: true,
    note: 'Her people page lists ~16 articles (the main RSS shows only the latest 20 site-wide); article pages carry parsely-author metas. robots allows all (verified 2026-09-07).',
  },
  {
    id: 'beavers',
    name: 'Jack Beavers',
    outlet: 'US Border News',
    categories: ['immigrationEnforcement', 'fiscal'],
    feed: {
      kind: 'rss',
      urls: ['https://jackbeavers.substack.com/feed'],
      author: { in: 'item', element: 'dc:creator' },
    },
    active: false,
    note: 'Substack native RSS with dc:creator (verified 2026-09-07). Natural first expansion.',
  },
  {
    id: 'parloff',
    name: 'Roger Parloff',
    outlet: 'Lawfare',
    categories: ['judicialIndependence', 'executiveActions'],
    feed: null,
    active: false,
    note: 'lawfaremedia.org is Cloudflare-walled to non-browser clients; no Google News in this pipeline (owner decision 2026-09-07). Manual tips.',
  },
  {
    id: 'schwellenbach',
    name: 'Nick Schwellenbach',
    outlet: 'POGO',
    categories: ['executiveOversight', 'fiscal'],
    feed: null,
    active: false,
    note: 'pogo.org returns 403 to non-browser clients (probed 2026-09-07).',
  },
  {
    id: 'natanson',
    name: 'Hannah Natanson',
    outlet: 'The Washington Post',
    categories: ['civilService'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
  {
    id: 'diamond',
    name: 'Dan Diamond',
    outlet: 'The Washington Post',
    categories: ['infoAvailability', 'executiveOversight'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
  {
    id: 'hesson',
    name: 'Ted Hesson',
    outlet: 'The Washington Post',
    categories: ['immigrationEnforcement'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
  {
    id: 'aleaziz',
    name: 'Hamed Aleaziz',
    outlet: 'The New York Times',
    categories: ['immigrationEnforcement', 'civilLiberties'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
  {
    id: 'ainsley',
    name: 'Julia Ainsley',
    outlet: 'NBC News',
    categories: ['immigrationEnforcement', 'lawEnforcement'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
  {
    id: 'cooke',
    name: 'Kristina Cooke',
    outlet: 'Reuters',
    categories: ['immigrationEnforcement'],
    feed: null,
    active: false,
    note: NO_PATH_NATIONAL,
  },
];

export function activeReporters(): ReporterEntry[] {
  return ROSTER.filter((r) => r.active && r.feed !== null);
}

export function getReporter(id: string): ReporterEntry | undefined {
  return ROSTER.find((r) => r.id === id);
}

/** Human-readable beat context appended to lede-less queries. */
export function categoryLabels(keys: CategoryKey[]): string[] {
  return keys
    .map((k) => CATEGORIES.find((c) => c.key === k)?.title ?? k)
    .filter((s): s is string => Boolean(s));
}
