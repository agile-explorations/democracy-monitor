/**
 * Prompt builders for the research synthesis 3-pass pipeline.
 */

import type { CorpusStats } from './search-research-queries';
import type { ResearchDocument } from './search-service';

const EXPERT_HEADER = '=== EXPERT ANSWER ===';
const PUBLIC_HEADER = '=== PUBLIC ANSWER ===';
const QUESTIONS_HEADER = '=== RELATED QUESTIONS ===';

function formatP2Line(doc: ResearchDocument): string {
  if (!doc.p2Assessment) return '';
  const parts = [`  AI Assessment: ${doc.p2Assessment}`];
  if (doc.p2ErosionType) parts[0] += ` (erosion: ${doc.p2ErosionType})`;
  if (doc.p2Confidence != null) parts[0] += ` · confidence: ${doc.p2Confidence.toFixed(2)}`;
  if (doc.p2Summary) parts.push(`  AI Summary: ${doc.p2Summary}`);
  return parts.join('\n');
}

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
      const p2Line = formatP2Line(doc);

      const lines = [
        `[Doc ${i + 1}] ${doc.title}`,
        `  Date: ${date} · Source: ${doc.sourceType} (${doc.sourceOrigin ?? 'unknown'}) · Category: ${doc.category}${score}`,
      ];
      if (p2Line) lines.push(p2Line);
      lines.push(`  URL: ${doc.url ?? 'N/A'}`, `  Content: ${contentExcerpt}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function formatCorpusStats(stats: CorpusStats): string {
  const monthLines = stats.monthlyBreakdown.map((m) => `  ${m.month}: ${m.count}`).join('\n');
  const catLines = stats.categoryBreakdown.map((c) => `  ${c.category}: ${c.count}`).join('\n');
  return [
    '--- CORPUS STATISTICS ---',
    `Total matching documents across full corpus: ${stats.totalMatching}`,
    `(The ${stats.categoryBreakdown.length > 0 ? 'documents below' : 'retrieved documents'} are the most relevant sample.)`,
    '',
    'Monthly distribution:',
    monthLines,
    '',
    'Category distribution:',
    catLines,
  ].join('\n');
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

function buildCoverageSection(docs: ResearchDocument[], corpusStats: CorpusStats | null): string {
  const dateRange = computeDateRange(docs);
  const lines = [
    '--- DOCUMENT COVERAGE ---',
    `Date range of retrieved documents: ${dateRange.earliest} to ${dateRange.latest}`,
    `Documents retrieved: ${docs.length} (most relevant by semantic similarity, weighted toward recent)`,
    'Note: Retrieval uses vector similarity with a recency boost. Older relevant documents',
    'may be underrepresented. The corpus statistics below provide the full-corpus picture.',
  ];
  if (corpusStats) {
    lines.push('', formatCorpusStats(corpusStats));
  }
  return lines.join('\n');
}

function draftRules(p2Count: number, totalDocs: number): string[] {
  const rules = [
    'Rules:',
    '1. Only make claims supported by the provided documents.',
    '2. Cite each claim with [Doc N] where N matches the document number below.',
    "3. If the documents don't contain enough information to answer, say so explicitly.",
    '4. Note the date range of available documents.',
    '5. If documents suggest conflicting actions, present both sides.',
    '6. Do not editorialize or assess democratic health — present what the documents show.',
    '7. Present alternative explanations and stated justifications where available.',
    '8. Where documented evidence supports it, briefly note why a finding might matter for',
    '   institutional checks and balances. Ground this in specific document evidence, not',
    '   speculation. Use conditional language ("this could indicate", "this may reflect").',
    '9. Explicitly state the date range of retrieved documents in your answer and note that',
    '   documents are weighted toward recent publications. If corpus statistics show many',
    '   matching documents outside the retrieval window, note this.',
  ];
  if (p2Count > 0) {
    rules.push(
      `10. ${p2Count} of ${totalDocs} documents include prior AI assessments. Reference these`,
      '    where relevant ("the system previously assessed this document as...").',
    );
  }
  return rules;
}

export function buildDraftPrompt(
  query: string,
  docs: ResearchDocument[],
  corpusStats?: CorpusStats | null,
): string {
  const p2Count = docs.filter((d) => d.p2Assessment).length;
  return [
    'You are answering a question about U.S. government actions based solely on the',
    'documents provided below. These are real government documents from the Federal Register,',
    'court filings, congressional reports, and other official sources.',
    '',
    ...draftRules(p2Count, docs.length),
    '',
    '--- USER QUESTION ---',
    query,
    '',
    buildCoverageSection(docs, corpusStats ?? null),
    '',
    '--- GOVERNMENT DOCUMENTS ---',
    formatDocumentContext(docs),
    '',
    '--- OUTPUT FORMAT ---',
    'Use markdown formatting: **bold** for emphasis, bullet lists (- ) for enumerating',
    'cases or points, and blank lines between paragraphs. Do not use headings (#).',
    '',
    'Produce ALL THREE sections in your response:',
    '',
    EXPERT_HEADER,
    '(400-800 words. Technical analysis for researchers. Reference specific documents by',
    'title and [Doc N] citation. Include date qualifications. Note limitations of the',
    'documentary record. Present counter-arguments. Where evidence supports it, note',
    'institutional implications.)',
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
  corpusStats?: CorpusStats | null,
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
    ...(corpusStats ? [formatCorpusStats(corpusStats), ''] : []),
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
    ...(corpusStats
      ? [
          '',
          '(g) CORPUS STATISTICS — Does the answer appropriately use the full-corpus statistics?',
          '    Are claims properly scoped to the retrieved sample vs the full corpus?',
        ]
      : []),
  ].join('\n');
}

function revisionInstructions(hasCorpusStats: boolean): string[] {
  const reviewItems = hasCorpusStats ? 'a through g' : 'a through f';
  const lines = [
    '--- REVISION INSTRUCTIONS ---',
    `Address each feedback item (${reviewItems}):`,
    '- Correct any factual errors or unsupported claims.',
    '- Fix incorrect [Doc N] citations.',
    '- Soften overstated language.',
    '- Add missing counter-arguments or alternative explanations.',
    '- Incorporate stated justifications for balance.',
    '- Add coverage gap caveats where needed.',
  ];
  if (hasCorpusStats) {
    lines.push(
      '- Ensure corpus-wide statistics are properly distinguished from the retrieved sample.',
    );
  }
  lines.push('- Do not fundamentally rewrite — adjust specific claims and phrasing.');
  return lines;
}

export function buildRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  query: string,
  docs: ResearchDocument[],
  corpusStats?: CorpusStats | null,
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
    ...(corpusStats ? [formatCorpusStats(corpusStats), ''] : []),
    ...revisionInstructions(!!corpusStats),
    '',
    '--- OUTPUT FORMAT ---',
    'Use markdown formatting: **bold** for emphasis, bullet lists (- ) for enumerating',
    'cases or points, and blank lines between paragraphs. Do not use headings (#).',
    '',
    'Produce BOTH sections in your response:',
    '',
    EXPERT_HEADER,
    '(Revised expert answer, 400-800 words.)',
    '',
    PUBLIC_HEADER,
    '(Revised public answer, 200-500 words.)',
  ].join('\n');
}
