/**
 * Era extraction for comparative research questions (#592).
 *
 * Detects which presidential terms a question compares and maps them to the
 * same term windows the baselines use, so "administration" means one thing
 * everywhere in the system. Deterministic (regex, no model call): retrieval
 * behavior must be reproducible from the question text alone.
 *
 * Stratification triggers only when the question is genuinely comparative:
 * a comparison keyword plus either two-or-more distinct era references or an
 * across-administrations phrase. "What happened since 2025?" is a date
 * range, not a comparison.
 */

export interface EraWindow {
  key: 'trump_t1' | 'biden' | 'trump_t2';
  label: string;
  from: string;
  /** undefined = open-ended (current term). */
  to?: string;
}

export const ERA_WINDOWS: Record<EraWindow['key'], EraWindow> = {
  trump_t1: { key: 'trump_t1', label: 'Trump 2017–21', from: '2017-01-20', to: '2021-01-19' },
  biden: { key: 'biden', label: 'Biden 2021–25', from: '2021-01-20', to: '2025-01-19' },
  trump_t2: { key: 'trump_t2', label: 'Trump 2025–', from: '2025-01-20' },
};

const COMPARATIVE =
  /\b(compar\w*|versus|vs\.?|differ\w*|contrast\w*|between\b.*\b(and|admin)|both\b.*\badministrations?)\b/i;

// Synonyms matter (#729 follow-up): "across presidential terms" clearly asks
// for the same three-era comparison as "across administrations" — without
// the synonym the query silently ran single-window and recency-skewed.
// "across the last three administrations" (#801, Beavers's outreach question):
// an optional determiner/qualifier run before the noun, and "three" beside
// "two" — both resolve to the same three windows.
const ACROSS_ADMINS =
  /\b(across|between|all( three)?) (?:the )?(?:(?:last|past|previous|prior|most recent|three|all) ){0,2}(administrations|presidencies|presidential terms|presidents)\b|\b(previous|prior|last|past) (two( administrations| presidencies| terms)?|three( administrations| presidencies| terms))\b/i;

const ERA_PATTERNS: Array<[EraWindow['key'], RegExp]> = [
  [
    'trump_t1',
    /\b(first trump (administration|term)|trump'?s? first (administration|term)|trump (administration|term) 1|trump t1)\b/i,
  ],
  [
    'trump_t2',
    /\b(second trump (administration|term)|trump'?s? second (administration|term)|trump (administration|term) 2|trump t2|current (trump )?administration|reinstatement)\b/i,
  ],
  ['biden', /\bbiden\b/i],
];

/** Map a 4-digit year mention to the term containing it. */
function eraForYear(year: number): EraWindow['key'] | null {
  if (year >= 2017 && year <= 2020) return 'trump_t1';
  if (year >= 2021 && year <= 2024) return 'biden';
  if (year >= 2025) return 'trump_t2';
  return null;
}

/** "first and second Trump administrations" — both refs share one noun. */
const FIRST_AND_SECOND = /\bfirst and second trump administrations?\b/i;

/**
 * Returns the era windows to stratify retrieval across, in chronological
 * order — or null when the question is not comparative (single-window
 * retrieval unchanged).
 */
export function extractComparisonEras(question: string): EraWindow[] | null {
  const comparative = COMPARATIVE.test(question) || ACROSS_ADMINS.test(question);
  if (!comparative) return null;

  if (ACROSS_ADMINS.test(question)) {
    return [ERA_WINDOWS.trump_t1, ERA_WINDOWS.biden, ERA_WINDOWS.trump_t2];
  }

  const found = new Set<EraWindow['key']>();
  if (FIRST_AND_SECOND.test(question) || /\b(both|two) trump administrations?\b/i.test(question)) {
    found.add('trump_t1');
    found.add('trump_t2');
  }
  for (const [key, re] of ERA_PATTERNS) {
    if (re.test(question)) found.add(key);
  }
  // A bare "Trump" with no term qualifier is ambiguous when Trump eras are
  // not already matched: treat it as both Trump terms only if the question
  // also references another era (e.g. "Biden vs Trump").
  if (!found.has('trump_t1') && !found.has('trump_t2') && /\btrump\b/i.test(question)) {
    if (found.has('biden')) {
      found.add('trump_t2');
    }
  }
  for (const m of question.matchAll(/\b(20\d{2})\b/g)) {
    const era = eraForYear(parseInt(m[1], 10));
    if (era) found.add(era);
  }

  if (found.size < 2) return null;
  return (['trump_t1', 'biden', 'trump_t2'] as const)
    .filter((k) => found.has(k))
    .map((k) => ERA_WINDOWS[k]);
}

/**
 * Era framing for comparative questions (#592): retrieval stratified the
 * documents across the administrations the question names, so tell the model
 * which era each document belongs to and require like-for-like comparison —
 * including saying plainly when one era's record is thinner.
 */
export function buildComparativeInstruction(
  query: string,
  docs: Array<{ publishedAt?: string | null }>,
): string[] {
  const eras = extractComparisonEras(query);
  if (!eras) return [];
  const byEra = eras.map((era) => {
    const members = docs
      .map((d, i) => ({ d, n: i + 1 }))
      .filter(({ d }) => {
        const p = d.publishedAt ?? '';
        return p >= era.from && (!era.to || p <= `${era.to}T23:59:59Z`);
      })
      .map(({ n }) => `Doc ${n}`);
    return `- ${era.label}: ${members.length > 0 ? members.join(', ') : 'no documents retrieved'}`;
  });
  return [
    '',
    'COMPARATIVE QUESTION — documents were retrieved separately for each era being compared:',
    ...byEra,
    'Structure the answer as a like-for-like comparison across these eras. Where one era has fewer or no relevant documents, say so explicitly rather than generalizing from the better-covered era.',
  ];
}

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Date floor from range phrasing (#594 follow-on): "since January 2025" /
 * "since 2017" become a dateFrom the way era phrases become strata — the
 * question's own words were previously just embedding food, so a perfectly
 * on-topic document from outside the stated window could outrank in-window
 * matches. Deterministic; returns null when no range phrase is present.
 */
export function extractDateFloor(question: string): string | null {
  const m = question.match(
    /\bsince\s+(january|february|march|april|may|june|july|august|september|october|november|december)?\s*(20\d{2})\b/i,
  );
  if (!m) return null;
  const month = m[1] ? MONTHS[m[1].toLowerCase()] : '01';
  return `${m[2]}-${month}-01`;
}
