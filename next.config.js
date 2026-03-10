/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

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

    return slugRedirects.map(([old, slug]) => ({
      source: `/category/${old}`,
      destination: `/category/${slug}`,
      permanent: true,
    }));
  },
};
module.exports = nextConfig;
