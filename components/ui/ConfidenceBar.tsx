interface ConfidenceBarProps {
  confidence: number; // 0 to 1
  label?: string;
}

export function ConfidenceBar({ confidence, label }: ConfidenceBarProps) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 75
      ? 'bg-green-500'
      : pct >= 50
        ? 'bg-yellow-500'
        : pct >= 25
          ? 'bg-orange-500'
          : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-slate-500">{label}</span>}
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-600 font-medium">{pct}%</span>
    </div>
  );
}
