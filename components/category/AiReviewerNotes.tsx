import type { StatusLevel } from '@/lib/types';

interface KeywordVerdict {
  keyword: string;
  assessment: string;
  reasoning: string;
}

export interface AiReviewerNotesProps {
  aiResult?: {
    provider: string;
    model: string;
    status: StatusLevel;
    reasoning: string;
    confidence: number;
  };
  keywordReview?: KeywordVerdict[];
  evidenceFor?: Array<{ text: string }>;
  evidenceAgainst?: Array<{ text: string }>;
  whatWouldChangeMind?: string;
  keywordStatus: StatusLevel;
  readingLevel: 'summary' | 'detailed';
  legacy?: boolean;
}

/** AI can only confirm or lower the keyword assessment — never raise it. */
function agreementLabel(keywordStatus: StatusLevel, aiStatus: StatusLevel): string {
  if (keywordStatus === aiStatus) return 'agrees with';
  return 'recommends lowering to';
}

export function AiReviewerNotes({
  aiResult,
  keywordReview,
  evidenceFor,
  evidenceAgainst,
  whatWouldChangeMind,
  keywordStatus,
  readingLevel,
  legacy = false,
}: AiReviewerNotesProps) {
  const heading = legacy ? 'Legacy AI Reviewer (Pre-L2)' : 'AI Reviewer';

  if (!aiResult) {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-2">
          {heading}
        </h2>
        <p className="text-sm text-dm-muted italic">No AI review available for this assessment.</p>
      </section>
    );
  }

  const label = agreementLabel(keywordStatus, aiResult.status);

  // Summary mode: one-liner
  if (readingLevel === 'summary') {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-2">
          {heading}
        </h2>
        <p className="text-sm text-dm-text-secondary">
          AI reviewer {label}{' '}
          <span className="font-medium text-dm-text-primary">{aiResult.status}</span> assessment
          (confidence {(aiResult.confidence * 100).toFixed(0)}%)
        </p>
      </section>
    );
  }

  // Detailed mode: full breakdown
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
        {legacy ? 'Legacy AI Reviewer Notes (Pre-L2)' : 'AI Reviewer Notes'}
      </h2>
      {legacy && (
        <p className="text-[11px] text-dm-muted italic mb-3">
          This section shows the keyword-era AI reviewer. It is being phased out in favor of the
          Layer 2 AI assessment system above.
        </p>
      )}

      <p className="text-sm text-dm-text-secondary mb-3">
        AI reviewer {label}{' '}
        <span className="font-medium text-dm-text-primary">{aiResult.status}</span> assessment
        (confidence {(aiResult.confidence * 100).toFixed(0)}%,{' '}
        <span className="text-dm-muted">{aiResult.model}</span>)
      </p>

      {/* Constraint note */}
      <p className="text-[11px] text-dm-muted italic mb-4">
        The AI reviewer can confirm or recommend lowering the automated assessment, but cannot raise
        it.
      </p>

      {/* Reasoning */}
      <p className="text-sm text-dm-text-primary leading-relaxed mb-4">{aiResult.reasoning}</p>

      {/* Keyword verdicts */}
      {keywordReview && keywordReview.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-2">Keyword review</h3>
          <div className="space-y-1.5">
            {keywordReview.map((kv, i) => (
              <div key={i} className="text-sm">
                <span className="font-mono text-dm-text-primary">{kv.keyword}</span>
                <span className="text-dm-muted ml-1.5">— {kv.assessment}</span>
                <p className="text-dm-text-secondary ml-3 leading-relaxed">{kv.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence for/against */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {evidenceFor && evidenceFor.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1.5">
              Evidence for concern
            </h3>
            <ul className="space-y-1">
              {evidenceFor.map((e, i) => (
                <li key={i} className="text-sm text-dm-text-secondary flex items-start gap-1.5">
                  <span className="shrink-0 text-dm-muted">{'\u2022'}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {evidenceAgainst && evidenceAgainst.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1.5">
              Evidence against concern
            </h3>
            <ul className="space-y-1">
              {evidenceAgainst.map((e, i) => (
                <li key={i} className="text-sm text-dm-text-secondary flex items-start gap-1.5">
                  <span className="shrink-0 text-dm-muted">{'\u2022'}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* What would change our mind */}
      {whatWouldChangeMind && (
        <div>
          <h3 className="text-[11px] font-semibold text-dm-text-secondary mb-1.5">
            What would change our mind
          </h3>
          <p className="text-sm text-dm-text-secondary leading-relaxed">{whatWouldChangeMind}</p>
        </div>
      )}
    </section>
  );
}
