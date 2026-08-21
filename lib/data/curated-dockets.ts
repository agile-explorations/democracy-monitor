/**
 * Seed docket list for criminal-docket document ingest (#740).
 *
 * This list BOOTSTRAPS cases whose public salience peaked before the
 * hot-entity index existed, and serves as the exception mechanism
 * thereafter (prune a false positive, force-add an edge case). Ongoing
 * enrollment is AUTOMATIC: the weekly salience-driven discovery pass
 * (#761) enrolls new dockets when the corpus starts discussing a
 * prosecution — expected manual touch rate after v1: rare.
 *
 * Docket ids are CourtListener docket ids (the `cl:` prefix is applied at
 * use sites). Duplicate-docket pairs and appeal dockets are listed
 * together per case; document dedup is by URL at storage time.
 */

export interface CuratedDocket {
  /** Human-readable case label (documents keep CL's own case names). */
  label: string;
  /** The person the prosecution/action concerns (audit + salience join). */
  personTag: string;
  /** CL docket ids: duplicate pairs + appeal dockets. */
  docketIds: number[];
  /** Categories the ingested documents are stored under. */
  categories: string[];
}

/** Routing default (#740 owner decision): politicized prosecutions read as
 *  lawEnforcement; each case may add the categories its tracked_cases
 *  stubs already carry. */
export const DEFAULT_DOCKET_CATEGORIES = ['lawEnforcement'];

export const CURATED_DOCKETS: CuratedDocket[] = [
  {
    label: 'United States v. Comey (E.D. Va. + 4th Cir. appeal)',
    personTag: 'James Comey',
    docketIds: [71459120, 71459121],
    categories: ['lawEnforcement', 'civilLiberties'],
  },
  {
    label: 'United States v. McIver (D.N.J.)',
    personTag: 'LaMonica McIver',
    docketIds: [70514976, 70515005],
    categories: ['lawEnforcement', 'civilLiberties'],
  },
  {
    label: 'United States v. James (E.D. Va.)',
    personTag: 'Letitia James',
    docketIds: [71601414, 71067057],
    categories: ['lawEnforcement', 'civilLiberties'],
  },
];
