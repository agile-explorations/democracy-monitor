/**
 * Enumeration-question classifier (#751, R-DECOMP).
 *
 * Deterministic (regex, no model call) like era-extraction: the docsOnly
 * build endpoint and the SSE synthesis endpoint each classify the question
 * independently, so the verdict MUST be reproducible from the question text
 * alone — otherwise a 60-doc enumeration payload gets silently cut back to
 * 30 at synthesis time (or vice versa).
 *
 * Enumeration questions ("What government documents address…", "Which
 * executive actions…", "How did congressional responses compare across
 * administrations…") are coverage tasks: the answer is judged by how many
 * distinct responsive instruments it names. They get the 60-doc budget and
 * an 8192-token enumeration answer; NON-comparative enumeration questions
 * additionally get aspect-decomposed retrieval (#752/#753 — era-comparative
 * ones keep era stratification, which already pools per window). Analytical
 * questions keep the single-query 30-doc path unchanged. Default is
 * analytical — the conservative path.
 */

import { extractComparisonEras } from '@/lib/services/era-extraction';

export type QuestionMode = 'enumeration' | 'analytical';

/** Doc budget for enumeration answers (the ceiling experiment's depth). */
export const ENUMERATION_CONTEXT_DOCS = 60;
export const ENUMERATION_MAX_TOKENS = 8192;
export const ANALYTICAL_MAX_TOKENS = 4096;
/** Analytical doc budget — the pre-R-DECOMP value, unchanged. */
export const RESEARCH_CONTEXT_DOCS_ANALYTICAL = 30;

/** "What/which …" openers that introduce a coverage question. */
const ENUMERATION_OPENER = /^\s*(what|which)\b/i;

/** Document-species nouns: the question asks for instruments, not analysis. */
const DOCUMENT_SPECIES =
  /\b(documents?|actions?|orders?|rulings?|opinions?|cases?|lawsuits?|litigation|bills?|resolutions?|measures?|memorand(?:a|um)s?|rules?|regulations?|proclamations?|determinations?|filings?|prosecutions?|investigations?|firings?|removals?|responses?|reports?|hearings?|speeches|statements?|policies|steps)\b/i;

/** "Which members have spoken/introduced…" — coverage asked via a verb. */
const COVERAGE_VERBS =
  /^\s*(what|which)\b[^?]*\b(?:have|has)\s+(?:spoken|testified|addressed|introduced|proposed|filed|challenged|responded|ruled)\b/i;

/** Explicit list requests anywhere in the question. */
const LIST_MARKER =
  /\b(list|enumerate|catalog(?:ue)?)\b|\b(all|every) (?:the )?\w+ (?:that|which)\b/i;

/** Era-comparative coverage: "How did congressional responses compare…" —
 *  plural species scored item-by-item, stratified per era. Only fires when
 *  era stratification itself fires, so a plain "How did the court rule"
 *  can never match. */
const COMPARATIVE_SPECIES =
  /\b(responses|actions|orders|rulings|documents|policies|prosecutions|rulemaking|enforcement|speeches|releases)\b/i;

/**
 * Classify a research question. Pure given the environment; both search
 * endpoints call this and a unit test asserts they derive identical budgets
 * for the same text.
 */
export function classifyQuestionMode(question: string): QuestionMode {
  if (!enumerationModeEnabled()) return 'analytical';
  if (ENUMERATION_OPENER.test(question) && DOCUMENT_SPECIES.test(question)) return 'enumeration';
  if (COVERAGE_VERBS.test(question)) return 'enumeration';
  if (LIST_MARKER.test(question)) return 'enumeration';
  if (COMPARATIVE_SPECIES.test(question) && extractComparisonEras(question)) return 'enumeration';
  return 'analytical';
}

/**
 * Kill-switch (#756 incident, 2026-08-19): cold enumeration-loop builds
 * crashed prod instances (502s mid-build, caches never filled, 0/12 prewarm
 * verification) and forced a rollback. Enumeration mode ships default-OFF
 * until the loop meets a measured production latency/stability budget; set
 * ENUMERATION_MODE=on to canary it (both endpoints read the same env, so
 * budgets stay consistent).
 */
export function enumerationModeEnabled(): boolean {
  return process.env.ENUMERATION_MODE === 'on';
}

export interface SynthesisBudget {
  mode: QuestionMode;
  contextDocs: number;
  maxTokens: number;
}

/** The single source of truth both endpoints derive budgets from. */
export function budgetForQuestion(question: string): SynthesisBudget {
  return classifyQuestionMode(question) === 'enumeration'
    ? {
        mode: 'enumeration',
        contextDocs: ENUMERATION_CONTEXT_DOCS,
        maxTokens: ENUMERATION_MAX_TOKENS,
      }
    : {
        mode: 'analytical',
        contextDocs: RESEARCH_CONTEXT_DOCS_ANALYTICAL,
        maxTokens: ANALYTICAL_MAX_TOKENS,
      };
}

/** Enumeration-mode prompt instruction (#751): coverage questions are judged
 *  by how many distinct responsive instruments the answer names. Wording
 *  proven by the 2026-08-19 ceiling experiment (+14 pts over the essay
 *  default). Empty for analytical questions. */
export function enumerationInstruction(query: string): string[] {
  if (classifyQuestionMode(query) !== 'enumeration') return [];
  return [
    '',
    'ADDITIONAL INSTRUCTION FOR THIS ANSWER: This question calls for a',
    'comprehensive enumeration. In the EXPERT answer, name every distinct',
    'responsive government action found in the documents — court cases by',
    'caption, executive orders and proclamations by number and title,',
    'memoranda and rules by their formal names, bills by number. Group them',
    'by kind, use compact list form where that helps, and do not omit a',
    'responsive document merely to keep the answer short. Before finalizing,',
    'account for every provided document: each [Doc N] is either named in',
    'the answer or classified non-responsive to the question — never',
    'omitted for length.',
  ];
}
