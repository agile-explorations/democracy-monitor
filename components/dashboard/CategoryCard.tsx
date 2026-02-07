import React, { useEffect, useState } from 'react';
import type { Category, StatusLevel } from '@/lib/types';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import { StatusPill } from '@/components/ui/StatusPill';
import { Card } from '@/components/ui/Card';
import { FeedBlock } from './FeedBlock';

function fmtDate(d?: Date | string | number) {
  if (!d) return '\u2014';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString();
}

interface AutoStatus {
  level: string;
  reason: string;
  auto: boolean;
  matches?: string[];
  assessedAt?: string;
  detail?: {
    captureCount: number;
    driftCount: number;
    warningCount: number;
    itemsReviewed: number;
    hasAuthoritative: boolean;
  };
}

interface CategoryCardProps {
  cat: Category;
  statusMap: Record<string, string>;
  setStatus: (k: string, v: string) => void;
}

export function CategoryCard({ cat, statusMap, setStatus }: CategoryCardProps) {
  const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const level = (autoStatus?.level || statusMap[cat.key] || 'Warning') as StatusLevel;

  useEffect(() => {
    if (loadedCount === cat.signals.length && allItems.length > 0) {
      assessStatus();
    }
  }, [loadedCount, allItems]);

  const assessStatus = async () => {
    try {
      const response = await fetch('/api/assess-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat.key, items: allItems })
      });
      const data = await response.json();
      setAutoStatus({
        level: data.status,
        reason: data.reason,
        auto: true,
        matches: data.matches || [],
        assessedAt: data.assessedAt,
        detail: data.detail
      });
      setStatus(cat.key, data.status);
    } catch (err) {
      console.error('Status assessment failed:', err);
    }
  };

  const handleItemsLoaded = (items: FeedItem[]) => {
    setAllItems(prev => [...prev, ...items]);
    setLoadedCount(prev => prev + 1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{cat.title}</h3>
          <StatusPill level={level} />
          {autoStatus?.auto && <span className="text-xs text-slate-500 italic">auto-assessed</span>}
          {autoStatus?.auto && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:text-blue-800 underline ml-auto"
            >
              {showDetails ? 'Hide Details' : 'View Assessment Details'}
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600">{cat.description}</p>
        {autoStatus?.reason && (
          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            <strong>Assessment:</strong> {autoStatus.reason}
          </p>
        )}
        {showDetails && autoStatus && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs space-y-2">
            <h4 className="font-semibold text-blue-900">How We Determined This Status</h4>
            <div className="space-y-2">
              <p><strong>Status:</strong> <span className={`font-semibold ${autoStatus.level === 'Capture' ? 'text-red-700' : autoStatus.level === 'Drift' ? 'text-orange-700' : autoStatus.level === 'Warning' ? 'text-yellow-700' : 'text-green-700'}`}>{autoStatus.level}</span></p>
              <p><strong>When checked:</strong> {fmtDate(autoStatus.assessedAt)}</p>
              <p><strong>Documents reviewed:</strong> {autoStatus.detail?.itemsReviewed || allItems.length} from {cat.signals.length} sources</p>

              {autoStatus.detail && (
                <div className="mt-3 p-2 bg-white rounded border border-blue-300">
                  <p className="font-semibold mb-2">What We Found:</p>
                  {autoStatus.detail.captureCount > 0 && (
                    <p className="text-red-700">{'\u2022'} {autoStatus.detail.captureCount} serious violation{autoStatus.detail.captureCount !== 1 ? 's' : ''} found</p>
                  )}
                  {autoStatus.detail.driftCount > 0 && (
                    <p className="text-orange-700">{'\u2022'} {autoStatus.detail.driftCount} concerning pattern{autoStatus.detail.driftCount !== 1 ? 's' : ''} detected</p>
                  )}
                  {autoStatus.detail.warningCount > 0 && (
                    <p className="text-yellow-700">{'\u2022'} {autoStatus.detail.warningCount} minor issue{autoStatus.detail.warningCount !== 1 ? 's' : ''} noted</p>
                  )}
                  {autoStatus.detail.hasAuthoritative && (
                    <p className="text-red-700 font-semibold mt-1">Violations confirmed by official sources (GAO, courts, or watchdogs)</p>
                  )}
                </div>
              )}

              {autoStatus.matches && autoStatus.matches.length > 0 && (
                <div className="mt-2">
                  <strong>Problem words we found:</strong>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    {autoStatus.matches.slice(0, 5).map((match, idx) => (
                      <li key={idx} className="text-red-700">&quot;{match}&quot;</li>
                    ))}
                    {autoStatus.matches.length > 5 && (
                      <li className="text-slate-500">...and {autoStatus.matches.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-blue-300 text-slate-600">
                <strong>How it works:</strong>
                <p className="mt-1">We search documents for specific words and phrases. Serious violations (like &quot;violated the law&quot; or &quot;illegal&quot;) from official sources (GAO, courts, IGs) automatically trigger red flags.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {cat.signals.map((s, i) => (
          <Card key={i}>
            <FeedBlock signalDef={s} onItemsLoaded={handleItemsLoaded} />
          </Card>
        ))}
      </div>
    </Card>
  );
}
