// Static security response headers applied to every route (#619 R10b).
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

// Pragmatic enforcing CSP (#619 R10c): high-value directives are strict
// (frame-ancestors/object-src/base-uri/form-action), while script/style keep
// 'unsafe-inline' because Next injects inline hydration scripts and Recharts/
// Tailwind emit inline styles. Violations are reported to /api/csp-report to
// inform a future strict-nonce migration. Applied in production only so it does
// not fight `next dev` (HMR uses eval/inline).
const CSP = [
  "default-src 'self'",
  // Google Analytics/Tag Manager (surfaced by the CSP report sink): gtag.js is
  // an external script and GTM uses eval, so both are allowlisted (#619 tune).
  // Cloudflare Turnstile (feedback bot check) loads its api.js + widget iframe
  // from challenges.cloudflare.com (#670).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-uri /api/csp-report',
  'report-to csp-endpoint',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    const headers = [...SECURITY_HEADERS];
    if (process.env.NODE_ENV === 'production') {
      headers.push(
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
      );
    }
    return [{ source: '/:path*', headers }];
  },

  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/robots' },
      { source: '/.well-known/security.txt', destination: '/api/security-txt' },
    ];
  },

  async redirects() {
    // 301 redirects from camelCase category paths to kebab-case slugs.
    // Frozen mapping — update when adding new categories.
    const slugRedirects = [
      ['civilService', 'civil-service'],
      ['executiveOversight', 'executive-oversight'],
      ['judicialIndependence', 'judicial-independence'],
      ['executiveActions', 'executive-actions'],
      ['infoAvailability', 'info-availability'],
      ['mediaFreedom', 'media-freedom'],
      ['lawEnforcement', 'law-enforcement'],
      ['civilLiberties', 'civil-liberties'],
      ['immigrationEnforcement', 'immigration-enforcement'],
    ];

    return [
      // R-CHARTER-2 (#820): the pillars kept the page; the charter moved to
      // /charter and the FAQ to /questions (hash forwarder on /norms).
      { source: '/why-this-matters', destination: '/norms', permanent: true },
      ...slugRedirects.flatMap(([old, slug]) => [
        {
          source: `/category/${old}`,
          destination: `/category/${slug}`,
          permanent: true,
        },
        {
          source: `/category/${old}/week/:date`,
          destination: `/category/${slug}/week/:date`,
          permanent: true,
        },
      ]),
    ];
  },
};
module.exports = nextConfig;
