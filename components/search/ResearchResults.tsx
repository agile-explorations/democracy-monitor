import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { CaseContext } from '@/components/shared/CaseContext';
import { EditorialPanel } from '@/components/shared/EditorialPanel';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import {
  ASSESSMENT_LABELS,
  EROSION_TYPE_LABELS,
  EROSION_TYPE_TIPS,
} from '@/lib/data/assessment-labels';
import { labelForSourceType } from '@/lib/data/document-tiers';
import type { EditorialRecord } from '@/lib/types';
import { CITATION_GROUP_PATTERN, parseDocCitations } from '@/lib/utils/citations';
import { verdictColor } from './ExploreCardAssessment';
import { categoryLabel, formatDate, similarityBar } from './helpers';
import { AlsoSearchedChips, MatchSnippet } from './MatchSnippet';
import { QuoteVerificationBadge } from './QuoteVerificationBadge';
import type { ResearchDocResult, ResearchResult } from './types';

function prepareCitations(text: string): string {
  // Every citation group — [Doc 3], [Doc 2, Doc 4], [Docs 1, 3, 5],
  // [Docs 19-21] — expands to individual linked [N] chips (#712: multi-doc
  // brackets previously fell through as raw text).
  return text.replace(CITATION_GROUP_PATTERN, (group) => {
    const nums = parseDocCitations(group);
    if (nums.length === 0) return group;
    return nums.map((n) => `[[Doc ${n}]](#cite-${n})`).join(' ');
  });
}

