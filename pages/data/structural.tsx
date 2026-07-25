import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { StructuralHeatmap } from '@/components/data/StructuralHeatmap';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useTheme } from '@/lib/contexts/ThemeContext';
import type { StructuralHeatmapRow } from '@/lib/types/overview';

export default function StructuralDimensionsPage() {
  const { resolvedMode: mode } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<StructuralHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/data/structural');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCellClick = (category: string, week: string) => {
    router.push(`/category/${category}?week=${week}`);
  };

  return (
    <>
      <SEOHead
        title="Structural Dimensions"
        description="Cross-category structural dimension heatmap showing z-score anomalies across volume, type composition, functional distribution, agency activity, publication tempo, and source convergence."
        canonicalPath="/data/structural"
      />

      <Link href="/data" className="text-xs text-dm-accent hover:underline">
        &larr; Back to data
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">Structural Dimensions</h1>

      <div className="max-w-3xl space-y-2 mb-8">
        <Section title="What this shows" id="what-this-shows">
          <p>
            This heatmap displays <strong>structural anomaly scores</strong> across all 14 monitored
            categories over time. Structural anomaly detection is fully deterministic and uses only
            document metadata — no text analysis. It compares the current week&apos;s document
            patterns against historical baselines across six dimensions to identify statistical
            departures from normal publishing activity.
          </p>
          <p>
            Structural anomalies are <strong>descriptive, not evaluative</strong>. A spike in
            executive orders could reflect either an emergency response or a power grab — the
            structural layer identifies that something changed, not whether the change is
            concerning. Concern status is driven separately by{' '}
            <Link href="/system/methodology" className="text-dm-accent hover:underline">
              AI document review
            </Link>
            .
          </p>
        </Section>

        <Section title="How to read the heatmap" id="how-to-read">
          <p>
            Each cell represents one category in one week. Colors are based on{' '}
            <strong>z-scores</strong>, which measure how far a value deviates from the baseline mean
            in units of standard deviation. A z-score of 0 means the value matches the baseline
            exactly. A z-score of +2 means the value is 2 standard deviations above the baseline —
            an unusual departure.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Blue cells</strong> (negative z-scores) — below-baseline activity
            </li>
            <li>
              <strong>Neutral cells</strong> (z-score near 0) — typical activity matching the
              baseline
            </li>
            <li>
              <strong>Red cells</strong> (positive z-scores) — above-baseline activity
            </li>
            <li>
              <strong>Striped cells</strong> — no data available for that category-week
            </li>
          </ul>
          <p>
            When anomalies cluster across multiple categories in the same week (a vertical red
            stripe), it suggests an external event affecting government-wide publishing rather than
            a category-specific pattern.
          </p>
        </Section>

        <Section title="Dimensions" id="dimensions">
          <p>
            Use the pill selector above the heatmap to view individual dimensions or the weighted
            composite. Each dimension measures a different facet of document publishing patterns:
          </p>
          <DataTable
            headers={['Dimension', 'Weight', 'What it measures']}
            rows={[
              [
                'Composite',
                '—',
                'Weighted average of all available dimension z-scores. This is the default view.',
              ],
              [
                'Volume',
                '22%',
                'Document count relative to baseline mean. High z-scores indicate unusually high or low publishing volume.',
              ],
              [
                'Type',
                '18%',
                'Distribution of document types (rules, notices, executive orders, etc.) compared to baseline, measured by Jensen-Shannon divergence.',
              ],
              [
                'Functional',
                '22%',
                'Distribution of institutional functions (rulemaking, enforcement, personnel actions, etc.) compared to baseline.',
              ],
              [
                'Agency',
                '13%',
                'Distribution of publishing agencies compared to baseline. Detects shifts in which agencies are active.',
              ],
              [
                'Tempo',
                '12%',
                'Variance in daily publication counts within the week. High values suggest bursty publishing patterns.',
              ],
              [
                'Convergence',
                '13%',
                'Ratio of government-origin sources to news/rhetoric sources. Shifts may indicate changing information dynamics.',
              ],
            ]}
          />
          <p>
            Weights are defined in{' '}
            <code className="text-xs bg-dm-card px-1 py-0.5 rounded">scoring-config.ts</code> and
            sum to 1.0. Categories with fewer than 10 documents in a week receive dampened scores to
            reduce noise.
          </p>
        </Section>

        <Section title="Baseline" id="baseline">
          <p>
            Z-scores are computed using <strong>cycle-year matching</strong>: Year 1 of the current
            administration is compared against Year 1 of the Biden administration, Year 2 against
            Year 2, and so on. This accounts for predictable seasonal patterns — first-year
            administrations systematically differ from second-year administrations (higher executive
            order volume, more personnel changes), so comparing like-to-like avoids false positives.
          </p>
          <p>
            The system maintains eight historical baselines — every year of the two preceding
            administrations: Biden 2021–2024 (cycle years 1–4) and Trump 2017–2020 (cycle years
            1–4). The Biden baselines are the primary reference; Trump baselines are available for
            cross-administration comparison in the{' '}
            <Link href="/data" className="text-dm-accent hover:underline">
              CSV export
            </Link>
            .
          </p>
          <p>
            A composite z-score above <strong>2.5</strong> (or a category-specific override for thin
            categories) is flagged as structurally anomalous. This threshold is shown in cell
            tooltips. For full methodology details, see the{' '}
            <Link href="/system/methodology" className="text-dm-accent hover:underline">
              methodology page
            </Link>
            .
          </p>
        </Section>
      </div>

      {loading && <p className="text-sm text-dm-text-secondary py-4">Loading structural data…</p>}
      {error && <p className="text-sm text-red-500 py-4">Error: {error}</p>}
      {!loading && !error && (
        <StructuralHeatmap rows={rows} mode={mode} onCellClick={handleCellClick} />
      )}
    </>
  );
}
