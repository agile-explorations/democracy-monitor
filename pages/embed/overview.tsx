/**
 * Embeddable overview chart — renders just the Cumulative Departure Score
 * and Status Distribution bar without site chrome.
 *
 * Query params:
 *   ?theme=light|dark     (default: light)
 *   ?range=3mo|6mo|1yr|all (default: all)
 *   ?comparison=on|off    (default: on)
 *   ?level=summary|detailed (default: detailed)
 */

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import { presetToWeekCount } from '@/components/overview/TimeRangeSelector';
import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';
import type { OverviewSummary } from '@/lib/types/overview';
import type { ConcernLevel } from '@/lib/types/structural';
import { formatWeekLabel } from '@/lib/utils/date-utils';

const SITE_URL = 'https://democracymonitor.org';

function useQueryParam(name: string, defaultValue: string): string {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name) ?? defaultValue);
  }, [name, defaultValue]);
  return value;
}

export default function EmbedOverview() {
  const theme = useQueryParam('theme', 'light') as 'light' | 'dark';
  const range = useQueryParam('range', 'all') as TimeRangePreset;
  const comparison = useQueryParam('comparison', 'on');
  const level = useQueryParam('level', 'detailed') as 'summary' | 'detailed';

  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/overview/summary');
        if (res.ok) setOverview(await res.json());
      } catch {
        // Silently fail — embed shows "Failed to load data"
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalWeeks = overview?.synchrony.length ?? 0;

  const activeRange = useMemo(() => {
    if (!totalWeeks) return null;
    const weeksToShow = presetToWeekCount(range, totalWeeks);
    const start = Math.max(0, totalWeeks - weeksToShow);
    return { start, end: totalWeeks - 1 };
  }, [range, totalWeeks]);

  const filteredStatusCounts = useMemo(() => {
    const counts: Record<ConcernLevel, number> = {
      Stable: 0,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    if (!overview || !activeRange) return counts;
    for (const entry of overview.statusTimeline) {
      const segs = entry.segments.slice(activeRange.start, activeRange.end + 1);
      for (const seg of segs) {
        counts[(seg.status ?? 'Stable') as ConcernLevel]++;
      }
    }
    return counts;
  }, [overview, activeRange]);

  const rangeLabel = useMemo(() => {
    if (!overview?.statusTimeline.length || !activeRange) return '';
    const segs = overview.statusTimeline[0].segments;
    const first = segs[activeRange.start]?.week;
    const last = segs[activeRange.end]?.week;
    if (!first || !last) return '';
    return `${formatWeekLabel(first)} \u2013 ${formatWeekLabel(last)}`;
  }, [overview, activeRange]);

  const mode = theme === 'dark' ? 'dark' : 'light';
  const bg = mode === 'dark' ? '#0f172a' : '#ffffff';
  const textColor = mode === 'dark' ? '#f1f5f9' : '#1e293b';

  return (
    <>
      <Head>
        <title>Democracy Monitor — Cumulative Departure Score</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div
        style={{
          backgroundColor: bg,
          color: textColor,
          padding: '16px 20px 8px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100vh',
        }}
        className={mode === 'dark' ? 'dark' : ''}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5, fontSize: 13 }}>
            Loading...
          </div>
        ) : overview ? (
          <>
            <SynchronyChart
              data={overview.synchrony}
              mode={mode}
              readingLevel={level}
              brushStartIndex={activeRange?.start}
              brushEndIndex={activeRange?.end}
            />

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                Status Distribution
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>{rangeLabel}</div>
              <OverviewStatusSummary statusCounts={filteredStatusCounts} />
            </div>

            <div
              style={{
                marginTop: 12,
                textAlign: 'right',
                fontSize: 10,
                opacity: 0.5,
              }}
            >
              <a
                href={SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                Democracy Monitor
              </a>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5, fontSize: 13 }}>
            Failed to load data
          </div>
        )}
      </div>
    </>
  );
}
