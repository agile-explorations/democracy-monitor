/**
 * Court-authored document filter for RECAP ingest (#740) — the pure half of
 * recap-fetcher.ts.
 *
 * A criminal docket carries hundreds of entries; the corpus wants the
 * court's own substantive output (opinions, memoranda, orders on motions,
 * judgments) plus the charging instruments (indictments/informations are
 * the documents a prosecution IS — owner decision), and none of the
 * scheduling minutiae or party briefing.
 */

/** Court-authored substantive documents. Order deliberately checks the
 *  negative guards first: "response to motion for order" is party paper. */
const COURT_AUTHORED =
  /\b(opinion|memorandum opinion|memorandum order|order on motion|opinion and order|findings of fact|report and recommendation|judgment(?! fund)|verdict)\b/i;
/** Charging instruments are HEAD-anchored: a "Motion to Dismiss Indictment"
 *  mentions the indictment without being it (caught by the unit tests). */
const CHARGING =
  /^\s*(?:sealed )?(?:superseding )?(?:indictment\b|criminal information\b|information\b(?=.*(?:count|charg)))/i;
const BARE_ORDER = /\border\b/i;
/** Party/administrative paper that must never match, even with "order" in
 *  the description ("motion for order", "proposed order", scheduling). */
const NOT_COURT_AUTHORED =
  /\b(motion|response|reply|brief(?!ing schedule)|notice of appearance|proposed|application|petition for|scheduling order|minute entry|summons|subpoena|transcript|exhibit|certificate of service|appearance|designation)\b/i;

/** Below this, an "order" is almost always a one-line docket order. */
export const MIN_ORDER_PAGES = 2;

export interface RecapDocumentMeta {
  id: number;
  description: string;
  entryDescription: string;
  isAvailable: boolean;
  pageCount: number | null;
}

export type RecapVerdict = 'ingest' | 'skip_party_paper' | 'skip_short_order' | 'skip_unavailable';

/** Classify one RECAP document. Pure; exported for tests. */
export function classifyRecapDocument(doc: RecapDocumentMeta): RecapVerdict {
  const text = `${doc.entryDescription} ${doc.description}`;
  const charging = CHARGING.test(doc.entryDescription) || CHARGING.test(doc.description);
  if (NOT_COURT_AUTHORED.test(text) && !COURT_AUTHORED.test(text) && !charging) {
    return 'skip_party_paper';
  }
  const substantive = COURT_AUTHORED.test(text) || charging;
  const bareOrder = !substantive && BARE_ORDER.test(text);
  if (!substantive && !bareOrder) return 'skip_party_paper';
  if (bareOrder && (doc.pageCount ?? 0) < MIN_ORDER_PAGES) return 'skip_short_order';
  if (!doc.isAvailable) return 'skip_unavailable';
  return 'ingest';
}
