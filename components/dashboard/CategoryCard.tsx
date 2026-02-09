import { useState } from 'react';
import { ProgressiveDisclosure } from '@/components/disclosure/ProgressiveDisclosure';
import { Card } from '@/components/ui/Card';
import { MaturityBadge } from '@/components/ui/MaturityBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { CATEGORY_MATURITY } from '@/lib/data/category-maturity';
import { useCategoryAssessment } from '@/lib/hooks/useCategoryAssessment';
import type { Category, StatusLevel } from '@/lib/types';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';
import { FeedBlock } from './FeedBlock';

interface CategoryCardProps {
  cat: Category;
  statusMap: Record<string, string>;
  setStatus: (k: string, v: string) => void;
  crossRef?: CrossReferenceType | null;
}

export function CategoryCard({ cat, statusMap, setStatus, crossRef }: CategoryCardProps) {
  const [showDetails, setShowDetails] = useState(true);
  const [showSources, setShowSources] = useState(false);

  const { autoStatus, enhancedData, snapshotAge, allItems, handleItemsLoaded, isAssessing } =
    useCategoryAssessment(cat.key, cat.signals.length, setStatus);

  const isInsufficientData = autoStatus?.detail?.insufficientData === true;
  const level = (autoStatus?.level ||
    statusMap[cat.key] ||
    (isAssessing ? undefined : 'Warning')) as StatusLevel | undefined;

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
          {CATEGORY_MATURITY[cat.key] && <MaturityBadge level={CATEGORY_MATURITY[cat.key]} />}
          {autoStatus?.auto && (
            <span
              className="text-xs text-slate-500 italic cursor-help"
              title="Status determined by keyword analysis of official government documents. See methodology page for details."
            >
              auto-assessed
            </span>
          )}
          {snapshotAge && (
            <span className="text-xs text-slate-400" title={autoStatus?.assessedAt || ''}>
              Updated {snapshotAge}
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
