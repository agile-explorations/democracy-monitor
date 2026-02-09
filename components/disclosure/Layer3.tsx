import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { EnhancedData } from '@/lib/types/category-card';

interface Layer3Props {
  items: FeedItem[];
  matches: string[];
  enhancedData?: EnhancedData | null;
}

function getSourceTier(item: FeedItem): { tier: number; label: string } {
  const title = (item.title || '').toLowerCase();
  const agency = (item.agency || '').toLowerCase();
  const link = (item.link || '').toLowerCase();

  if (agency.includes('gao') || title.includes('gao')) return { tier: 1, label: 'Official' };
  if (title.includes('court') || link.includes('court')) return { tier: 1, label: 'Judicial' };
  if (title.includes('inspector general') || title.includes('ig ')) return { tier: 1, label: 'IG' };
  if (link.includes('.gov') || title.includes('federal register'))
    return { tier: 2, label: 'Government' };
  if (agency.includes('watchdog') || link.includes('pogo')) return { tier: 3, label: 'Watchdog' };
  return { tier: 4, label: 'Other' };
}

export function Layer3({ items, matches, enhancedData }: Layer3Props) {
  const sortedItems = [...items].sort((a, b) => {
    const tierA = getSourceTier(a).tier;
    const tierB = getSourceTier(b).tier;
    return tierA - tierB;
  });

  const concerning = enhancedData?.evidenceFor?.filter((e) => e.direction === 'concerning') || [];
  const reassuring =
    enhancedData?.evidenceAgainst?.filter((e) => e.direction === 'reassuring') || [];
  const hasEvidenceSummary = concerning.length > 0 || reassuring.length > 0;

  return (
    <div className="space-y-2">
      {hasEvidenceSummary && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-red-50 border border-red-200 rounded p-2 text-xs">
            <p className="font-semibold text-red-700 mb-1">Concerning</p>
            <ul className="space-y-0.5">
              {concerning.map((e, i) => (
                <li key={i} className="text-red-600">
                  {'•'} {e.text}
                </li>
              ))}
              {concerning.length === 0 && <li className="text-red-400 italic">None identified</li>}
            </ul>
          </div>
          <div className="bg-green-50 border border-green-200 rounded p-2 text-xs">
            <p className="font-semibold text-green-700 mb-1">Reassuring</p>
            <ul className="space-y-0.5">
              {reassuring.map((e, i) => (
                <li key={i} className="text-green-600">
                  {'•'} {e.text}
                </li>
              ))}
              {reassuring.length === 0 && (
                <li className="text-green-400 italic">None identified</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <div className="text-xs">
          <span className="font-semibold text-slate-700">Keyword matches:</span>{' '}
          <span className="text-red-600">{matches.join(', ')}</span>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto space-y-1.5">
        {sortedItems.map((item, i) => {
          const source = getSourceTier(item);
          const tierStars = '\u2605'.repeat(5 - source.tier) + '\u2606'.repeat(source.tier - 1);

          return (
            <div key={i} className="flex items-start gap-2 text-xs p-1.5 bg-slate-50 rounded">
              <span
                className="text-amber-500 text-[10px] whitespace-nowrap"
                title={`Source tier: ${source.label}`}
              >
                {tierStars}
              </span>
              <div className="flex-1 min-w-0">
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {item.title || 'Untitled'}
                  </a>
                ) : (
                  <span className="font-medium text-slate-800">{item.title || 'Untitled'}</span>
                )}
                {item.agency && <p className="text-slate-500 mt-0.5 truncate">{item.agency}</p>}
              </div>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{source.label}</span>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="text-xs text-slate-400 italic">No evidence items loaded</p>
      )}
    </div>
  );
}
