/**
 * Retrieval relevance patterns (#524).
 *
 * FR term signals are RETRIEVAL (recall-maximizing full-text queries); these
 * patterns are the FILTERING stage that decides which retrieved documents are
 * actually about the category's subject. Assessment (P1/P2) remains the
 * correctness stage. Patterns match against title + abstract.
 *
 * Pattern changes are versioned: bump PATTERN_VERSION and append a changelog
 * entry. Every change must be re-verified against the labeled sample
 * (docs/internal/MEDIAFREEDOM_LABELED_SAMPLE.json) and the
 * should-have-been-caught regression list in the test suite.
 *
 * Changelog:
 * - v1 (2026-07-11): initial mediaFreedom set from the #524 evaluation
 *   (85.2% precision / 100% recall on the labeled sample before exclusions;
 *   100/100 with exclusions, pending holdout verification). Includes
 *   adversarial-review additions: news media / members of the media
 *   (28 CFR 50.10 media-subpoena case) and prepublication review.
 */

export const PATTERN_VERSION = 1;

export interface RelevancePatternSet {
  /** Document is kept only if title or abstract matches at least one. */
  allow: RegExp[];
  /** Applied after allow — drops routine document classes that mention the topic. */
  exclude: RegExp[];
}

export const RETRIEVAL_RELEVANCE_PATTERNS: Partial<Record<string, RelevancePatternSet>> = {
  mediaFreedom: {
    allow: [
      /freedom of information|FOIA/i,
      /public records/i,
      /press (credential|access|pool|freedom)/i,
      /journalis/i,
      /news media|members of the (news )?media/i,
      /prepublication/i,
      /(availability|disclosure) of (information|records)/i,
      /open government/i,
      /declassif|classification of (national security )?information/i,
      /shield law|reporter.s privilege/i,
      /leak (investigation|prosecution)/i,
    ],
    exclude: [/advisory committee/i, /information collection/i, /meeting/i],
  },
};
