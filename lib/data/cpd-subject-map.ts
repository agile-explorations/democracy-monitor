/**
 * CPD (Compilation of Presidential Documents) subject-to-category mapping.
 *
 * Maps NARA-curated subject terms to our 14 monitoring categories.
 * Many-to-many: a subject can map to multiple categories, and a document
 * with multiple subjects routes to the union of their categories.
 *
 * Subjects not in this map are logged as unmapped for periodic review.
 * The mapping is deterministic and auditable — no fuzzy matching.
 *
 * Source: GovInfo CPD collection, NARA controlled vocabulary.
 * Vocabulary enumerated from 150+ sampled documents across 5 analysis periods.
 * 164 mapped terms, 91 expected-unmapped terms; validated at 100% coverage on 22-doc sample.
 * +16 terms 2026-08-31 from the 57-package skip review (owner-approved exact strings —
 * IEEPA emergency continuations, monument actions, EO 14406/14408 subjects, Iran/Venezuela
 * military operations, 'United States Trade Representative' spelling variant).
 */

/**
 * Map from CPD subject term (exact match, case-sensitive) to one or more category keys.
 *
 * Design principles:
 * - Only map subjects that carry a meaningful signal for erosion detection
 * - Generic subjects (country names, holidays, sports) are intentionally unmapped
 * - Department/agency names map to their oversight category
 * - Prefer specificity: "Inspector General" → executiveOversight, not broadly to everything
 */
