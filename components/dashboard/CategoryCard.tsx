import React, { useEffect, useState } from 'react';
import type { Category, StatusLevel } from '@/lib/types';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import { StatusPill } from '@/components/ui/StatusPill';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { Card } from '@/components/ui/Card';
import { FeedBlock } from './FeedBlock';
import { EnhancedAssessment } from './EnhancedAssessment';
import { CrossReference } from './CrossReference';
import { ProgressiveDisclosure } from '@/components/disclosure/ProgressiveDisclosure';

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
  const [aiEnabled, setAiEnabled] = useState(false);
  const [enhancedData, setEnhancedData] = useState<EnhancedData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const isAssessing = !autoStatus && loadedCount < cat.signals.length;
  const level = (autoStatus?.level || statusMap[cat.key] || (isAssessing ? undefined : 'Warning')) as StatusLevel | undefined;

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

  const runAiAssessment = async () => {
    setAiLoading(true);
    try {
      const response = await fetch('/api/assess-status?ai=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat.key, items: allItems })
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

        // Update status with enhanced reason if AI provided one
        if (data.aiResult?.reasoning) {
          setAutoStatus(prev => prev ? { ...prev, reason: data.aiResult.reasoning } : prev);
        }
      }
    } catch (err) {
      console.error('AI assessment failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiToggle = () => {
    const newVal = !aiEnabled;
    setAiEnabled(newVal);
    if (newVal && !enhancedData && allItems.length > 0) {
      runAiAssessment();
    }
  };

  const handleItemsLoaded = (items: FeedItem[]) => {
    setAllItems(prev => [...prev, ...items]);
    setLoadedCount(prev => prev + 1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-900">{cat.title}</h3>
          {level ? (
            <StatusPill level={level} />
          ) : (
            <span className="px-2 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-400 border-slate-200 animate-pulse">
              Assessing...
            </span>
          )}
          {enhancedData && (
            <div className="w-24">
              <ConfidenceBar confidence={enhancedData.dataCoverage} />
            </div>
          )}
          {autoStatus?.auto && <span className="text-xs text-slate-500 italic">auto-assessed</span>}
          <div className="flex items-center gap-2 ml-auto">
            {autoStatus?.auto && (
              <label className="flex items-center gap-1 text-xs text-purple-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={handleAiToggle}
                  className="rounded text-purple-600"
                />
                AI
              </label>
            )}
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
        {autoStatus?.reason && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 space-y-1">
            <p className="text-slate-700">
              <strong>Assessment:</strong> {autoStatus.reason}
            </p>
            <p className="text-slate-400 italic">
              Automated keyword analysis — not a substitute for expert judgment
            </p>
          </div>
        )}

        <CrossReference crossRef={crossRef || null} />

        {aiLoading && (
          <p className="text-xs text-purple-600 italic">Running AI analysis...</p>
        )}

        {aiEnabled && enhancedData && (
          <EnhancedAssessment data={enhancedData} />
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
