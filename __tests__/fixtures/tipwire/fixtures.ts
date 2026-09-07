/** Minimal, hand-written fixtures mirroring the shapes probed on 2026-09-07. */

export const GOVEXEC_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>Government Executive - All Content</title>
<item>
<title>USDA employees dispute ‘inflated’ claim that most staff asked to relocate will do so</title>
<link>https://www.govexec.com/management/2026/09/usda-employees-challenge/415818/?utm_source=rss</link>
<pubDate>Thu, 03 Sep 2026 18:20:51 -0400</pubDate>
<description>&lt;p&gt;The Agriculture Department is telling a federal court that a majority of employees agreed to relocate.&lt;/p&gt;</description>
</item>
<item>
<title>OPM finalizes rule on probationary periods</title>
<link>https://www.govexec.com/workforce/2026/09/opm-probationary-rule/415900/</link>
<pubDate>Wed, 02 Sep 2026 09:00:00 -0400</pubDate>
<description>OPM issued a final rule.</description>
</item>
</channel>
</rss>`;

export const GOVEXEC_WORKFORCE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Workforce</title>
<item>
<title>OPM finalizes rule on probationary periods</title>
<link>https://www.govexec.com/workforce/2026/09/opm-probationary-rule/415900/</link>
<pubDate>Wed, 02 Sep 2026 09:00:00 -0400</pubDate>
<description>OPM issued a final rule.</description>
</item>
</channel></rss>`;

export const PROPUBLICA_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>ProPublica</title>
<item>
<title>ICE Detention Deaths Rose Sharply in 2026</title>
<link>https://www.propublica.org/article/ice-detention-deaths-2026</link>
<dc:creator><![CDATA[by Mica Rosenberg]]></dc:creator>
<dc:creator><![CDATA[Perla Trevizo]]></dc:creator>
<pubDate>Fri, 04 Sep 2026 10:00:00 +0000</pubDate>
<description><![CDATA[<p>Records show a rise in deaths in custody.</p>]]></description>
</item>
<item>
<title>Ken Paxton’s Financial Disclosures Appear to Violate Federal Ethics Law</title>
<link>https://www.propublica.org/article/ken-paxton-disclosures</link>
<dc:creator><![CDATA[by Someone Else]]></dc:creator>
<pubDate>Thu, 03 Sep 2026 10:00:00 +0000</pubDate>
<description>Experts say the filings fall short.</description>
</item>
</channel></rss>`;

export const GOVEXEC_ARTICLE_WAGNER = `<html><head>
<meta name="sailthru.author" content="Erich Wagner"/>
<meta property="og:description" content="Federal employee unions sued over the pay freeze."/>
<meta property="og:title" content="Unions sue over pay freeze"/>
</head><body>…</body></html>`;

export const GOVEXEC_ARTICLE_OTHER = `<html><head>
<meta name="sailthru.author" content="Jory Heckman"/>
</head><body>…</body></html>`;

export const NOTUS_AUTHOR_PAGE = `<html><head><title>Eric Katz - NOTUS</title></head><body>
<nav><a href="/about-us/jobs">Jobs</a><a href="https://www.notus.org/account/newsletters">Newsletters</a>
<a href="https://www.notus.org/perspectives/dana-milbank">Dana Milbank</a></nav>
<a href="https://www.notus.org/federal-agencies/opm-buyout-round-two">OPM buyout</a>
<a href="https://www.notus.org/2026-election/doj-encourages-election-monitor">DOJ Leader Encourages…</a>
<a href="https://www.notus.org/2026-election/doj-encourages-election-monitor?ref=author">dup</a>
<a href="https://www.notus.org/eric-katz">Eric Katz</a>
</body></html>`;

/** Monthly sitemap: the DOJ piece is newer than the OPM piece; the columnist
 *  index page is absent (it is not an article). */
export const NOTUS_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url>
		<loc>https://www.notus.org/federal-agencies/opm-buyout-round-two</loc>
		<lastmod>2026-08-28T09:01:46-04:00</lastmod>
	</url>
	<url>
		<loc>https://www.notus.org/2026-election/doj-encourages-election-monitor</loc>
		<lastmod>2026-09-01T18:52:04-04:00</lastmod>
	</url>
	<url>
		<loc>https://www.notus.org/perspectives/someone-elses-column</loc>
		<lastmod>2026-09-02T09:00:00-04:00</lastmod>
	</url>
</urlset>`;

export const NOTUS_ARTICLE_KATZ = `<html><head>
<meta property="og:title" content="DOJ Leader Encourages Employees to Sign Up for Election Monitor Duty">
<meta property="article:author" content="https://www.notus.org/eric-katz">
<meta property="article:author" content="https://www.notus.org/derek-hawkins">
<script type="application/ld+json">{"@context":"http://schema.org","@type":"Article","headline":"DOJ Leader Encourages Employees","datePublished":"2026-09-01T22:52:04.475Z","description":"Assistant Attorney General Harmeet Dhillon has said she hopes to dispatch 1,000 monitors nationwide on Election Day.","author":[{"@type":"Person","name":"Eric Katz"}]}</script>
</head><body>…</body></html>`;

export const NOTUS_ARTICLE_OTHER = `<html><head>
<meta property="og:title" content="Something by someone else">
<meta property="article:author" content="https://www.notus.org/derek-hawkins">
<meta property="og:description" content="A lede from og only.">
<meta property="article:published_time" content="2026-09-02T12:00:00Z">
</head><body>…</body></html>`;

export const PROPUBLICA_PEOPLE_PAGE = `<html><head><title>Mica Rosenberg — ProPublica</title>
<link rel="alternate" type="application/rss+xml" href="https://www.propublica.org/feeds/propublica/main" />
</head><body>
<a href="https://www.propublica.org/people/mica-rosenberg">Mica Rosenberg</a>
<a href="https://www.propublica.org/article/trump-deportations-deployed-resources-tent-company">Tent company</a>
<a href="https://www.propublica.org/article/ice-detention-deaths-2026">Detention deaths</a>
<a href="https://www.propublica.org/newsletters">Newsletters</a>
</body></html>`;

export const PROPUBLICA_ARTICLE_ROSENBERG = `<html><head>
<meta property="og:title" content="A Tent Company Made Billions on Detention">
<meta property="og:description" content="The privately held company Deployed Resources has made billions running tent detention facilities.">
<meta property="article:published_time" content="2025-04-11T09:00:00+00:00" />
<meta name="parsely-author" content="Jeff Ernsthausen">
<meta name="parsely-author" content="Mica Rosenberg">
<meta name="parsely-author" content="Avi Asher-Schapiro">
</head><body>…</body></html>`;

export const PROPUBLICA_ARTICLE_OTHER = `<html><head>
<meta property="og:title" content="Not hers">
<meta name="parsely-author" content="Megan Rose">
</head><body>…</body></html>`;
