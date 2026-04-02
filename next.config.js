/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async rewrites() {
    return [{ source: '/robots.txt', destination: '/api/robots' }];
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

    return slugRedirects.flatMap(([old, slug]) => [
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
    ]);
  },
};
module.exports = nextConfig;
