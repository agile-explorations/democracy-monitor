import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';
import { PRESETS } from '@/components/overview/TimeRangeSelector';

interface TimeRangeBarProps {
  rangeLabel: string;
  selected: TimeRangePreset;
  onChange: (preset: TimeRangePreset) => void;
}

export function TimeRangeBar({ rangeLabel, selected, onChange }: TimeRangeBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-dm-border pb-2 mb-4 text-xs">
      <span className="text-dm-text-secondary">{rangeLabel}</span>
      <div className="flex rounded-full border border-dm-border bg-dm-card overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-3 py-1 transition-colors ${
              selected === p.value ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
