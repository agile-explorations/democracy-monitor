/**
 * Document-population constants shared by server predicates and client
 * components (R-SEARCH-ORTHOGONAL). Kept free of database imports so the
 * search UI can label unrouted documents without pulling Drizzle into the
 * client bundle. The predicates themselves live in lib/db/document-filters.ts.
 */

/** Pseudo-category for documents no router placed (CHRG, CREC, CL, CPD,
 *  DOJ): stored for search with both analysis flags false. The literal lives
 *  here, in validate-graph (G6/G8) and the population tripwire only. */
export const CORPUS_CATEGORY = 'corpus';

/** Reader-facing label for unrouted and off-topic documents. */
export const UNROUTED_CATEGORY_LABEL = 'Not routed to a category';

/** Category key as shown to readers and to the synthesis model. */
export function displayCategoryKey(category: string): string {
  return category === CORPUS_CATEGORY ? UNROUTED_CATEGORY_LABEL : category;
}
