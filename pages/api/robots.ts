/** GET /api/robots.txt — dynamic robots.txt, blocks indexing on non-production sites. */

import type { NextApiRequest, NextApiResponse } from 'next';

const PROD_URL = 'https://democracymonitor.us';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? PROD_URL;
const IS_PRODUCTION = SITE_URL === PROD_URL;

export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, s-maxage=86400');

  if (IS_PRODUCTION) {
    res.status(200).send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/api/sitemap.xml
`);
  } else {
    res.status(200).send(`User-agent: *
Disallow: /
`);
  }
}
