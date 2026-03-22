interface KeywordMatch {
  keyword: string;
  tier: 'capture' | 'drift' | 'warning';
}

interface ReviewedDoc {
  title: string;
  url?: string;
  date?: string;
}

interface SuppressedKeyword {
  keyword: string;
  assessment: string;
  reasoning: string;
}

export interface EvidencePanelProps {
  matches: string[];
  keywordMatches?: KeywordMatch[];
  reviewedDocuments?: ReviewedDoc[];
  suppressedKeywords?: SuppressedKeyword[];
  readingLevel: 'summary' | 'detailed';
  annotationMode?: boolean;
}

const TIER_ORDER = ['capture', 'drift', 'warning'] as const;
const TIER_LABELS: Record<string, string> = {
  capture: 'Capture',
  drift: 'Drift',
  warning: 'Warning',
};
const TIER_COLORS: Record<string, string> = {
  capture: 'text-status-capture',
  drift: 'text-status-drift',
  warning: 'text-status-warning',
};

function groupByTier(matches: string[], keywordMatches?: KeywordMatch[]): Record<string, string[]> {
  if (keywordMatches && keywordMatches.length > 0) {
    const groups: Record<string, string[]> = {};
    for (const m of keywordMatches) {
      if (!groups[m.tier]) groups[m.tier] = [];
      groups[m.tier].push(m.keyword);
    }
    return groups;
  }
  // Fallback: all matches as ungrouped
  return matches.length > 0 ? { warning: matches } : {};
}

function TierCountBadge({ groups }: { groups: Record<string, string[]> }) {
  const parts = TIER_ORDER.filter((t) => groups[t]?.length).map((t) => `${groups[t].length} ${t}`);
  if (parts.length === 0) return null;
  return <p className="text-[11px] text-dm-text-secondary mb-3">{parts.join(' \u00b7 ')}</p>;
}

export function EvidencePanel({
  matches,
  keywordMatches,
  reviewedDocuments,
  suppressedKeywords,
  readingLevel,
  annotationMode = false,
}: EvidencePanelProps) {
  const groups = groupByTier(matches, keywordMatches);
  const hasTriggers = Object.values(groups).some((g) => g.length > 0);
  const showSuppressed =
    readingLevel === 'detailed' && suppressedKeywords && suppressedKeywords.length > 0;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-1">
        {annotationMode ? 'Keyword Annotations' : 'Evidence'}
      </h2>
      {annotationMode && (
        <p className="text-[11px] text-dm-muted mb-3">
          Keywords provide context but do not drive the assessment. The concern assessment system
          above determines status.
        </p>
      )}
      {!annotationMode && <div className="mb-2" />}

      <div className={showSuppressed ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : ''}>
        {/* Left column: triggers */}
        <div>
          <h3 className="text-xs font-semibold text-dm-text-primary mb-2">
            What triggered this assessment
          </h3>
          <TierCountBadge groups={groups} />

          {hasTriggers ? (
            <div className="space-y-3">
              {TIER_ORDER.filter((t) => groups[t]?.length).map((tier) => (
                <div key={tier}>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${TIER_COLORS[tier]}`}
                  >
                    {TIER_LABELS[tier]}
                  </p>
                  <ul className="space-y-1">
                    {groups[tier].map((kw, i) => (
                      <li
                        key={i}
                        className="text-xs text-dm-text-secondary flex items-start gap-1.5"
                      >
                        <span className="shrink-0 text-dm-muted">{'\u2022'}</span>
                        <span className="font-mono text-dm-text-primary">{kw}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-dm-muted italic">No keyword matches in this assessment.</p>
          )}

          {/* Reviewed documents */}
          {reviewedDocuments && reviewedDocuments.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[11px] font-semibold text-dm-text-secondary mb-1.5">
                Source documents
              </h4>
              <ul className="space-y-1">
                {reviewedDocuments.map((doc, i) => (
                  <li key={i} className="text-xs text-dm-text-secondary">
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dm-accent hover:underline"
                      >
                        {doc.title}
                      </a>
                    ) : (
                      doc.title
                    )}
                    {doc.date && <span className="text-dm-muted ml-1.5">({doc.date})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column: suppressed (Detailed mode only) */}
        {showSuppressed && (
          <div>
            <h3 className="text-xs font-semibold text-dm-text-primary mb-2">What was suppressed</h3>
            <ul className="space-y-2">
              {suppressedKeywords!.map((sk, i) => (
                <li key={i} className="text-xs">
                  <span className="font-mono text-dm-text-primary">{sk.keyword}</span>
                  <span className="text-dm-muted ml-1.5">— {sk.assessment}</span>
                  {readingLevel === 'detailed' && sk.reasoning && (
                    <p className="text-dm-text-secondary mt-0.5 ml-3 leading-relaxed">
                      {sk.reasoning}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
