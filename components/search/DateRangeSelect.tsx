const DATE_PRESETS: Record<string, { from: string; to: string }> = {
  trump2: { from: '2025-01-20', to: '' },
  biden: { from: '2021-01-20', to: '2025-01-19' },
  trump1: { from: '2017-01-20', to: '2021-01-19' },
};

export function DateRangeSelect({
  datePreset,
  dateFrom,
  dateTo,
  onPresetChange,
  onDateFromChange,
  onDateToChange,
}: {
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  onPresetChange: (preset: string, from: string, to: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}) {
  return (
    <>
      <span className="text-xs text-dm-muted ml-2">Period:</span>
      <select
        value={datePreset}
        onChange={(e) => {
          const v = e.target.value;
          const preset = DATE_PRESETS[v];
          if (preset) {
            onPresetChange(v, preset.from, preset.to);
          } else if (v === 'custom') {
            onPresetChange(v, dateFrom, dateTo);
          } else {
            onPresetChange('', '', '');
          }
        }}
        className="px-2 py-1 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
      >
        <option value="">All dates</option>
        <option value="trump2">Trump Administration (term 2)</option>
        <option value="biden">Biden Administration</option>
        <option value="trump1">Trump Administration (term 1)</option>
        <option value="custom">Custom dates</option>
      </select>

      {datePreset === 'custom' && (
        <>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="px-2 py-1 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
          />
          <span className="text-xs text-dm-muted">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="px-2 py-1 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
          />
        </>
      )}
    </>
  );
}
