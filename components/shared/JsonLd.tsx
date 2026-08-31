import Head from 'next/head';
import { serializeJsonLd } from '@/lib/utils/json-ld';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';

const PUBLISHER = {
  '@type': 'Organization',
  name: 'Democracy Monitor',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/logo.png`,
  },
};

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}

// ---------------------------------------------------------------------------
// Article (category-week narrative pages)
// ---------------------------------------------------------------------------

interface ArticleJsonLdProps {
  headline: string;
  description: string;
  canonicalPath: string;
  publishedAt: string | null;
  about: string;
  categoryPath: string;
  weeklyPath: string;
}

export function ArticleJsonLd({
  headline,
  description,
  canonicalPath,
  publishedAt,
  about,
  categoryPath,
  weeklyPath,
}: ArticleJsonLdProps) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url: `${SITE_URL}${canonicalPath}`,
    about: { '@type': 'Thing', name: about },
    publisher: PUBLISHER,
    isPartOf: [
      { '@type': 'WebPage', url: `${SITE_URL}${categoryPath}` },
      { '@type': 'WebPage', url: `${SITE_URL}${weeklyPath}` },
    ],
  };
  if (publishedAt) {
    data.datePublished = publishedAt;
    data.dateModified = publishedAt;
  }

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}

// ---------------------------------------------------------------------------
// CollectionPage + ItemList (weekly hub pages)
// ---------------------------------------------------------------------------

interface CollectionItem {
  name: string;
  url: string;
}

interface CollectionJsonLdProps {
  name: string;
  description: string;
  canonicalPath: string;
  items: CollectionItem[];
  publishedAt: string | null;
}

export function CollectionJsonLd({
  name,
  description,
  canonicalPath,
  items,
  publishedAt,
}: CollectionJsonLdProps) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: `${SITE_URL}${canonicalPath}`,
    publisher: PUBLISHER,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
  if (publishedAt) {
    data.datePublished = publishedAt;
    data.dateModified = publishedAt;
  }

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}

// ---------------------------------------------------------------------------
// WebSite + Organization (homepage)
// ---------------------------------------------------------------------------

export function WebSiteJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Democracy Monitor',
    url: SITE_URL,
    description:
      'A searchable repository of U.S. government documents with AI-assisted analyses of democratic institutional health across 14 categories.',
    publisher: PUBLISHER,
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}

// ---------------------------------------------------------------------------
// ItemList for category archive
// ---------------------------------------------------------------------------

interface ArchiveItem {
  name: string;
  url: string;
}

export function ArchiveItemListJsonLd({ items }: { items: ArchiveItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}

// ---------------------------------------------------------------------------
// FAQPage (/questions)
// ---------------------------------------------------------------------------

interface FaqItem {
  question: string;
  answer: string[];
}

export function FaqJsonLd({ items }: { items: readonly FaqItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer.join('\n\n') },
    })),
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
    </Head>
  );
}
