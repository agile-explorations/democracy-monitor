import type { DocumentExplanation } from '@/lib/types/explanation';
import type { SeverityTier } from '@/lib/types/scoring';

interface KeywordGroup {
  keyword: string;
  tier: SeverityTier;
  documents: Array<{ url: string; title: string }>;
}

const TIER_ICONS: Record<SeverityTier, string> = {
  capture: '\u25C6',
  drift: '\u25B2',
  warning: '\u25B3',
};

const TIER_LABELS: Record<SeverityTier, string> = {
  capture: 'Capture',
  drift: 'Drift',
  warning: 'Warning',
};

function groupKeywordsByTier(documents: DocumentExplanation[]): Map<SeverityTier, KeywordGroup[]> {
  const keywordMap = new Map<string, KeywordGroup>();

  for (const doc of documents) {
    for (const match of doc.matches) {
      const key = `${match.tier}:${match.keyword}`;
      const existing = keywordMap.get(key);
      if (existing) {
        if (!existing.documents.some((d) => d.url === doc.url)) {
          existing.documents.push({ url: doc.url, title: doc.title });
        }
      } else {
        keywordMap.set(key, {
          keyword: match.keyword,
          tier: match.tier,
          documents: [{ url: doc.url, title: doc.title }],
        });
      }
    }
  }

  const byTier = new Map<SeverityTier, KeywordGroup[]>();
  for (const group of keywordMap.values()) {
    const list = byTier.get(group.tier) ?? [];
    list.push(group);
    byTier.set(group.tier, list);
  }
  return byTier;
}

export interface KeywordMatchesSectionProps {
  documents: DocumentExplanation[];
  readingLevel: 'summary' | 'detailed';
}

export function KeywordMatchesSection({ documents, readingLevel }: KeywordMatchesSectionProps) {
  const byTier = groupKeywordsByTier(documents);
  const tiers: SeverityTier[] = ['capture', 'drift', 'warning'];
  const hasMatches = tiers.some((t) => (byTier.get(t)?.length ?? 0) > 0);

  if (!hasMatches) {
    return <p className="text-sm text-dm-text-secondary">No keyword matches this week.</p>;
  }

  return (
    <div className="space-y-4">
      {tiers.map((tier) => {
        const groups = byTier.get(tier);
        if (!groups || groups.length === 0) return null;
        return (
          <div key={tier}>
            <h4 className="text-xs font-semibold text-dm-text-primary mb-2">
              {TIER_ICONS[tier]} {TIER_LABELS[tier]} ({groups.length}{' '}
              {groups.length === 1 ? 'match' : 'matches'})
            </h4>
            <ul className="space-y-2 ml-4">
              {groups.map((group) => (
                <li key={group.keyword}>
                  <span className="text-sm font-medium text-dm-text-primary">
                    &ldquo;{group.keyword}&rdquo;
                  </span>
                  {readingLevel === 'detailed' && (
                    <span className="text-xs text-dm-text-secondary ml-1">
                      &mdash; found in {group.documents.length}{' '}
                      {group.documents.length === 1 ? 'document' : 'documents'}:
                    </span>
                  )}
                  {readingLevel === 'detailed' && (
                    <ul className="mt-1 space-y-0.5 ml-3">
                      {group.documents.map((doc) => (
                        <li key={doc.url} className="text-xs text-dm-text-secondary">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dm-accent hover:underline"
                          >
                            {doc.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
