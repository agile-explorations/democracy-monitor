/**
 * Dynamic sitemap — quality-gated, only includes pages with substantive content.
 *
 * Includes: static pages, category landings, weekly pages (with substantive overview),
 * and category-week narrative pages (Elevated+ with >500 char expert narrative).
 */

import { sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import { isDbAvailable, getDb } from '@/lib/db';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';
const MIN_NARRATIVE_LENGTH = 500;

interface SitemapEntry {
  loc: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
}

function staticEntries(): SitemapEntry[] {
  return [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/search', changefreq: 'weekly', priority: '0.6' },
    { loc: '/charter', changefreq: 'monthly', priority: '0.7' },
    { loc: '/norms', changefreq: 'monthly', priority: '0.7' },
    { loc: '/questions', changefreq: 'monthly', priority: '0.6' },
    { loc: '/system/methodology', changefreq: 'monthly', priority: '0.4' },
    { loc: '/system/self-tests', changefreq: 'weekly', priority: '0.5' },
    { loc: '/system/lens', changefreq: 'monthly', priority: '0.4' },
    { loc: '/system/reversals', changefreq: 'weekly', priority: '0.5' },
    { loc: '/system/health', changefreq: 'daily', priority: '0.3' },
    { loc: '/system/architecture', changefreq: 'monthly', priority: '0.3' },
  ];
}

function categoryLandingEntries(): SitemapEntry[] {
  return CATEGORIES.map((cat) => ({
    loc: `/category/${keyToSlug(cat.key)}`,
    changefreq: 'daily',
    priority: '0.8',
  }));
}

async function weeklyEntries(): Promise<SitemapEntry[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.week_of
    FROM narratives n
    WHERE n.category = '_overview'
      AND n.version = 'expert'
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
    ORDER BY n.week_of DESC
  `);

  return (rows.rows as { week_of: string }[]).map((r) => {
    const date = String(r.week_of).slice(0, 10);
    return {
      loc: `/weekly/${date}`,
      changefreq: 'weekly',
      priority: '0.9',
      lastmod: date,
    };
  });
}

async function categoryWeekEntries(): Promise<SitemapEntry[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT n.category, n.week_of
    FROM narratives n
    INNER JOIN weekly_aggregates wa
      ON wa.category = n.category AND wa.week_of = n.week_of
    WHERE n.version = 'expert'
      AND n.category NOT IN ('_overview', '_term_summary')
      AND length(n.content) > ${MIN_NARRATIVE_LENGTH}
      AND wa.convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
    ORDER BY n.week_of DESC, n.category
  `);

  return (rows.rows as { category: string; week_of: string }[]).map((r) => {
    const date = String(r.week_of).slice(0, 10);
    return {
      loc: `/category/${keyToSlug(r.category)}/week/${date}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: date,
    };
  });
}

function toXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${SITE_URL}${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const entries = [...staticEntries(), ...categoryLandingEntries()];

  if (isDbAvailable()) {
    try {
      const [weekly, catWeek] = await Promise.all([weeklyEntries(), categoryWeekEntries()]);
      entries.push(...weekly, ...catWeek);
    } catch (err) {
      console.error('[sitemap] DB query failed, serving static entries only:', err);
    }
  }

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(toXml(entries));
}
