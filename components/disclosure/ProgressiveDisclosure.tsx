import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { StatusLevel } from '@/lib/types';
import type { AutoStatus, EnhancedData } from '@/lib/types/category-card';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';
import { Layer2 } from './Layer2';
import { Layer3 } from './Layer3';
import { Layer4 } from './Layer4';
import { Layer5 } from './Layer5';

interface ProgressiveDisclosureProps {
  categoryKey: string;
  level: StatusLevel;
  autoStatus: AutoStatus | null;
  enhancedData: EnhancedData | null;
  crossRef: CrossReferenceType | null;
  allItems: FeedItem[];
  matches?: string[];
}

type TabKey = 'why' | 'evidence' | 'deep' | 'scoring';

export function ProgressiveDisclosure({
  categoryKey,
  level,
  autoStatus,
  enhancedData,
  crossRef,
  allItems,
  matches,
}: ProgressiveDisclosureProps) {
  const [currentTab, setCurrentTab] = useState<TabKey>('why');
  const [layer2Data, setLayer2Data] = useState<Record<string, unknown> | null>(null);

  // Prefetch Layer 2 data in background
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

  const tabs: Array<{ key: TabKey; label: string; available: boolean }> = [
    { key: 'why', label: 'Why?', available: !!autoStatus?.auto },
    { key: 'evidence', label: 'Evidence', available: allItems.length > 0 },
    { key: 'deep', label: 'Deep Analysis', available: ['Drift', 'Capture'].includes(level) },
    { key: 'scoring', label: 'Scoring', available: !!autoStatus?.auto },
  ];

  return (
    <div className="space-y-2">
      {/* Tab navigation */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => tab.available && setCurrentTab(tab.key)}
            disabled={!tab.available}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              currentTab === tab.key
                ? 'bg-blue-600 text-white'
                : tab.available
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-50 text-slate-300 cursor-not-allowed'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {currentTab === 'why' && (
        <Layer2 enhancedData={enhancedData} crossRef={crossRef} detail={autoStatus?.detail} />
      )}

      {currentTab === 'evidence' && (
        <Layer3 items={allItems} matches={matches || []} enhancedData={enhancedData} />
      )}

      {currentTab === 'deep' && (
        <Layer4
          debate={enhancedData?.debate}
          legalAnalysis={enhancedData?.legalAnalysis}
          trendAnomalies={enhancedData?.trendAnomalies}
        />
      )}

      {currentTab === 'scoring' && <Layer5 categoryKey={categoryKey} />}
    </div>
  );
}