function buildComponents(documents: ResearchDocResult[]): Components {
  return {
    // eslint-disable-next-line react/no-unstable-nested-components
    a: ({ href, children }) => {
      const citeMatch = href?.match(/^#cite-(\d+)$/);
      if (citeMatch) {
        const idx = parseInt(citeMatch[1]!, 10);
        const doc = documents.find((d) => d.citationIndex === idx);
        return (
          <a
            href={`#cite-${idx}`}
            className="text-dm-accent hover:underline text-xs font-medium"
            title={doc?.title}
          >
            [{idx}]
          </a>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dm-accent hover:underline"
        >
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-dm-border pl-3 text-dm-muted italic my-2">
        {children}
      </blockquote>
    ),
  };
}

function AnswerRenderer({ text, documents }: { text: string; documents: ResearchDocResult[] }) {
  const prepared = useMemo(() => prepareCitations(text), [text]);
  const components = useMemo(() => buildComponents(documents), [documents]);

  return <ReactMarkdown components={components}>{prepared}</ReactMarkdown>;
}

function ResearchDocCard({ doc }: { doc: ResearchDocResult }) {
  return (
    <div
      id={`cite-${doc.citationIndex}`}
      className="rounded border border-dm-border bg-dm-card p-3 scroll-mt-4"
    >
      <div className="flex items-start gap-2">
        <span className="text-xs text-dm-accent font-mono font-bold shrink-0">
          [{doc.citationIndex}]
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] text-dm-accent font-mono"
              title={`Similarity: ${(doc.cosineSimilarity * 100).toFixed(0)}%`}
            >
              {similarityBar(doc.cosineSimilarity)}
            </span>
            <span className="text-[10px] text-dm-muted">
              {(doc.cosineSimilarity * 100).toFixed(0)}%
            </span>
          </div>
          {doc.url ? (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-dm-text-primary hover:text-dm-accent transition-colors"
            >
              {doc.title}
            </a>
          ) : (
            <span className="text-sm font-medium text-dm-text-primary">{doc.title}</span>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-dm-muted">
            {doc.publishedAt && <span>{formatDate(doc.publishedAt)}</span>}
            <span className="px-1.5 py-0 rounded bg-dm-border/50">
              {categoryLabel(doc.category)}
            </span>
            {doc.finalScore != null && <span>Score: {doc.finalScore.toFixed(1)}</span>}
            {doc.p2Assessment && (
              <span
                className={`font-medium cursor-help ${verdictColor(doc.p2Assessment)}`}
                title="The AI document reviewer's classification for this document, with its confidence — the signal that drives weekly status"
              >
                AI: {ASSESSMENT_LABELS[doc.p2Assessment] ?? doc.p2Assessment.replace(/_/g, ' ')}
                {doc.p2Confidence != null && ` (${(doc.p2Confidence * 100).toFixed(0)}%)`}
              </span>
            )}
            {doc.p2ErosionType && doc.p2ErosionType !== 'routine' && (
              <span
                className="cursor-help"
                title={
                  EROSION_TYPE_TIPS[doc.p2ErosionType] ??
                  'The mechanism of change the reviewer identified — see the methodology page'
                }
              >
                {EROSION_TYPE_LABELS[doc.p2ErosionType] ?? doc.p2ErosionType.replace(/_/g, ' ')}
              </span>
            )}
            <span
              className={`px-1.5 py-0 rounded font-medium ${
                doc.tier === 'discussion'
                  ? 'bg-dm-border/50 text-dm-muted'
                  : 'bg-dm-accent/15 text-dm-accent'
              }`}
              title={
                doc.tier === 'discussion'
                  ? 'Commentary or debate about government actions'
                  : 'Primary source: a government action'
              }
            >
              {labelForSourceType(doc.sourceType, doc.sourceOrigin)}
            </span>
          </div>
          {doc.matchSnippet && <MatchSnippet snippet={doc.matchSnippet} alias={doc.matchedAlias} />}
          {doc.p2Summary && (
            <p className="mt-1 text-xs text-dm-text-secondary line-clamp-2">
              <span className="text-dm-muted">AI review:</span> {doc.p2Summary}
            </p>
          )}
          <CaseContext caseId={doc.caseId} autoPosture />
        </div>
      </div>
    </div>
  );
}

export function ResearchResults({
  result,
  readingLevel,
  synthesizing,
  onRelatedQuestion,
}: {
  result: ResearchResult;
  readingLevel: ReadingLevel;
  synthesizing?: boolean;
  onRelatedQuestion: (q: string) => void;
}) {
  const answer = readingLevel === 'summary' ? result.answer.public : result.answer.expert;
  const hasAnswer = answer.length > 0;
  const docCount = result.documents.length;
  const corpusTotal = result.corpusStats?.totalMatching ?? null;

  const editorial: EditorialRecord | null = result.editorial
    ? {
        expert: result.answer.expert,
        public: result.answer.public,
        expertDraft: result.editorial.expertDraft,
        publicDraft: result.editorial.publicDraft,
        feedback: result.editorial.feedback,
        draftModel: result.editorial.draftModel,
        feedbackModel: result.editorial.feedbackModel,
        finalModel: result.editorial.finalModel,
      }
    : null;

  return (
    <div className="space-y-6">
      {synthesizing && (
        <div className="rounded-lg border border-dm-accent/30 bg-dm-accent/5 p-4">
          <p className="text-sm text-dm-text-secondary">
            <svg
              className="inline-block animate-spin mr-2 -mt-0.5 h-4 w-4 text-dm-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {corpusTotal && corpusTotal > docCount
              ? `Analyzing ${corpusTotal} matching documents\u2026 ${docCount} most relevant shown below while you wait.`
              : `Generating answer from ${docCount} document${docCount !== 1 ? 's' : ''}\u2026 Documents are shown below while you wait.`}
          </p>
        </div>
      )}

      {hasAnswer && (
        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-dm-text-primary">Answer</h2>
            <p className="text-xs text-dm-muted mt-0.5">
              Based on{' '}
              {corpusTotal && corpusTotal > docCount
                ? `${corpusTotal} government documents`
                : `${docCount} government document${docCount !== 1 ? 's' : ''}`}
              {result.dateRange.earliest !== 'unknown' &&
                ` \u00B7 ${result.dateRange.earliest} \u2013 ${result.dateRange.latest}`}
            </p>
            <p className="text-[11px] text-dm-muted mt-1">
              Documents are labeled ACTION (what the government did: orders, rules, opinions, bills)
              or DISCUSSION (reactions: floor speeches, debate) &mdash; filter to either with the
              Government actions and Commentary &amp; debate buttons above. Where the answer cites
              Democracy Monitor&apos;s automated review, that classification comes from our two-pass
              AI document assessment &mdash; methodology on the{' '}
              <a href="/system/methodology" className="text-dm-accent hover:underline">
                methodology page
              </a>
              .
            </p>
          </div>
          <div className="text-dm-text-secondary">
            <AnswerRenderer text={answer} documents={result.documents} />
          </div>
          <QuoteVerificationBadge verification={result.quoteVerification} />
          {editorial && <EditorialPanel editorial={editorial} readingLevel={readingLevel} />}
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-dm-muted uppercase tracking-wider mb-3">
          Government Record ({docCount} most relevant
          {corpusTotal && corpusTotal > docCount ? ` of ${corpusTotal}` : ''})
        </h3>
        <p className="text-[11px] text-dm-muted mb-3">
          Official government documents
          {hasAnswer ? ' \u2014 the basis for the answer above.' : '.'}
        </p>
        <AlsoSearchedChips phrases={result.contributingAliases ?? result.alsoSearched} />
        <div className="space-y-2">
          {result.documents.map((doc) => (
            <ResearchDocCard key={doc.id} doc={doc} />
          ))}
        </div>
      </div>

      {result.relatedQuestions.length > 0 && (
        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <h3 className="text-xs font-semibold text-dm-muted uppercase tracking-wider mb-2">
            Related Questions
          </h3>
          <ul className="space-y-1.5">
            {result.relatedQuestions
              // Defensive for answers cached before the parser stripped
              // markdown emphasis: buttons render plain text, not markdown.
              .map((q) => q.replace(/^[*_]+|[*_]+$/g, '').trim())
              .map((q, i) => (
                <li key={i}>
                  <button
                    onClick={() => onRelatedQuestion(q)}
                    className="text-sm text-dm-accent hover:underline text-left"
                  >
                    {q}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
