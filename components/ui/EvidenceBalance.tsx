interface EvidenceItem {
  text: string;
  direction: 'concerning' | 'reassuring';
  source?: string;
}

interface EvidenceBalanceProps {
  evidenceFor: EvidenceItem[];
  evidenceAgainst: EvidenceItem[];
}

export function EvidenceBalance({ evidenceFor, evidenceAgainst }: EvidenceBalanceProps) {
  if (evidenceFor.length === 0 && evidenceAgainst.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <h5 className="text-xs font-semibold text-red-700 mb-1">Concerning Evidence</h5>
        {evidenceFor.length > 0 ? (
          <ul className="text-xs space-y-1">
            {evidenceFor.map((item, idx) => (
              <li key={idx} className="text-red-600 flex gap-1">
                <span className="shrink-0">&bull;</span>
                <span>
                  {item.text}
                  {item.source && <span className="text-slate-400 ml-1">({item.source})</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 italic">No concerning evidence found</p>
        )}
      </div>
      <div>
        <h5 className="text-xs font-semibold text-green-700 mb-1">Reassuring Evidence</h5>
        {evidenceAgainst.length > 0 ? (
          <ul className="text-xs space-y-1">
            {evidenceAgainst.map((item, idx) => (
              <li key={idx} className="text-green-600 flex gap-1">
                <span className="shrink-0">&bull;</span>
                <span>
                  {item.text}
                  {item.source && <span className="text-slate-400 ml-1">({item.source})</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 italic">No reassuring evidence found</p>
        )}
      </div>
    </div>
  );
}
