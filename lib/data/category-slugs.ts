/**
 * Frozen bidirectional mapping between internal camelCase category keys
 * and URL-friendly kebab-case slugs.
 *
 * DO NOT generate slugs algorithmically — this table is frozen to ensure
 * URL stability. When adding a new category, add an entry here.
 */

const KEY_TO_SLUG: Record<string, string> = {
  civilService: 'civil-service',
  fiscal: 'fiscal',
  executiveOversight: 'executive-oversight',
  hatch: 'hatch',
  judicialIndependence: 'judicial-independence',
  military: 'military',
  rulemaking: 'rulemaking',
  executiveActions: 'executive-actions',
  infoAvailability: 'info-availability',
  elections: 'elections',
  mediaFreedom: 'media-freedom',
  lawEnforcement: 'law-enforcement',
  civilLiberties: 'civil-liberties',
  immigrationEnforcement: 'immigration-enforcement',
};

const SLUG_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_TO_SLUG).map(([k, v]) => [v, k]),
);

/** Convert an internal category key (camelCase) to a URL slug (kebab-case). */
export function keyToSlug(key: string): string {
  return KEY_TO_SLUG[key] ?? key;
}

/** Convert a URL slug (kebab-case) to an internal category key (camelCase). */
export function slugToKey(slug: string): string | undefined {
  return SLUG_TO_KEY[slug];
}

/** All valid URL slugs. */
export function allSlugs(): string[] {
  return Object.values(KEY_TO_SLUG);
}
