import { expect, test } from '@playwright/test';

/**
 * SEO contract tests — verify SSR pages, meta tags, headers, redirects.
 *
 * These tests run against a live server (dev or production).
 * Set BASE_URL env var to target a specific server.
 *
 * Test dates are chosen from known-good data:
 *   - Category-week: civilService 2026-03-09 (ConfirmedConcern, 5584 char narrative)
 *   - Weekly hub: 2026-03-09 (has both _overview and _term_summary)
 */

const TEST_WEEK = '2026-03-09';
const TEST_CATEGORY_SLUG = 'civil-service';
const TEST_CATEGORY_KEY = 'civilService';

// Next.js dev server overrides Cache-Control to no-store.
// Only check cache headers when running against `pnpm start` or production.
// Set SKIP_CACHE_TESTS=1 to skip these tests when running against `pnpm dev`.
const SKIP_CACHE_TESTS = process.env.SKIP_CACHE_TESTS === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract content of a meta tag by name from HTML. */
function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i');
  const altRe = new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, 'i');
  return re.exec(html)?.[1] ?? altRe.exec(html)?.[1] ?? null;
}

/** Extract content of a meta tag by property from HTML. */
function metaProperty(html: string, prop: string): string | null {
  const re = new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]*)"`, 'i');
  const altRe = new RegExp(`<meta\\s+content="([^"]*)"\\s+property="${prop}"`, 'i');
  return re.exec(html)?.[1] ?? altRe.exec(html)?.[1] ?? null;
}

/** Extract href of <link rel="canonical"> from HTML. */
function canonicalHref(html: string): string | null {
  const re = /<link\s+rel="canonical"\s+href="([^"]*)"/i;
  const altRe = /<link\s+href="([^"]*)"\s+rel="canonical"/i;
  return re.exec(html)?.[1] ?? altRe.exec(html)?.[1] ?? null;
}

/** Extract <title> content from HTML. */
function titleContent(html: string): string | null {
  const re = /<title>([^<]*)<\/title>/i;
  return re.exec(html)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// R-SEO1: Foundation
// ---------------------------------------------------------------------------

test.describe('R-SEO1: Foundation', () => {
  test('robots.txt is accessible and references sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /api/');
    expect(body).toMatch(/Sitemap:\s*https:\/\/democracymonitor\.us\/api\/sitemap\.xml/);
  });

  test('sitemap returns valid XML with expected entry types', async ({ request }) => {
    const response = await request.get('/api/sitemap.xml');
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('xml');
    const body = await response.text();
    expect(body).toContain('<urlset');

    // Static pages
    expect(body).toContain('<loc>https://democracymonitor.us/</loc>');
    expect(body).toContain('<loc>https://democracymonitor.us/search</loc>');

    // Category landings (kebab-case)
    expect(body).toContain(`<loc>https://democracymonitor.us/category/${TEST_CATEGORY_SLUG}</loc>`);

    // Should have weekly and category-week entries (requires DB data)
    expect(body).toMatch(/<loc>https:\/\/democracymonitor\.us\/weekly\/\d{4}-\d{2}-\d{2}<\/loc>/);
    expect(body).toMatch(
      /<loc>https:\/\/democracymonitor\.us\/category\/[a-z-]+\/week\/\d{4}-\d{2}-\d{2}<\/loc>/,
    );
  });

  test('301 redirect from camelCase to kebab-case category', async ({ request }) => {
    const response = await request.get(`/category/${TEST_CATEGORY_KEY}`, {
      maxRedirects: 0,
    });
    // Next.js uses 308 (Permanent Redirect) for redirects defined in next.config.js
    expect(response.status()).toBe(308);
    const location = response.headers()['location'] ?? '';
    expect(location).toContain(`/category/${TEST_CATEGORY_SLUG}`);
  });

  test('homepage has SEOHead', async ({ request }) => {
    const response = await request.get('/');
    const body = await response.text();
    expect(titleContent(body)).toContain('Democracy Monitor');
    expect(metaContent(body, 'description')).toBeTruthy();
    expect(canonicalHref(body)).toMatch(/\/$/);
  });
});

// ---------------------------------------------------------------------------
// R-SEO2: SSR Narrative Pages
// ---------------------------------------------------------------------------

