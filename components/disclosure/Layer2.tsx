import { CrossReference } from '@/components/dashboard/CrossReference';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';

interface EnhancedData {
  dataCoverage: number;
  evidenceFor: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
  evidenceAgainst: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
  howWeCouldBeWrong: string[];
}

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

          {enhancedData.howWeCouldBeWrong.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
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
        </>
      )}

      <CrossReference crossRef={crossRef} />
    </div>
  );
}
