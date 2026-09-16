/**
 * DOJ components whose press releases belong in the searchable corpus even
 * when they fail every signal's component filter (R-SEARCH-ORTHOGONAL, #892).
 *
 * The three DOJ signals in `lib/data/categories.ts` each ask for one
 * component (criminal-division, civil-rights-division,
 * national-security-division). A release from the Attorney General's own
 * office, the Deputy AG, or Public Affairs fails all three and used to be
 * discarded at fetch time; it is now stored under the `corpus`
 * pseudo-category with both analysis flags false. The signal components are
 * listed too so a release that carries one of them alongside a leadership
 * office still qualifies when the signal filter itself is absent.
 *
 * Slugs use the same lower-cased, hyphenated form as the signal URLs and are
 * compared the way `matchesComponentSlug` compares: hyphens become spaces and
 * the component NAME must contain the phrase.
 */
export const DOJ_CORPUS_COMPONENTS: readonly string[] = [
  'office-of-the-attorney-general',
  'office-of-the-deputy-attorney-general',
  'office-of-public-affairs',
  'criminal-division',
  'civil-rights-division',
  'national-security-division',
];

/** Slug → the phrase a DOJ component name must contain ("civil-rights-division"
 *  → "civil rights division"). */
export function componentSlugPattern(slug: string): string {
  return slug.replace(/-/g, ' ').toLowerCase();
}

/** True when a component name contains the slug's phrase (case-insensitive). */
export function componentNameMatchesSlug(name: string, slug: string): boolean {
  return name.toLowerCase().includes(componentSlugPattern(slug));
}

/** True when any of a release's component names belongs to a corpus component. */
export function isCorpusComponent(componentNames: string[]): boolean {
  return componentNames.some((name) =>
    DOJ_CORPUS_COMPONENTS.some((slug) => componentNameMatchesSlug(name, slug)),
  );
}
