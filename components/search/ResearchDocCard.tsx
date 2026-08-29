import { CaseContext } from '@/components/shared/CaseContext';
import { DisputeLink } from '@/components/shared/DisputeLink';
import {
  ASSESSMENT_LABELS,
  EROSION_TYPE_LABELS,
  EROSION_TYPE_TIPS,
} from '@/lib/data/assessment-labels';
import { labelForSourceType } from '@/lib/data/document-tiers';
import { verdictColor } from './ExploreCardAssessment';
import { categoryLabel, formatDate, similarityBar } from './helpers';
import { MatchSnippet } from './MatchSnippet';
import type { ResearchDocResult } from './types';

/** One bibliography entry under "Government Record" (#815 split from
 *  ResearchResults for size): the citation anchor, similarity, title, verdict,
 *  mechanism, tier, snippet, AI review line, docket context, dispute link. */
export function ResearchDocCard({ doc }: { doc: ResearchDocResult }) {
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
          {doc.p2Assessment && (
            <DisputeLink
              ctx={{
                documentId: doc.id,
                url: doc.url,
                title: doc.title,
                category: doc.category,
                verdict: doc.p2Assessment,
                erosionType: doc.p2ErosionType ?? null,
                surface: 'research',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