export const CPD_SUBJECT_TO_CATEGORIES: ReadonlyMap<string, readonly string[]> = new Map([
  // --- executiveActions ---
  // 2026-08-31 skip review (#798 follow-up, owner-approved exact strings):
  // IEEPA national-emergency continuations + Antiquities Act monument actions.
  ['Belarus, U.S. national emergency continuation', ['executiveActions']],
  ['Central African Republic,  U.S. national emergency continuation', ['executiveActions']], // double space in NARA data
  [
    'Hostage-taking and wrongful detention of U.S. nationals abroad, U.S. national emergency',
    ['executiveActions'],
  ],
  ['Iraq, U.S. national emergency continuation', ['executiveActions']],
  ['Mali, U.S. national emergency continuation', ['executiveActions']],
  ['North Korea, U.S. national emergency continuation', ['executiveActions']],
  [
    'Transnational criminal organizations, U.S. national emergency continuation',
    ['executiveActions'],
  ],
  ['Western Balkans, U.S. national emergency continuation', ['executiveActions']],
  ['Yemen, U.S. national emergency continuation', ['executiveActions']],
  ['Public and Tribal lands, conservation and management', ['executiveActions']],
  ['Utah, Bears Ears National Monument', ['executiveActions']],
  ['Utah, Grand Staircase-Escalante National Monument', ['executiveActions']],
  ['Presidency, U.S', ['executiveActions']],
  ['Legislation, enacted', ['executiveActions']],
  ['Legislation, proposed', ['executiveActions']],
  ['Defense Production Act of 1950', ['executiveActions', 'military']],
  ['Defense Production Act of 1950, executive authorities', ['executiveActions', 'military']],

  // --- executiveOversight ---
  ['Government organization and employees', ['executiveOversight', 'civilService']],
  ['Government accountability and transparency, strengthening efforts', ['executiveOversight']],
  ['Government accountability and transparency, improvement efforts', ['executiveOversight']],
  ['Government spending, reduction efforts', ['executiveOversight', 'fiscal']],
  ['Department of Justice Inspector General', ['executiveOversight']],
  ['Inspector General', ['executiveOversight']],
  ['International Development, U.S. Agency for', ['executiveOversight']],
  ['U.S. DOGE Service', ['executiveOversight', 'civilService']],
  ['National Archives and Records Administration', ['executiveOversight', 'infoAvailability']],
  ['Government contracting and procurement, improvement efforts', ['executiveOversight']],
  ['Security clearances for former Government officials, revocation', ['executiveOversight']],
  ['White House Office', ['executiveOversight']],
  ['White House Senior Adviser', ['executiveOversight']],
  ['Cabinet meetings', ['executiveOversight']],
  ['Pardons and commutations', ['executiveOversight', 'lawEnforcement']],
  ['State, Department of', ['executiveOversight']],
  ['Domestic Policy Council', ['executiveOversight']],
  ['National Economic Council', ['executiveOversight', 'fiscal']],
  ['U.S. Trade Representative', ['fiscal']],

  // --- civilService ---
  ['Employment and unemployment', ['civilService']],
  ['Federal workforce, reduction efforts', ['civilService']],
  ['Federal Government recruitment and retention practices, improvement efforts', ['civilService']],
  ['Federal agencies and employees, return to in-person work', ['civilService']],
  ['Federal  agencies and employees, return to in-person work', ['civilService']], // typo in NARA data
  ['Office of Personnel Management', ['civilService']],
  ['Office of Management and Budget', ['civilService', 'fiscal']],
  ['Labor, Department of', ['civilService']],
  ['Labor issues', ['civilService']],

  // --- judicialIndependence ---
  ['Judiciary', ['judicialIndependence']],
  ['Justice, Department of', ['judicialIndependence', 'lawEnforcement', 'executiveOversight']],
  ['Attorney General', ['judicialIndependence', 'lawEnforcement']],
  ['Supreme Court Associate Justice', ['judicialIndependence']],
  ['Senate confirmation process', ['judicialIndependence']],

  // --- lawEnforcement ---
  ['Law enforcement and crime', ['lawEnforcement']],
  ['Drug abuse and trafficking', ['lawEnforcement']],
  ['Illegal drugs, interdiction efforts', ['lawEnforcement']],
  ['Opioid epidemic, efforts to combat', ['lawEnforcement']],
  ['Transnational criminal organizations', ['lawEnforcement']],
  ['Federal Bureau of Investigation', ['lawEnforcement']],
  ['Capitol Police, U.S', ['lawEnforcement']],
  ['U.S. Capitol Police', ['lawEnforcement']],
  ['District of Columbia, Metropolitan Police Department', ['lawEnforcement']],
  ['District of Columbia, law enforcement improvement efforts', ['lawEnforcement']],
  ['Gun control efforts', ['lawEnforcement', 'civilLiberties']],
  ['Gun violence, prevention efforts', ['lawEnforcement', 'civilLiberties']],
  ['Human trafficking, efforts to combat', ['lawEnforcement']],
  ['2021 civil unrest and violence at U.S. Capitol', ['lawEnforcement']],
  [
    'Congressional Select Committee To Investigate the January 6th Attack on the United States Capitol',
    ['executiveOversight', 'lawEnforcement'],
  ],

  // --- civilLiberties ---
  ['Civil rights', ['civilLiberties']],
  ['Civil rights movement', ['civilLiberties']],
  ['Voting rights, protection efforts', ['civilLiberties', 'elections']],
  ['Diversity, equity, and inclusion, improvement efforts', ['civilLiberties']],
  ['Women and girls', ['civilLiberties']],
  ['Housing discrimination, efforts to combat', ['civilLiberties']],
  ['Anti-Semitism', ['civilLiberties']],
  ['Hate-based violence, efforts to combat', ['civilLiberties']],
  ['Transgender athletes, efforts to restrict participation', ['civilLiberties']],

  // --- elections ---
  ['Elections', ['elections']],
  ['Election security and integrity, strengthening efforts', ['elections']],
  ['Voter participation', ['elections']],
  ['2024 Presidential election', ['elections']],

  // --- immigrationEnforcement ---
  ['Immigration and naturalization', ['immigrationEnforcement', 'civilLiberties']],
  ['Illegal immigration', ['immigrationEnforcement']],
  ['Border security', ['immigrationEnforcement']],
  ['Immigration reform', ['immigrationEnforcement']],
  ['Undocumented immigrants, deportation of criminals', ['immigrationEnforcement']],
  [
    'Foreign nationals and refugees, U.S. admission policy',
    ['immigrationEnforcement', 'civilLiberties'],
  ],
  ['Refugees and migrants, U.S. admission policy', ['immigrationEnforcement']],
  ['Mexico, immigration enforcement cooperation with U.S', ['immigrationEnforcement']],
  ['Mexico, border with U.S., infrastructure and security', ['immigrationEnforcement']],
  ['Visa policy, U.S', ['immigrationEnforcement']],
  ['Migration flows, international cooperation', ['immigrationEnforcement']],

  // --- fiscal ---
  ["America's financial system, restoring integrity", ['fiscal']], // 2026-08-31 skip review
  ['United States Trade Representative', ['fiscal']], // NARA spelling variant of 'U.S. Trade Representative'
  ['Taxation', ['fiscal']],
  ['Tax Code reform', ['fiscal']],
  ['Tax avoidance and underpayment, enforcement efforts', ['fiscal']],
  ['Budget, Federal', ['fiscal']],
  ['Economy, national', ['fiscal']],
  ['Inflation', ['fiscal']],
  ['Interest rates', ['fiscal']],
  ['Federal deficit and debt', ['fiscal']],
  ['Federal Reserve System', ['fiscal']],
  ['Reserve System, Federal', ['fiscal']],
  ['Treasury, Department of the', ['fiscal']],
  ['Treasury, Department of', ['fiscal']],
  ['Secretary of the Treasury', ['fiscal']],
  ['Social Security and retirement', ['fiscal']],
  ['Social Security program', ['fiscal']],
  ['Medicare and Medicaid programs', ['fiscal']],
  ['Balanced Budget and Emergency Deficit Control Act of 1985', ['fiscal']],

  // --- military ---
  ['Iran, U.S. military operations', ['military']], // 2026-08-31 skip review
  ['Venezuela, U.S. military capture and exfiltration of President Maduro', ['military']],
  ['Armed Forces, U.S', ['military']],
  ['Defense and national security', ['military']],
  ['Defense and national  security', ['military']], // typo in NARA data
  ['Defense, Department of', ['military']],
  ['Secretary of Defense', ['military']],
  ['Army, Department of the', ['military']],
  ['Navy, Department of the', ['military']],
  ['Navy. Department of the', ['military']], // typo in NARA data
  ['Air Force, Department of the', ['military']],
  ['Joint Chiefs of Staff', ['military']],
  ['National Guard', ['military']],
  ['U.S. servicemembers, service and dedication', ['military']],
  ['U.S. military readiness, improvement efforts', ['military']],
  ['U.S. Armed Forces, funding and equipment, improvement efforts', ['military']],
  ['Nuclear weapons, nonproliferation efforts', ['military']],
  ['Arms and munitions', ['military']],
  ['North Atlantic Treaty Organization', ['military']],
  ['Guantanamo Bay, U.S. Naval Base in Cuba, detention facility', ['military', 'lawEnforcement']],

  // --- military (emergency powers / national security apparatus) ---
  ['Homeland Security, Department of', ['military', 'immigrationEnforcement']],
  ['Secretary of Homeland Security', ['military', 'immigrationEnforcement']],
  ['Terrorism', ['military', 'civilLiberties']], // monitor for noise — counter-terrorism intersects civil liberties
  ['Federal Emergency Management Agency (FEMA)', ['military']],
  ['Disaster assistance to States', ['military']],
  ['Natural disasters', ['military']],
  ['Classified national security information', ['military']],
  ['Office of the Director of National Intelligence', ['military']],
  ['Central Intelligence Agency', ['military']],

  // --- rulemaking ---
  ['Federal regulations, reduction efforts', ['rulemaking']], // 2026-08-31 skip review
  ['Chemical manufacturing security, regulatory relief', ['rulemaking']],
  ['Environment', ['rulemaking']],
  ['Environmental Protection Agency', ['rulemaking']],
  ['Energy', ['rulemaking']],
  ['Climate change', ['rulemaking']],
  ['Renewable energy sources and technologies', ['rulemaking']],
  ['Clean energy transition in developing countries, international assistance', ['rulemaking']],
  ['Methane emissions, reduction efforts', ['rulemaking']],
  ['Science and technology', ['rulemaking']],
  ['Artificial intelligence and other emerging technologies', ['rulemaking']],
  ['Food and Drugs Administration', ['rulemaking']],
  ['Communications Commission, Federal', ['rulemaking', 'mediaFreedom']],
  ['Trade Commission, Federal', ['rulemaking']],
  ['Aviation Administration, Federal', ['rulemaking']],

  // --- infoAvailability ---
  ['Communications', ['infoAvailability']],
  ['News media, Presidential interviews', ['infoAvailability', 'mediaFreedom']],

  // --- mediaFreedom ---
  // (most media subjects are captured via infoAvailability or rulemaking mappings above)

  // --- Cross-cutting: commerce/trade (routes to fiscal + rulemaking) ---
  ['Commerce, international', ['fiscal']],
  ['Tariffs', ['fiscal']],
  ['U.S. tariffs on imports, adjustment', ['fiscal']],
  ['U.S. steel and aluminum industry, strengthening efforts', ['fiscal']],

  // --- Health (routes to rulemaking for regulatory dimension) ---
  ['Health and medical care', ['rulemaking']],
  ['Health care costs and affordability', ['rulemaking', 'fiscal']],
  ['Prescription drug costs, reduction efforts', ['rulemaking']],
  ['Health and Human Services, Department of', ['rulemaking']],
  ['Secretary of Health and Human Services', ['rulemaking']],
  ['Centers for Medicare and Medicaid Services', ['rulemaking', 'fiscal']],
  ['Patient Protection and Affordable Care Act', ['rulemaking']],
  ['Diseases', ['rulemaking']],
  ['COVID-19 pandemic', ['rulemaking', 'military']],
  ['Coronavirus pandemic, international cooperation efforts', ['rulemaking']],
  ['COVID\u201319 pandemic', ['rulemaking', 'military']],

  // --- Housing/infrastructure (regulatory) ---
  ['Housing, affordability and access', ['rulemaking']],
  ['Housing and Urban Development, Department of', ['rulemaking']],
  ['Infrastructure improvements', ['rulemaking']],
  ['Infrastructure, national improvement efforts', ['rulemaking']],
  ['Infrastructure', ['rulemaking']],
  ['Transportation', ['rulemaking']],
  ['Transportation, Department of', ['rulemaking']],
  ['Education', ['rulemaking']],

  // --- Veterans (civil service + military) ---
  ['Veterans', ['military', 'civilService']],
  ['Veterans Affairs, Department of', ['military', 'civilService']],
  ['Secretary of Veterans Affairs', ['military', 'civilService']],

  // --- Agriculture ---
  ['Agriculture', ['rulemaking']],
  ['Agriculture, Department of', ['rulemaking']],
]);

