/**
 * Prompt builders for the research synthesis 3-pass pipeline.
 */

import type { ResearchDocument } from './search-service';

const EXPERT_HEADER = '=== EXPERT ANSWER ===';
const PUBLIC_HEADER = '=== PUBLIC ANSWER ===';
const QUESTIONS_HEADER = '=== RELATED QUESTIONS ===';

function formatDocumentContext(docs: ResearchDocument[]): string {
  return docs
    .map((doc, i) => {
      const date = doc.publishedAt
        ? new Date(doc.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'date unknown';
      const score = doc.finalScore != null ? ` · Score: ${doc.finalScore.toFixed(1)}` : '';
      const contentExcerpt = doc.content ? doc.content.slice(0, 1500) : '(no content available)';

      return [
        `[Doc ${i + 1}] ${doc.title}`,
        `  Date: ${date} · Source: ${doc.sourceType} (${doc.sourceOrigin ?? 'unknown'}) · Category: ${doc.category}${score}`,
        `  URL: ${doc.url ?? 'N/A'}`,
        `  Content: ${contentExcerpt}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function computeDateRange(docs: ResearchDocument[]): { earliest: string; latest: string } {
  const dates = docs
    .map((d) => d.publishedAt)
    .filter((d): d is string => d != null)
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return { earliest: 'unknown', latest: 'unknown' };
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return { earliest: fmt(dates[0]!), latest: fmt(dates[dates.length - 1]!) };
}

export function buildDraftPrompt(query: string, docs: ResearchDocument[]): string {
  const dateRange = computeDateRange(docs);
  return [
    'You are answering a question about U.S. government actions based solely on the',
    'documents provided below. These are real government documents from the Federal Register,',
    'court filings, congressional reports, and other official sources.',
    '',
    'Rules:',
    '1. Only make claims supported by the provided documents.',
    '2. Cite each claim with [Doc N] where N matches the document number below.',
    "3. If the documents don't contain enough information to answer, say so explicitly.",
    '4. Note the date range of available documents.',
    '5. If documents suggest conflicting actions, present both sides.',
    '6. Do not editorialize or assess democratic health — present what the documents show.',
    '7. Present alternative explanations and stated justifications where available.',
    '',
    '--- USER QUESTION ---',
    query,
    '',
    '--- DOCUMENT COVERAGE ---',
    `Date range: ${dateRange.earliest} to ${dateRange.latest}`,
    `Documents retrieved: ${docs.length}`,
    '',
    '--- GOVERNMENT DOCUMENTS ---',
    formatDocumentContext(docs),
    '',
    '--- OUTPUT FORMAT ---',
    'Produce ALL THREE sections in your response:',
    '',
    EXPERT_HEADER,
    '(400-800 words. Technical analysis for researchers. Reference specific documents by',
    'title and [Doc N] citation. Include date qualifications. Note limitations of the',
    'documentary record. Present counter-arguments.)',
    '',
    PUBLIC_HEADER,
    '(200-500 words. Plain language for journalists and citizens. No jargon. Every factual',
    'claim still cites [Doc N]. Include a sentence about what the answer does NOT cover.',
    'Present alternative explanations.)',
    '',
    QUESTIONS_HEADER,
    '(Exactly 3 follow-up questions the user might want to explore based on this topic.)',
  ].join('\n');
}

export function buildFeedbackPrompt(
  expertDraft: string,
  publicDraft: string,
  query: string,
  docs: ResearchDocument[],
): string {
  return [
    'You are an editorial reviewer for a government document search system.',
    'Review the following AI-generated answers against the source documents.',
    '',
    '--- USER QUESTION ---',
    query,
    '',
    '--- EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- PUBLIC DRAFT ---',
    publicDraft,
    '',
    '--- SOURCE DOCUMENTS ---',
    formatDocumentContext(docs),
    '',
    '--- REVIEW INSTRUCTIONS ---',
    'Review both drafts against the source documents. Provide structured feedback:',
    '',
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
    '(f) COVERAGE GAPS — Does the answer acknowledge limitations?',
  ].join('\n');
}

export function buildRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  query: string,
  docs: ResearchDocument[],
): string {
  return [
    'You are revising AI-generated answers to a government document search query',
    'based on structured editorial feedback.',
    '',
    '--- USER QUESTION ---',
    query,
    '',
    '--- ORIGINAL EXPERT DRAFT ---',
    expertDraft,
    '',
    '--- ORIGINAL PUBLIC DRAFT ---',
    publicDraft,
    '',
    '--- EDITORIAL FEEDBACK ---',
    feedback,
    '',
    '--- SOURCE DOCUMENTS (for verification) ---',
    formatDocumentContext(docs),
    '',
    '--- REVISION INSTRUCTIONS ---',
    'Address each feedback item (a through f):',
    '- Correct any factual errors or unsupported claims.',
    '- Fix incorrect [Doc N] citations.',
    '- Soften overstated language.',
    '- Add missing counter-arguments or alternative explanations.',
    '- Incorporate stated justifications for balance.',
    '- Add coverage gap caveats where needed.',
    '- Do not fundamentally rewrite — adjust specific claims and phrasing.',
    '',
    '--- OUTPUT FORMAT ---',
    'Produce BOTH sections in your response:',
    '',
    EXPERT_HEADER,
    '(Revised expert answer, 400-800 words.)',
    '',
    PUBLIC_HEADER,
    '(Revised public answer, 200-500 words.)',
  ].join('\n');
}
