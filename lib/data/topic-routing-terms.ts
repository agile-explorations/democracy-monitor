/**
 * Topic-level routing terms for classifying congressional text into dashboard categories.
 *
 * Used by both CREC (Congressional Record) and LegiScan (bill) classification.
 * These terms answer "is this text ABOUT this category?" — NOT "does this
 * text contain erosion evidence?" That assessment question is handled
 * downstream by L1 (structural), L2 (AI), and L3 (thematic drift).
 *
 * Design principles:
 * - Broader than ASSESSMENT_RULES (topic routing, not erosion detection)
 * - Prefer 2-3 word phrases over single words to reduce false routing
 * - Single words only for highly specific terms (e.g., "DOGE", "FOIA", "ICE")
 * - Over-inclusive is better than under-inclusive (missed routing = missed data)
 * - Recompute baselines after backfill to account for volume changes
 */

/**
 * LegiScan subject names that confirm a bill is relevant to each category.
 * Used by filterBySubjectRelevance() to validate broad-term matches.
 * Derived from prod data (top subjects per category with >5 bills).
 */
export const LEGISCAN_SUBJECT_MAP: Record<string, string[]> = {
  rulemaking: ['Administrative law and regulatory procedures'],
  lawEnforcement: [
    'Crime and law enforcement',
    'Criminal investigation, prosecution, interrogation',
    'Law enforcement administration and funding',
  ],
  military: [
    'Armed forces and national security',
    'Military personnel and dependents',
    'Department of Defense',
  ],
  civilLiberties: ['Civil rights and liberties, minority issues'],
  executiveOversight: ['Congressional oversight', 'Government studies and investigations'],
  immigrationEnforcement: [
    'Immigration',
    'Immigration status and procedures',
    'Border security and unlawful immigration',
    'Immigrant health and welfare',
  ],
  fiscal: ['Economics and public finance', 'Appropriations', 'Budget deficits and national debt'],
  civilService: ['Government employee pay, benefits, personnel management'],
  elections: ['Elections, voting, political campaign regulation', 'Voting rights'],
  judicialIndependence: ['Law', 'Civil actions and liability'],
  executiveActions: ['Presidents and presidential powers, Vice Presidents'],
  infoAvailability: ['Government information and archives'],
  mediaFreedom: ['News media and reporting'],
  hatch: ['Federal officials'],
};

/**
 * Terms that require subject co-occurrence for LegiScan bills.
 * Only categories with empirically validated noise from broad-term matching.
 * If a bill matches ONLY broad terms (no specific terms), its subjects
 * must include at least one entry from LEGISCAN_SUBJECT_MAP for that category.
 */
export const LEGISCAN_BROAD_TERMS: Record<string, string[]> = {
  rulemaking: ['regulation', 'regulatory'],
  lawEnforcement: [
    'law enforcement',
    'Department of Justice',
    'Attorney General',
    'sentencing',
    'criminal justice',
  ],
  military: ['Department of Defense', 'national emergency', 'defense authorization'],
  civilLiberties: ['discrimination', 'privacy', 'surveillance'],
  executiveOversight: ['oversight'],
  immigrationEnforcement: ['detention', 'visa', 'refugee'],
  fiscal: ['deficit'],
};

