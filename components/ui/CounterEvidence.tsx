interface CounterEvidenceProps {
  items: string[];
}

export function CounterEvidence({ items }: CounterEvidenceProps) {
  if (items.length === 0) return null;

  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded">
      <h5 className="text-xs font-semibold text-amber-800 mb-2">How We Could Be Wrong</h5>
      <ul className="text-xs space-y-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="text-amber-700 flex gap-1">
            <span className="shrink-0">?</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
