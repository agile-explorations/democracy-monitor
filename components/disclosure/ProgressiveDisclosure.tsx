import React, { useState, useEffect, useMemo } from 'react';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { StatusLevel } from '@/lib/types';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';
import { Layer1 } from './Layer1';
import { Layer2 } from './Layer2';
import { Layer3 } from './Layer3';
import { Layer4 } from './Layer4';

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

interface ProgressiveDisclosureProps {
  categoryKey: string;
  level: StatusLevel;
  autoStatus: AutoStatus | null;
  enhancedData: EnhancedData | null;
  crossRef: CrossReferenceType | null;
  allItems: FeedItem[];
  matches?: string[];
}

export function ProgressiveDisclosure({
  categoryKey,
  level,
  autoStatus,
  enhancedData,
  crossRef,
  allItems,
  matches,
}: ProgressiveDisclosureProps) {
  const [currentLayer, setCurrentLayer] = useState(1);
  const [layer2Data, setLayer2Data] = useState<Record<string, unknown> | null>(null);

  const evidence = useMemo(() => allItems.map((i) => i.title || '').filter(Boolean), [allItems]);

  // Prefetch Layer 2 data in background after Layer 1 renders
  useEffect(() => {
    if (autoStatus?.auto && !layer2Data) {
      setLayer2Data({
        evidenceCount:
          (enhancedData?.evidenceFor?.length || 0) + (enhancedData?.evidenceAgainst?.length || 0),
        howWeCouldBeWrong: enhancedData?.howWeCouldBeWrong || [],
        crossRef,
      });
    }
  }, [autoStatus, enhancedData, crossRef, layer2Data]);

  const layerLabels = ['Status', 'Why?', 'Evidence', 'Deep Analysis'];

  return (
    <div className="space-y-2">
      {/* Layer navigation */}
      <div className="flex gap-1">
        {layerLabels.map((label, i) => {
          const layerNum = i + 1;
          const isActive = currentLayer === layerNum;
          const isAvailable =
            layerNum === 1 ||
            (layerNum === 2 && autoStatus?.auto) ||
            (layerNum === 3 && allItems.length > 0) ||
            (layerNum === 4 && ['Drift', 'Capture'].includes(level));

          return (
            <button
              key={layerNum}
              onClick={() => isAvailable && setCurrentLayer(layerNum)}
              disabled={!isAvailable}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : isAvailable
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Layer content */}
      {currentLayer === 1 && (
        <Layer1
          level={level}
          dataCoverage={enhancedData?.dataCoverage}
          reason={autoStatus?.reason || ''}
        />
      )}

      {currentLayer === 2 && (
        <Layer2 enhancedData={enhancedData} crossRef={crossRef} detail={autoStatus?.detail} />
      )}

      {currentLayer === 3 && <Layer3 items={allItems} matches={matches || []} />}

      {currentLayer === 4 && <Layer4 categoryKey={categoryKey} level={level} evidence={evidence} />}
    </div>
  );
}
