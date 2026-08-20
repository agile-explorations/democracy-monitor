/** Prompt builders for the research synthesis pipeline. */
import { SOURCE_COVERAGE_MANIFEST } from '@/lib/data/source-coverage-manifest';
import { buildComparativeInstruction } from '@/lib/services/era-extraction';
import { enumerationInstruction } from '@/lib/services/question-classifier';
import type { ValidatedAlias } from './query-expansion-service';
import { draftRules } from './research-draft-rules';
import { reviewCriteria } from './research-review-criteria';
import type { CorpusStats } from './search-research-queries';
import type { ResearchDocument } from './search-service';

const EXPERT_HEADER = '=== EXPERT ANSWER ===';
const PUBLIC_HEADER = '=== PUBLIC ANSWER ===';
const QUESTIONS_HEADER = '=== RELATED QUESTIONS ===';

function formatP2Line(doc: ResearchDocument): string {
  if (!doc.p2Assessment) return '';
  const parts = [`  AI Assessment (annotation): ${doc.p2Assessment}`];
  if (doc.p2ErosionType) parts[0] += ` (erosion: ${doc.p2ErosionType})`;
  if (doc.p2Confidence != null) parts[0] += ` · confidence: ${doc.p2Confidence.toFixed(2)}`;
  if (doc.p2Summary)
    parts.push(`  AI Review Note (annotation — NOT document text): ${doc.p2Summary}`);
  return parts.join('\n');
}

/** Matched-passage excerpt line: verbatim document text surfaced by the
 *  keyword arm — often from deeper in the document than the content excerpt
 *  reaches (#707 audit: answers denied content their own snippets showed). */
function formatMatchedPassage(doc: ResearchDocument): string {
  if (!doc.matchSnippet) return '';
  const cleaned = doc.matchSnippet.replace(/\[\[|\]\]/g, '');
  return `  Matched Passage (verbatim excerpt from deeper in this document): "${cleaned}"`;
}

/**
 * Per-tier content budgets (#552, raised by #736): primary sources (ACTION)
 * carry the holding or operative text deeper into the excerpt — at 2200 chars
 * an executive order's excerpt ended inside its purpose section and the
 * operative sections never reached the model. DISCUSSION docs are
 * summarizable from less. 30 docs at these budgets ≈ 22k tokens of context.
 * Must stay ≤ RESEARCH_CONTENT_FETCH_CHARS (research-retrieval.ts) — the
 * SQL fetch truncates first; a guard test enforces the coupling.
 */
export const ACTION_EXCERPT_CHARS = 4000;
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
      const matchedPassage = formatMatchedPassage(doc);
      if (matchedPassage) lines.push(matchedPassage);
      if (doc.queryExcerpt) {
        lines.push(
          `  Relevant Passages (verbatim excerpts matching the question): "${doc.queryExcerpt}"`,
        );
      }
      if (doc.dispositionExcerpt) {
        lines.push(
          `  Disposition Passages (verbatim excerpts around ruling language — attribute`,
          `  holdings only to the parties named here): "${doc.dispositionExcerpt}"`,
        );
      }
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

function buildCoverageSection(
  docs: ResearchDocument[],
  corpusStats: CorpusStats | null,
  alsoSearched?: ValidatedAlias[],
): string {
  const dateRange = computeDateRange(docs);
  // ONE description of retrieval — a second, contradictory description made
  // the model coin-flip between them (#712: answers described retrieval as
  // vector-only while exact keyword searches had run).
  const termList = (alsoSearched ?? [])
    .map((t) => (t.matches > 0 ? `${t.phrase} (${t.matches} corpus matches)` : t.phrase))
    .join(' | ');
  const retrievalLines =
    alsoSearched && alsoSearched.length > 0
      ? [
          'Retrieval was hybrid: vector similarity with a recency boost PLUS exact keyword',
          `search for these corpus-validated terms: ${termList}.`,
          'Match counts are corpus-wide (title/lead index) — the retrieval below holds only',
          'the top-ranked slice, so when a term shows many matches, describe absence as',
          '"not among the N most relevant documents retrieved of M matching corpus-wide",',
          'never as absence from the corpus. When characterizing coverage you may cite',
          'these searched terms and their counts — but searched terms are retrieval',
          'inputs, not document text: never attach a [Doc N] citation to a searched',
          'term itself; [Doc N] belongs only on claims drawn from document content.',
          'If you describe the retrieval method',
          'anywhere in the answer, describe it as this hybrid — never as vector similarity',
          'alone. Older relevant documents may still be underrepresented.',
        ]
      : [
          'Note: Retrieval uses vector similarity with a recency boost. Older relevant documents',
          'may be underrepresented.',
        ];
  const lines = [
    '--- DOCUMENT COVERAGE ---',
    `Date range of retrieved documents: ${dateRange.earliest} to ${dateRange.latest}`,
    `Documents retrieved: ${docs.length} (most relevant, weighted toward recent)`,
    ...retrievalLines,
    ...SOURCE_COVERAGE_MANIFEST,
    'The corpus statistics below, when present, provide the full-corpus picture.',
  ];
  if (corpusStats) {
    lines.push('', formatCorpusStats(corpusStats));
  }
  return lines.join('\n');
}

/** Shared preamble + documents section for draft and single-pass prompts. */
function buildPromptBody(
  query: string,
  docs: ResearchDocument[],
  corpusStats: CorpusStats | null,
  alsoSearched?: ValidatedAlias[],
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
    buildCoverageSection(docs, corpusStats, alsoSearched),
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
  alsoSearched?: ValidatedAlias[],
): string {
  return [
    ...buildPromptBody(query, docs, corpusStats ?? null, alsoSearched),
    '',
    ...outputFormatSection(),
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
    ...reviewCriteria(!!corpusStats),
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
  alsoSearched?: ValidatedAlias[],
): string {
  const stats = corpusStats ?? null;
  return [
    ...buildPromptBody(query, docs, stats, alsoSearched),
    ...buildComparativeInstruction(query, docs),
    ...enumerationInstruction(query),
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
