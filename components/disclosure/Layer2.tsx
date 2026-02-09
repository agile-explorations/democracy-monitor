import { CrossReference } from '@/components/dashboard/CrossReference';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import type { EnhancedData } from '@/lib/types/category-card';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';

interface Layer2Props {
  enhancedData: EnhancedData | null;
  crossRef: CrossReferenceType | null;
  detail?: {
    captureCount: number;
    driftCount: number;
    warningCount: number;
    itemsReviewed: number;
    hasAuthoritative: boolean;
  };
}

export function Layer2({ enhancedData, crossRef, detail }: Layer2Props) {
  return (
    <div className="space-y-3 text-xs">
      {detail && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded p-2">
            <span className="font-semibold text-slate-700">Documents reviewed:</span>{' '}
            {detail.itemsReviewed}
          </div>
          <div className="bg-slate-50 rounded p-2">
            <span className="font-semibold text-slate-700">Issues found:</span>{' '}
            {detail.captureCount + detail.driftCount + detail.warningCount}
          </div>
        </div>
      )}

      {enhancedData && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <span className="font-semibold text-red-700">Concerning evidence:</span>{' '}
              {enhancedData.evidenceFor.length} items
            </div>
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <span className="font-semibold text-green-700">Reassuring evidence:</span>{' '}
              {enhancedData.evidenceAgainst.length} items
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <p className="font-semibold text-slate-700 mb-1">Data Coverage</p>
            <ConfidenceBar confidence={enhancedData.dataCoverage} />
            <p className="text-slate-500 mt-1">
              Composite score based on source diversity, authority, evidence volume, and assessment
              agreement
            </p>
          </div>
        </>
      )}

      <CrossReference crossRef={crossRef} />
    </div>
  );
}
