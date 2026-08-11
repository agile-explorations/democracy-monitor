/**
 * Editorial review criteria for the research feedback pass (#707: criterion
 * (f) enforces coverage discipline — absence claims scoped to the retrieval,
 * never generalized to the corpus).
 */

export function reviewCriteria(hasStats: boolean): string[] {
  return [
    '(a) FACTUAL ACCURACY — Does the draft correctly represent the document content?',
    '    List any claims not supported by the provided documents.',
    '',
    '(b) CITATION ACCURACY — Are [Doc N] citations used correctly?',
    '',
    '(c) CONFIDENCE CALIBRATION — Does the draft overstate certainty?',
    '    Quote specific phrases that need softening.',
    '',
    '(d) MISSING COUNTER-ARGUMENTS — Are there plausible alternative explanations?',
    '',
    '(e) BALANCE — Does the draft note stated justifications from the documents?',
    '',
    '(f) COVERAGE GAPS — Does the answer acknowledge limitations? Are all statements',
    '    about missing document types scoped to THIS RETRIEVAL ("in this retrieval"),',
    '    never generalized to "the record", "the corpus", or "the available record"?',
    '    Quote any absence claim that overreaches the retrieved sample.',
    ...(hasStats
      ? [
          '',
          '(g) CORPUS STATISTICS — Does the answer appropriately use the full-corpus statistics?',
          '    Are claims properly scoped to the retrieved sample vs the full corpus?',
        ]
      : []),
  ];
}
