export type TimeRangePreset = '3mo' | '6mo' | '1yr' | 'all';

const PRESETS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '3mo', label: '3 mo' },
  { value: '6mo', label: '6 mo' },
  { value: '1yr', label: '1 yr' },
  { value: 'all', label: 'All' },
];

export interface TimeRangeSelectorProps {
  selected: TimeRangePreset;
  onChange: (preset: TimeRangePreset) => void;
}

export function TimeRangeSelector({ selected, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-dm-text-secondary">
      <span>Range:</span>
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

/** Convert a preset to the number of weeks to show, relative to a total count. */
export function presetToWeekCount(preset: TimeRangePreset, totalWeeks: number): number {
  switch (preset) {
    case '3mo':
      return 13;
    case '6mo':
      return 26;
    case '1yr':
      return 52;
    case 'all':
      return totalWeeks;
  }
}
