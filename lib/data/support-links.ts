/**
 * Payment links for the /support page (#531).
 *
 * URLs are Stripe Payment Links on the Agile Explorations LLC standard
 * account. If a link is ever swapped out, use a PLACEHOLDER_ value in the
 * interim — the page renders a "coming soon" notice while any placeholder
 * remains.
 */

export const MONTHLY_OPERATING_COST_USD = 250;

export const ONE_TIME_SUPPORT_URL = 'https://buy.stripe.com/9B628qfBZ6pqdpqdQka3u00';

export const MONTHLY_SUPPORT_TIERS = [
  { amountUsd: 5, url: 'https://buy.stripe.com/00w14mcpNeVW712fYsa3u01' },
  { amountUsd: 10, url: 'https://buy.stripe.com/8x2aEW89x012fxy7rWa3u02' },
  { amountUsd: 25, url: 'https://buy.stripe.com/00w9AS0H56pq3OQ27Ca3u03' },
] as const;

export const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/agile-explorations';

export function isPlaceholderLink(url: string): boolean {
  return url.startsWith('PLACEHOLDER_');
}
