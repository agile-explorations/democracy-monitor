import Head from 'next/head';

const SITE_NAME = 'Democracy Monitor';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

interface SEOHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
  /** 'article' for narrative pages, 'website' for everything else */
  ogType?: 'website' | 'article';
  /** ISO date string for article:published_time */
  publishedAt?: string | null;
  /** Custom OG image URL (defaults to static branded image) */
  ogImage?: string;
}

export function SEOHead({
  title,
  description,
  canonicalPath,
  noindex,
  ogType = 'website',
  publishedAt,
  ogImage,
}: SEOHeadProps) {
  const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`;
  const canonicalUrl = canonicalPath ? `${SITE_URL}${canonicalPath}` : undefined;
  const imageUrl = ogImage ?? DEFAULT_OG_IMAGE;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex,follow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* OpenGraph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle} />

      {/* Article metadata */}
      {ogType === 'article' && publishedAt && (
        <meta property="article:published_time" content={publishedAt} />
      )}
      {ogType === 'article' && publishedAt && (
        <meta property="article:modified_time" content={publishedAt} />
      )}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  );
}