export const TOPIC_ROUTING_TERMS: Record<string, string[]> = {
  civilService: [
    'federal employee',
    'federal worker',
    'federal workforce',
    'civil service',
    'civil servant',
    'government employee',
    'government worker',
    'government workforce',
    'federal hiring',
    'hiring freeze',
    'Schedule F',
    'Schedule C',
    'probationary employee',
    'merit system',
    'reduction in force',
    'workforce reduction',
    'OPM',
    'Office of Personnel',
    'federal pay',
    'federal benefits',
    'telework',
    'return to office',
    'DOGE',
    'government efficiency',
    'government reorganization',
    'agency restructuring',
    'Merit Systems Protection Board',
    'MSPB',
    'General Schedule',
    'excepted service',
  ],

  fiscal: [
    'federal budget',
    'federal spending',
    'appropriations committee',
    'appropriations bill',
    'continuing resolution',
    'government shutdown',
    'debt ceiling',
    'debt limit',
    'national debt',
    'deficit',
    'impoundment',
    'rescission',
    'sequestration',
    'omnibus',
    'budget resolution',
    'Treasury Department',
    'OMB',
    'CBO score',
    'fiscal responsibility',
    'balanced budget',
    'spending bill',
    'funding bill',
    'Impoundment Control Act',
    'Congressional Budget Act',
    'appropriated funds',
  ],

  executiveOversight: [
    'inspector general',
    'oversight',
    'watchdog',
    'congressional oversight',
    'whistleblower',
    'GAO',
    'Government Accountability',
    'subpoena',
    'contempt of Congress',
    'government accountability',
    'DOGE',
    'congressional investigation',
    'oversight hearing',
    'executive privilege',
    'document request',
    'testimony refused',
    'obstruction of Congress',
    'oversight committee',
    'Inspectors General',
    'CIGIE',
    // Personnel actions affecting oversight-relevant positions (compound terms to avoid noise)
    'firing of',
    'fired the',
    'termination of',
    'dismissed from',
    'FBI director',
    'removed from office',
  ],

  hatch: [
    'Hatch Act',
    'political activity',
    'partisan activity',
    'Office of Special Counsel',
    'campaign violation',
    'political appointee',
    'government resources for campaign',
    'official act for political',
    'political loyalty test',
  ],

  judicialIndependence: [
    'court order',
    'injunction',
    'judicial independence',
    'separation of powers',
    'contempt of court',
    'federal judge',
    'judicial nomination',
    'court ruling',
    'judicial review',
    'court packing',
    'judiciary committee',
    'Article III',
    'judicial vacancy',
    'federal court',
    'appellate court',
    'district court',
    'court compliance',
    'judicial pressure',
    'court defiance',
    'threatened judge',
    'impeach the judge',
    'jurisdiction stripping',
    'court expansion',
  ],

  military: [
    'Insurrection Act',
    'martial law',
    'military deployment',
    'domestic deployment',
    'National Guard',
    'posse comitatus',
    'troops deployed',
    'military force',
    'IEEPA',
    'national emergency',
    'emergency powers',
    'military at the border',
    'defense authorization',
    'military tribunals',
    'Pentagon',
    'Department of Defense',
  ],

  rulemaking: [
    'rulemaking',
    'regulatory',
    'regulation',
    'deregulation',
    'notice and comment',
    'Administrative Procedure Act',
    'APA',
    'cost-benefit analysis',
    'regulatory review',
    'executive order on regulation',
    'midnight rule',
    'Congressional Review Act',
    'regulatory burden',
    'regulatory rollback',
    'federal regulation',
    'independent agency',
  ],

  executiveActions: [
    'executive order',
    'executive action',
    'presidential memorandum',
    'proclamation',
    'signing statement',
    'executive authority',
    'executive power',
    'executive overreach',
    'unilateral action',
    'presidential authority',
    'Article II',
    'executive privilege',
    'presidential directive',
    'pen and phone',
    // Executive actions on immigration/fiscal policy
    'deferred action',
    'DACA',
    'rescission',
  ],

  infoAvailability: [
    'FOIA',
    'Freedom of Information',
    'public records',
    'open government',
    'data removed',
    'website removed',
    'scientific integrity',
    'data suppressed',
    'government data',
    'public access',
    'information access',
    'government transparency',
    'classified information',
    'classified documents',
    'declassified',
    'redacted',
  ],

  elections: [
    'election security',
    'voting rights',
    'Voting Rights Act',
    'voter suppression',
    'voter registration',
    'election integrity',
    'ballot',
    'gerrymandering',
    'redistricting',
    'campaign finance',
    'FEC',
    'Citizens United',
    'election interference',
    'election administration',
    'poll worker',
    'election official',
    'CISA',
    'Help America Vote',
    'Electoral Count',
  ],

  mediaFreedom: [
    'press freedom',
    'freedom of the press',
    'journalist',
    'reporter',
    'media access',
    'press conference',
    'shield law',
    'source protection',
    'classified leak',
    'Espionage Act',
    'press credential',
    'media blackout',
    'social media censorship',
  ],

  lawEnforcement: [
    'Department of Justice',
    'DOJ',
    'FBI',
    'Attorney General',
    'Special Counsel',
    'federal prosecution',
    'law enforcement',
    'federal investigation',
    'political prosecution',
    'selective prosecution',
    'U.S. Attorney',
    'federal indictment',
    'consent decree',
    'civil rights division',
    'criminal justice',
    'sentencing',
    'federal prison',
    'Bureau of Prisons',
  ],

  civilLiberties: [
    'civil rights',
    'civil liberties',
    'First Amendment',
    'free speech',
    'freedom of speech',
    'due process',
    'equal protection',
    'discrimination',
    'privacy',
    'surveillance',
    'Fourth Amendment',
    'religious liberty',
    'religious freedom',
    'DEI',
    'diversity equity',
    'affirmative action',
    'LGBTQ',
    'Title IX',
    'Section 702',
    'FISA',
    'warrantless',
    // Immigration enforcement impacts on civil liberties
    'travel ban',
    'immigration ban',
    'muslim ban',
    'DACA',
    'deferred action',
    'family separation',
    'catch and release',
  ],

  immigrationEnforcement: [
    'immigration',
    'immigrant',
    'border security',
    'border wall',
    'deportation',
    'asylum',
    'ICE',
    'CBP',
    'Customs and Border',
    'undocumented',
    'unauthorized immigrant',
    'migrant',
    'refugee',
    'immigration enforcement',
    'detention',
    'Title 42',
    'remain in Mexico',
    'DACA',
    'TPS',
    'visa',
    'immigration court',
    'family separation',
    'unaccompanied minor',
  ],
};