/**
 * Subjects intentionally left unmapped. These are too generic or
 * don't carry erosion-detection signal. Logged for periodic review.
 *
 * Categories: country names, state names, holidays, sports, foreign leaders,
 * generic "business and industry", personal deaths/observances.
 */
export const CPD_UNMAPPED_SUBJECTS_EXPECTED = new Set([
  'Congress', // Too broad — could be any category
  'Holidays and special observances',
  'Deaths',
  'Sports',
  'Football',
  'White House Staff Secretary',
  'Vice President',
  'Speaker of the House of Representatives',
  'Senate minority leader',
  'Senate majority leader',
  'Bipartisanship',
  'Republican Party',
  'Decorations, medals, and awards',
  'Voluntarism',
  'March for Life',
  'Business and industry',
  'First responders, service and dedication',
  'Space program',
  // Foreign leaders and bilateral relations without policy context
  'Egypt, President',
  'Jordan, King',
  'Russia, President',
  'Saudi Arabia, Crown Prince',
  'Ukraine, President',
  'United Kingdom, Prime Minister',
  'United Kingdom, relations with U.S',
  'Saudi Arabia, trade with U.S',
  'Canada, trade with U.S',
  // Country/region names without policy context
  'Mexico',
  'China',
  'Russia',
  'Iran',
  'Syria',
  'Afghanistan',
  'Iraq',
  'North Korea',
  'South Korea',
  'Israel',
  'Norway',
  'Japan',
  'Europe',
  'Africa',
  'Brazil',
  'Lebanon',
  'Alaska',
  'Qatar',
  'Turkey',
  'Bahrain',
  'Kuwait',
  'Florida',
  'California',
  'New York',
  'Texas',
  'Kentucky',
  'Virginia',
  'Louisiana',
  'Georgia',
  'Tennessee',
  'Nevada',
  'North Carolina',
  'Wisconsin',
  'Kansas',
  'District of Columbia',
  'Ukraine',
  'Germany',
  'United Nations',
  'World Health Organization',
  // Foreign policy events and bilateral specifics
  'Gaza, conflict with Israel',
  'Gaza, humanitarian situation',
  'Israel, military operations in Gaza',
  'Israel, U.S. assistance',
  'Russia, conflict in Ukraine',
  'Ukraine, Russian invasion and airstrikes',
  'Jordan, Palestinian refugees, humanitarian situation',
  'Greenland, political status with respect to mainland Denmark',
  'Chagos Islands, political status with respect to Mauritius',
  'Diego Garcia',
  'Foreign policy',
  'Foreign policy, U.S',
  'U.S. foreign aid programs, funding and policies',
  'Saudi Arabia, oil supply and refining',
  // Natural disasters (state-specific, not federal emergency powers)
  'California, Governor',
  'California, disaster assistance',
  'California, wildfires in Los Angeles area',
  'North Carolina, Hurricane Helene damage and recovery efforts',
  'Natural disaster, Los Angeles, CA, area wildfires',
  'Disaster assistance, California',
  // Miscellaneous non-erosion subjects
  'TikTok',
  'Paper straws, procurement and use',
  'Water management policy, improvement efforts',
  'Global minimum tax, multilateral agreement',
  'Organization for Economic Co-operation and Development (OECD',
]);

/**
 * Look up categories for a list of CPD subject terms.
 * Returns deduplicated array of category keys.
 * Subjects not in the mapping are collected in the unmapped set.
 */
export function mapSubjectsToCategories(
  subjects: string[],
  unmappedCollector?: Set<string>,
): string[] {
  const categories = new Set<string>();

  for (const subject of subjects) {
    const mapped = CPD_SUBJECT_TO_CATEGORIES.get(subject);
    if (mapped) {
      for (const cat of mapped) categories.add(cat);
    } else if (unmappedCollector && !CPD_UNMAPPED_SUBJECTS_EXPECTED.has(subject)) {
      unmappedCollector.add(subject);
    }
  }

  return [...categories];
}