test.describe('R-SEO2: Category-week SSR page', () => {
  const url = `/category/${TEST_CATEGORY_SLUG}/week/${TEST_WEEK}`;

  test('renders narrative text in HTML source (SSR)', async ({ request }) => {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    const body = await response.text();

    // The narrative content should be in the HTML, not loaded client-side.
    // Expert narratives for this category-week are ~5500 chars.
    expect(body.length).toBeGreaterThan(2000);

    // Should NOT contain loading skeleton only
    expect(body).not.toMatch(/Loading week data/);
  });

  test('has correct title and meta tags', async ({ request }) => {
    const response = await request.get(url);
    const body = await response.text();

    const title = titleContent(body);
    // Title uses category.title from CATEGORIES, e.g. "Government Worker Protections"
    expect(title).toBeTruthy();
    expect(title).toContain('Democracy Monitor');

    expect(metaContent(body, 'description')).toBeTruthy();
    expect(canonicalHref(body)).toContain(`/category/${TEST_CATEGORY_SLUG}/week/${TEST_WEEK}`);
    expect(metaProperty(body, 'og:title')).toBeTruthy();

    // Should NOT have noindex
    expect(metaContent(body, 'robots')).toBeNull();
  });

  test('returns Cache-Control headers @prod-only', async ({ request }) => {
    test.skip(SKIP_CACHE_TESTS, 'Next.js dev server overrides Cache-Control');
    const response = await request.get(url);
    const cacheControl = response.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('s-maxage=3600');
    expect(cacheControl).toContain('stale-while-revalidate');
  });

  test('returns 404 for non-existent narrative week', async ({ request }) => {
    const response = await request.get(`/category/${TEST_CATEGORY_SLUG}/week/2020-01-01`);
    expect(response.status()).toBe(404);
  });

  test('returns 404 for invalid date format', async ({ request }) => {
    const response = await request.get(`/category/${TEST_CATEGORY_SLUG}/week/not-a-date`);
    expect(response.status()).toBe(404);
  });

  test('301 redirect from camelCase week URL', async ({ request }) => {
    const response = await request.get(`/category/${TEST_CATEGORY_KEY}/week/${TEST_WEEK}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    const location = response.headers()['location'] ?? '';
    expect(location).toContain(`/category/${TEST_CATEGORY_SLUG}/week/${TEST_WEEK}`);
  });

  test('has breadcrumb navigation', async ({ request }) => {
    const response = await request.get(url);
    const body = await response.text();
    expect(body).toContain(`/category/${TEST_CATEGORY_SLUG}`);
    expect(body).toContain('Overview');
  });
});

test.describe('R-SEO2: Weekly hub SSR page', () => {
  const url = `/weekly/${TEST_WEEK}`;

  test('renders both overview and term summary in HTML source', async ({ request }) => {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    const body = await response.text();

    // Should contain section headings for both narratives
    expect(body).toContain('Weekly Overview');
    expect(body).toContain('Term Summary');

    // Substantial content
    expect(body.length).toBeGreaterThan(3000);
  });

  test('has correct title and meta tags', async ({ request }) => {
    const response = await request.get(url);
    const body = await response.text();

    const title = titleContent(body);
    expect(title).toContain('Weekly Summary');
    expect(title).toContain('Democracy Monitor');

    expect(metaContent(body, 'description')).toBeTruthy();
    expect(canonicalHref(body)).toContain(`/weekly/${TEST_WEEK}`);

    // Should NOT have noindex
    expect(metaContent(body, 'robots')).toBeNull();
  });

  test('returns Cache-Control headers @prod-only', async ({ request }) => {
    test.skip(SKIP_CACHE_TESTS, 'Next.js dev server overrides Cache-Control');
    const response = await request.get(url);
    const cacheControl = response.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('s-maxage=3600');
    expect(cacheControl).toContain('stale-while-revalidate');
  });

  test('lists elevated categories with links', async ({ request }) => {
    const response = await request.get(url);
    const body = await response.text();
    // Should contain links to category-week SSR pages
    expect(body).toMatch(/\/category\/[a-z-]+\/week\/\d{4}-\d{2}-\d{2}/);
  });

  test('returns 404 for non-existent weekly page', async ({ request }) => {
    const response = await request.get('/weekly/2020-01-01');
    expect(response.status()).toBe(404);
  });

  test('returns 404 for invalid date format', async ({ request }) => {
    const response = await request.get('/weekly/not-a-date');
    expect(response.status()).toBe(404);
  });
});

test.describe('R-SEO2: noindex on query-param pages', () => {
  // The category landing page is client-rendered (no SSR), so meta tags
  // are injected by React's <Head> component on the client side.
  // We need a browser to render JS and verify the final DOM.

  test('category page with weekOf has noindex and canonical to SSR page', async ({ page }) => {
    await page.goto(`/category/${TEST_CATEGORY_SLUG}?weekOf=${TEST_WEEK}`, {
      waitUntil: 'networkidle',
    });

    const robots = await page.getAttribute('meta[name="robots"]', 'content');
    expect(robots).toContain('noindex');

    const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
    expect(canonical).toContain(`/category/${TEST_CATEGORY_SLUG}/week/${TEST_WEEK}`);
  });

  test('category page without weekOf does NOT have noindex', async ({ page }) => {
    await page.goto(`/category/${TEST_CATEGORY_SLUG}`, { waitUntil: 'networkidle' });

    const robotsEl = await page.$('meta[name="robots"]');
    expect(robotsEl).toBeNull();

    const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
    expect(canonical).toContain(`/category/${TEST_CATEGORY_SLUG}`);
    expect(canonical).not.toContain('/week/');
  });
});
