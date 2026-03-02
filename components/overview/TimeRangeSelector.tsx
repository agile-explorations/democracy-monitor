export type TimeRangePreset = '3mo' | '6mo' | '1yr' | 'all';

export const PRESETS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '3mo', label: '3 mo' },
  { value: '6mo', label: '6 mo' },
  { value: '1yr', label: '1 yr' },
  { value: 'all', label: 'All' },
];

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
