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
 * - v2 (2026-09-01): infoAvailability set (#832, R-INFOAVAIL). Derived
 *   against the 187-doc #548 sample (187/187 under the owner's 2026-09-01
 *   class rulings) and gated on a fresh 46-doc owner-adjudicated holdout
 *   (zero false drops, two accepted false keeps). Owner class rulings
 *   encoded: Privacy Act implementation/exemption rules ON (SORN notices
 *   stay excluded via the exemption/implementation carve-out); PRA
 *   collection DISCONTINUANCES ON while routine renewals stay excluded
 *   (the #551 data-suppression signal must never be filtered);
 *   public-facing disclosure regimes ON, bilateral (FCRA, tax-filing)
 *   OFF; embedded-transparency program rules OFF.
 */

export const PATTERN_VERSION = 2;

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
  infoAvailability: {
    allow: [
      /freedom of information|FOIA/i,
      /national environmental policy act|\bNEPA\b|environmental (impact )?analysis/i,
      /members of the (news )?media|news media/i,
      /\bregistry\b/i,
      /data system\b/i,
      /transparency/i,
      /disclosure/i,
      /public participation/i,
      /reporting requirement/i,
      /records release|determination on records/i,
      /public dissemination/i,
      /withhold(ing)? .{0,40}(information|records)/i,
      /public records|access to (public )?(records|information)|records access/i,
      /open government/i,
      /declassif/i,
      // PRA discontinuances are the #551 data-suppression signal (owner rule).
      /information collection[\s\S]{0,80}discontinu|discontinu[\s\S]{0,80}information collection/i,
      // Privacy Act implementation/exemption rules change who can access
      // which government records (owner class ruling 2026-09-01).
      /privacy act/i,
    ],
    exclude: [
      /advisory committee/i,
      /information collection (activities|request)(?![\s\S]{0,120}discontinu)/i,
      /proposed collection; comment request(?![\s\S]{0,120}discontinu)/i,
      /self-regulatory organization/i,
      /airworthiness directive/i,
      // SORN notices drop; Privacy Act implementation/exemption rules survive.
      /^(?![\s\S]*(?:exemption|implementation))[\s\S]*system of records/i,
      /\bmeeting\b/i,
      /matching program/i,
      /fair credit reporting act/i,
      /charitable contribution/i,
      /submi(ssion|tted) (for|to) omb(?![\s\S]{0,160}discontinu)/i,
      /technical correction/i,
      /prospective payment system/i,
      /price index adjustment/i,
      /notice of availability/i,
      /intent to prepare/i,
    ],
  },
};
