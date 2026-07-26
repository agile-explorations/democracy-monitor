import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ThematicHeatmap } from '@/components/data/ThematicHeatmap';
import { SEOHead } from '@/components/shared/SEOHead';
import { DataTable, Section } from '@/components/system/ContentHelpers';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { THEMATIC_ROLLING_WINDOW_WEEKS } from '@/lib/methodology/scoring-config';
import type { StandoutRun } from '@/lib/services/structural-heatmap-service';
import type { ThematicHeatmapRow } from '@/lib/types/overview';

export default function ThematicDriftPage() {
  const { resolvedMode: mode } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ThematicHeatmapRow[]>([]);
  const [standouts, setStandouts] = useState<StandoutRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/data/thematic');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.rows);
        setStandouts(data.standouts ?? []);
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
        title="Thematic Drift"
        description="Cross-category thematic drift heatmap showing semantic shift in document language relative to recent 8-week rolling baselines."
        canonicalPath="/data/thematic"
      />

      <Link href="/data" className="text-xs text-dm-accent hover:underline">
        &larr; Back to data
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">Thematic Drift</h1>

      <div className="max-w-3xl space-y-2 mb-8">
        <Section title="What this shows" id="what-this-shows">
          <p>
            This heatmap displays <strong>thematic drift scores</strong> across all 14 monitored
            categories over time. Thematic drift measures semantic shift in document language
            compared to a rolling 8-week intra-administration baseline. It detects when the topics
            and language in a category&apos;s documents change relative to recent patterns.
          </p>
          <p>
            Thematic drift is <strong>descriptive, not evaluative</strong>. A spike could reflect a
            legitimate policy pivot, a new legislative session, or a concerning shift in
            institutional priorities. Concern status is driven separately by{' '}
            <Link href="/system/methodology" className="text-dm-accent hover:underline">
              AI document review
            </Link>
            .
          </p>
        </Section>

        <Section title="How to read the heatmap" id="how-to-read">
          <p>
            Each cell represents one category in one week. The default view shows{' '}
            <strong>z-scores</strong>: how far this week&apos;s language sits from the average of
            the preceding 8 weeks, measured in units of typical week-to-week change within that
            window. The current week is never part of its own comparison window.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Blue cells</strong> (negative z-scores) — below-average thematic change
              (unusually stable language)
            </li>
            <li>
              <strong>Neutral cells</strong> (z-score near 0) — typical thematic variation
            </li>
            <li>
              <strong>Red cells</strong> (positive z-scores) — above-average thematic shift
            </li>
            <li>
              <strong>Dashed border</strong> — bootstrap period (fewer than 8 weeks of history
              available)
            </li>
            <li>
              <strong>Striped cells</strong> — no data available for that category-week
            </li>
          </ul>
          <p>
            Other metrics use a sequential scale (neutral to warm) since they are non-negative
            values measuring magnitude rather than deviation.
          </p>
        </Section>

        <Section title="Metrics" id="metrics">
          <DataTable
            headers={['Metric', 'Range', 'What it measures']}
            rows={[
              [
                'z-Score',
                '-4 to +4',
                'Distance from the preceding 8 weeks\u2019 mean centroid, divided by the typical week-to-week centroid movement inside that window. Default view.',
              ],
              [
                'Centroid Distance',
                '0\u20130.5',
                'Cosine distance between this week\u2019s document centroid and the mean centroid of the preceding 8 weeks. Higher = more semantic shift.',
              ],
              [
                'Novel Doc Rate',
                '0\u20131',
                'Proportion of this week\u2019s documents that exceed the novelty threshold vs. the rolling centroid. Higher = more new topics.',
              ],
              [
                'Variance Ratio',
                '0\u20133',
                'Ratio of this week\u2019s embedding variance to the rolling window\u2019s variance. Values > 1 indicate more diverse document topics.',
              ],
              [
                'Cross-Admin Distance',
                '0\u20130.5',
                'Cosine distance between the current centroid and the Biden-era baseline centroid. Contextual only.',
              ],
            ]}
          />
        </Section>

        <Section title="Methodology" id="methodology">
          <p>
            Thematic drift uses <strong>embedding-based cosine distance</strong> to measure semantic
            change. Each document is embedded using OpenAI&apos;s text-embedding-3-small model. The
            rolling window compares this week&apos;s document centroid to the mean centroid of the
            prior 8 weeks within the same administration.
          </p>
          <p>
            The 8-week intra-administration window avoids false positives from normal
            administration-to-administration policy changes. Cross-admin distance is available
            separately for researchers comparing across administrations.
          </p>
          <p>
            For full methodology details, see the{' '}
            <Link href="/system/methodology" className="text-dm-accent hover:underline">
              methodology page
            </Link>
            .
          </p>
        </Section>
      </div>

      {loading && <p className="text-sm text-dm-text-secondary py-4">Loading thematic data...</p>}
      {error && <p className="text-sm text-red-500 py-4">Error: {error}</p>}
      {!loading && !error && (
        <>
          {standouts.length > 0 && (
            <section className="mb-6 rounded-lg border border-dm-border bg-dm-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
                What stands out{' '}
                <span className="normal-case font-normal text-dm-muted">
                  (compared to the previous {THEMATIC_ROLLING_WINDOW_WEEKS} weeks)
                </span>
              </h2>
              <ul className="space-y-1.5 list-disc list-inside marker:text-dm-muted">
                {standouts.map((run) => (
                  <li key={`${run.category}-${run.startWeek}`} className="text-sm">
                    <Link
                      href={`/category/${run.category}`}
                      className="text-dm-text-primary hover:text-dm-accent"
                    >
                      {run.sentence}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ThematicHeatmap rows={rows} mode={mode} onCellClick={handleCellClick} />
        </>
      )}
    </>
  );
}
