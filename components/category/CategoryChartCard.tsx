import { useState } from 'react';
import { CategoryStatusChart } from '@/components/category/CategoryStatusChart';
import type { CategoryStatusChartProps } from '@/components/category/CategoryStatusChart';
import { DescriptiveMetricsChart } from '@/components/category/DescriptiveMetricsChart';

type ChartMode = 'concern' | 'metrics';

const MODE_TITLES: Record<ChartMode, string> = {
  concern: 'Concern Status Over Time',
  metrics: 'Descriptive Metrics Over Time',
};

const MODE_TOOLTIPS: Record<ChartMode, string> = {
  concern:
    'Consistent with norms = document review within baseline range. Notable departure from norms = review flags departures with second-pass corroboration. Sustained departure from norms = high rate of clear-departure documents (>20%).',
  metrics:
    'Structural anomaly, AI review flag rate, and thematic drift scores on a 0–100 scale. These are descriptive context layers — only AI review drives the weekly status.',
};

export function CategoryChartCard(props: CategoryStatusChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('concern');
  const Chart = chartMode === 'concern' ? CategoryStatusChart : DescriptiveMetricsChart;

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary flex items-center gap-1.5">
          {MODE_TITLES[chartMode]}
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-dm-border text-[10px] font-normal normal-case tracking-normal cursor-help"
            title={MODE_TOOLTIPS[chartMode]}
          >
            ?
          </span>
        </h2>
        <div className="flex rounded-full border border-dm-border bg-dm-card overflow-hidden text-[11px]">
          <button
            onClick={() => setChartMode('concern')}
            className={`px-3 py-1 transition-colors ${
              chartMode === 'concern' ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
            }`}
          >
            Concern Level
          </button>
          <button
            onClick={() => setChartMode('metrics')}
            className={`px-3 py-1 transition-colors ${
              chartMode === 'metrics' ? 'bg-dm-accent text-white' : 'hover:bg-dm-border'
            }`}
          >
            Descriptive Metrics
          </button>
        </div>
      </div>
      <Chart {...props} />
    </div>
  );
}