/**
 * Terms suppressed when routing JUDICIAL OPINIONS (issue #528). The shared
 * TOPIC_ROUTING_TERMS are calibrated for congressional speech, where "district
 * court" or "due process" signals the speech is ABOUT courts/rights. In a court
 * opinion those phrases are procedural boilerplate that appears in nearly every
 * document and would over-route catastrophically (R-S1f precedent). Seeded from
 * boilerplate analysis; tuned against real opinion texts via
 * scripts/audit-cl-court-routing.ts before any ingestion.
 */
export const OPINION_TERM_EXCLUDES: Record<string, string[]> = {
  judicialIndependence: [
    'court order',
    'injunction',
    'federal judge',
    'court ruling',
    'judicial review',
    'federal court',
    'appellate court',
    'district court',
    'judiciary committee',
    'judicial nomination',
    'judicial vacancy',
    'Article III',
    'contempt of court',
  ],
  civilLiberties: ['due process', 'equal protection', 'discrimination', 'privacy'],
  lawEnforcement: [
    'Department of Justice',
    'DOJ',
    'FBI',
    'Attorney General',
    'U.S. Attorney',
    'criminal justice',
    'sentencing',
    'federal prison',
    'Bureau of Prisons',
    'law enforcement',
    'federal investigation',
    'federal indictment',
    'federal prosecution',
    'Special Counsel',
  ],
  executiveOversight: [
    'oversight',
    'subpoena',
    'termination of',
    'dismissed from',
    'firing of',
    'fired the',
    'document request',
  ],
  executiveActions: ['rescission'],
  // 'sequestration' matches jury sequestration in criminal opinions (audit: Villarreal v. Texas)
  fiscal: ['rescission', 'deficit', 'sequestration'],
  infoAvailability: ['redacted'],
  mediaFreedom: ['reporter'],
  // 'Customs and Border' matches CAFC tariff cases where CBP is a party (audit: Hmtx v. US)
  immigrationEnforcement: ['detention', 'Customs and Border'],
  military: ['Department of Defense'],
  rulemaking: ['regulation', 'regulatory', 'federal regulation'],
  // 'Special Counsel' collides with Office of Special Counsel in removal cases (audit: Margolin, Grundmann);
  // 'Citizens United' matches case CITATIONS in unrelated suits (audit: TPS Alliance v. Noem)
  elections: ['Citizens United'],
};

/**
 * Opinion-only routing terms ADDED on top of TOPIC_ROUTING_TERMS for judicial
 * opinions — case-law vocabulary that congressional speech rarely uses. Kept
 * separate so shared CREC/LegiScan routing is unaffected.
 */
export const OPINION_TERM_ADDITIONS: Record<string, string[]> = {
  immigrationEnforcement: [
    'Alien Enemies Act',
    'expedited removal',
    'Immigration and Nationality Act',
  ],
  rulemaking: ["Humphrey's Executor", 'removal power', 'for-cause removal', 'removal protection'],
  executiveActions: ['birthright citizenship', 'presidential proclamation'],
  fiscal: ['withholding of funds', 'withhold appropriated', 'Antideficiency Act'],
};

/**
 * Hearing-only term EXCLUDES (#610 rehearsal calibration): committee-opening
 * boilerplate ("this oversight hearing of the committee…") routed 60% of all
 * 2019-Q2 hearings into executiveOversight, including SBA loan-program and
 * veteran-suicide hearings. The specific terms (inspector general, subpoena,
 * whistleblower, executive privilege…) stay. Kept separate so shared
 * CREC/LegiScan routing is unaffected — same pattern as OPINION_TERM_EXCLUDES.
 */
export const HEARING_TERM_EXCLUDES: Record<string, string[]> = {
  executiveOversight: ['oversight', 'oversight hearing', 'oversight committee'],
};

/**
 * Hearing-only routing terms ADDED on top of TOPIC_ROUTING_TERMS: hearing
 * subjects congressional floor speech rarely names directly. From the 2019-Q2
 * recall audit ("The Federal Judiciary in the 21st Century: Ideas for
 * Promoting Ethics, Accountability…" routed nowhere).
 */
export const HEARING_TERM_ADDITIONS: Record<string, string[]> = {
  judicialIndependence: ['federal judiciary', 'judicial ethics', 'judicial accountability'],
};
