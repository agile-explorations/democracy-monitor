import { useCallback, useEffect, useState } from 'react';
import { ProgressiveDisclosure } from '@/components/disclosure/ProgressiveDisclosure';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { Category, StatusLevel } from '@/lib/types';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';
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
    insufficientData?: boolean;
  };
}

interface EnhancedData {
  dataCoverage: number;
  evidenceFor: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
  evidenceAgainst: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
  howWeCouldBeWrong: string[];
  aiResult?: {
    provider: string;
    model: string;
    status: string;
    reasoning: string;
    confidence: number;
    latencyMs: number;
  };
  consensusNote?: string;
}

interface CategoryCardProps {
  cat: Category;
  statusMap: Record<string, string>;
  setStatus: (k: string, v: string) => void;
  crossRef?: CrossReferenceType | null;
}

export function CategoryCard({ cat, statusMap, setStatus, crossRef }: CategoryCardProps) {
  const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [showDetails, setShowDetails] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [enhancedData, setEnhancedData] = useState<EnhancedData | null>(null);

  const isAssessing = !autoStatus && loadedCount < cat.signals.length;
  const isInsufficientData = autoStatus?.detail?.insufficientData === true;
  const level = (autoStatus?.level ||
    statusMap[cat.key] ||
    (isAssessing ? undefined : 'Warning')) as StatusLevel | undefined;

  useEffect(() => {
    if (loadedCount === cat.signals.length && allItems.length > 0) {
      const assessStatus = async () => {
        try {
          const response = await fetch('/api/assess-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat.key, items: allItems }),
          });
          const data = await response.json();
          setAutoStatus({
            level: data.status,
            reason: data.reason,
            auto: true,
            matches: data.matches || [],
            assessedAt: data.assessedAt,
            detail: data.detail,
          });
          setStatus(cat.key, data.status);
        } catch (err) {
          console.error('Status assessment failed:', err);
        }
      };
      assessStatus();
    }
  }, [loadedCount, allItems, cat.key, cat.signals.length, setStatus]);

  // Auto-run AI assessment after keyword assessment completes
  useEffect(() => {
    if (autoStatus?.auto && !enhancedData && allItems.length > 0) {
      const runAiAssessment = async () => {
        try {
          const response = await fetch('/api/assess-status?ai=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat.key, items: allItems }),
          });
          const data = await response.json();

          if (data.dataCoverage !== undefined || data.confidence !== undefined) {
            setEnhancedData({
              dataCoverage: data.dataCoverage ?? data.confidence ?? 0,
              evidenceFor: data.evidenceFor || [],
              evidenceAgainst: data.evidenceAgainst || [],
              howWeCouldBeWrong: data.howWeCouldBeWrong || [],
              aiResult: data.aiResult,
              consensusNote: data.consensusNote,
            });
          }
        } catch (err) {
          console.error('AI assessment failed:', err);
        }
      };
      runAiAssessment();
    }
  }, [autoStatus?.auto, enhancedData, allItems, cat.key]);

  const handleItemsLoaded = useCallback((items: FeedItem[]) => {
    setAllItems((prev) => [...prev, ...items]);
    setLoadedCount((prev) => prev + 1);
  }, []);

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-900">{cat.title}</h3>
          {!level ? (
            <span className="px-2 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-400 border-slate-200 animate-pulse">
              Assessing...
            </span>
          ) : isInsufficientData ? (
            <span className="px-2 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-500 border-slate-300">
              Insufficient Data
            </span>
          ) : (
            <StatusPill level={level} />
          )}
          {autoStatus?.auto && (
            <span
              className="text-xs text-slate-500 italic cursor-help"
              title="Status determined by keyword analysis of official government documents. See methodology page for details."
            >
              auto-assessed
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {autoStatus?.auto && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {showDetails ? 'Hide Analysis' : 'View Analysis'}
              </button>
            )}
            <button
              onClick={() => setShowSources(!showSources)}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              {showSources ? 'Hide Sources' : 'View Sources'}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">{cat.description}</p>
        {(enhancedData?.aiResult?.reasoning || autoStatus?.reason) && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 space-y-1">
            <p className="text-slate-700">
              <strong>Assessment:</strong> {enhancedData?.aiResult?.reasoning || autoStatus?.reason}
            </p>
            <p className="text-slate-400 italic">
              Automated analysis — not a substitute for expert judgment
            </p>
          </div>
        )}

        {enhancedData?.consensusNote && (
          <p className="text-xs text-slate-500 italic">{enhancedData.consensusNote}</p>
        )}

        {enhancedData && enhancedData.howWeCouldBeWrong.length > 0 && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <p className="font-semibold text-amber-800 mb-1">How we could be wrong:</p>
            <ul className="space-y-0.5">
              {enhancedData.howWeCouldBeWrong.map((item, i) => (
                <li key={i} className="text-amber-700">
                  {'•'} {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showDetails && autoStatus && level && (
          <ProgressiveDisclosure
            categoryKey={cat.key}
            level={level}
            autoStatus={autoStatus}
            enhancedData={enhancedData}
            crossRef={crossRef || null}
            allItems={allItems}
            matches={autoStatus.matches}
          />
        )}
      </div>
      <div className={showSources ? 'grid grid-cols-1 md:grid-cols-2 gap-4 mt-4' : 'hidden'}>
        {cat.signals.map((s, i) => (
          <Card key={i}>
            <FeedBlock signalDef={s} onItemsLoaded={handleItemsLoaded} />
          </Card>
        ))}
      </div>
    </Card>
  );
}
