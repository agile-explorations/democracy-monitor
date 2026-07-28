/** Prompt builders for the research synthesis pipeline. */
import { buildComparativeInstruction } from '@/lib/services/era-extraction';
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

/**
 * Per-tier content budgets (#552): primary sources (ACTION) carry the holding
 * or operative text deeper into the excerpt; DISCUSSION docs are summarizable
 * from less. 30 docs at these budgets ≈ 18k tokens of context.
 */
export const ACTION_EXCERPT_CHARS = 2200;
export const DISCUSSION_EXCERPT_CHARS = 1200;

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
      const budget = doc.tier === 'discussion' ? DISCUSSION_EXCERPT_CHARS : ACTION_EXCERPT_CHARS;
      const contentExcerpt = doc.content ? doc.content.slice(0, budget) : '(no content available)';
      const p2Line = formatP2Line(doc);
      const tierTag = doc.tier === 'discussion' ? 'DISCUSSION' : 'ACTION';

      const lines = [
        `[Doc ${i + 1} | ${tierTag}] ${doc.title}`,
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
    '10. Documents are tagged ACTION (primary sources: what the government did — opinions,',
    '    orders, rules, bills, reports) or DISCUSSION (reactions: floor speeches, remarks,',
    '    debate). Ground claims about government actions in ACTION documents; use DISCUSSION',
    '    documents for reception, characterization, and political response, attributed as such',
    '    ("Senator X characterized...").',
  ];
  if (p2Count > 0) {
    rules.push(
      `11. ${p2Count} of ${totalDocs} documents include prior AI assessments. Reference these`,
      '    where relevant ("the system previously assessed this document as...").',
    );
  }
  return rules;
}

/** Shared preamble + documents section for draft and single-pass prompts. */
function buildPromptBody(
  query: string,
  docs: ResearchDocument[],
  corpusStats: CorpusStats | null,
): string[] {
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
    buildCoverageSection(docs, corpusStats),
    '',
    '--- GOVERNMENT DOCUMENTS ---',
    formatDocumentContext(docs),
  ];
}

/** Shared output format instructions. */
function outputFormatSection(): string[] {
  return [
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
  ];
}

export function buildDraftPrompt(
  query: string,
  docs: ResearchDocument[],
  corpusStats?: CorpusStats | null,
): string {
  return [...buildPromptBody(query, docs, corpusStats ?? null), '', ...outputFormatSection()].join(
    '\n',
  );
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

function selfVerificationChecklist(hasCorpusStats: boolean): string[] {
  const lines = [
    '--- SELF-VERIFICATION CHECKLIST ---',
    'Before writing your final answer, mentally verify each item:',
    '(a) FACTUAL ACCURACY — Every claim is supported by a provided document.',
    '(b) CITATION ACCURACY — [Doc N] numbers match the correct documents.',
    '(c) CONFIDENCE CALIBRATION — Use hedging ("documents suggest", "based on available',
    '    records") rather than definitive claims. Avoid overstating certainty.',
    '(d) COUNTER-ARGUMENTS — Include plausible alternative explanations where they exist.',
    '(e) BALANCE — Present stated justifications from the documents, not just critiques.',
    '(f) COVERAGE GAPS — Acknowledge limitations of the documentary record.',
    '(h) TIER GROUNDING — Claims about government actions cite ACTION documents; DISCUSSION',
    '    documents are used only for reception/characterization, attributed to their speaker.',
  ];
  if (hasCorpusStats) {
    lines.push(
      '(g) CORPUS STATISTICS — Distinguish claims about the retrieved sample from the',
      '    full corpus. Note if many matching documents fall outside the retrieval window.',
    );
  }
  return lines;
}

export function buildSinglePassPrompt(
  query: string,
  docs: ResearchDocument[],
  corpusStats?: CorpusStats | null,
): string {
  const stats = corpusStats ?? null;
  return [
    ...buildPromptBody(query, docs, stats),
    ...buildComparativeInstruction(query, docs),
    '',
    ...selfVerificationChecklist(!!stats),
    '',
    ...outputFormatSection(),
  ].join('\n');
}

export function buildRevisionPrompt(
  expertDraft: string,
  publicDraft: string,
  feedback: string,
  query: string,
  docs: ResearchDocument[],
  corpusStats?: CorpusStats | null,
): string {
  const hasStats = !!corpusStats;
  const items = hasStats ? 'a through g' : 'a through f';
  const statsLine = hasStats ? ['- Distinguish corpus-wide statistics from retrieved sample.'] : [];
  return [
    'Revise the answers based on editorial feedback.',
    '',
    `--- USER QUESTION ---\n${query}`,
    `--- ORIGINAL EXPERT DRAFT ---\n${expertDraft}`,
    `--- ORIGINAL PUBLIC DRAFT ---\n${publicDraft}`,
    `--- EDITORIAL FEEDBACK ---\n${feedback}`,
    `--- SOURCE DOCUMENTS ---\n${formatDocumentContext(docs)}`,
    ...(corpusStats ? [formatCorpusStats(corpusStats)] : []),
    '',
    `--- REVISION INSTRUCTIONS ---\nAddress feedback items (${items}):`,
    '- Correct unsupported claims. Fix [Doc N] citations. Soften overstated language.',
    '- Add counter-arguments, stated justifications, and coverage gap caveats.',
    ...statsLine,
    '- Do not fundamentally rewrite — adjust specific claims and phrasing.',
    '',
    `Produce ${EXPERT_HEADER} (400-800 words) and ${PUBLIC_HEADER} (200-500 words).`,
    `Use markdown. ${EXPERT_HEADER}\n\n${PUBLIC_HEADER}`,
  ].join('\n');
}
