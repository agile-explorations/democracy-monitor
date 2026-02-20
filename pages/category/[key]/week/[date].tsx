import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Sparkline } from '@/components/ui/Sparkline';
import { DocumentTable } from '@/components/week/DocumentTable';
import { KeywordMatchesSection } from '@/components/week/KeywordMatchesSection';
import { WeekSummaryCards } from '@/components/week/WeekSummaryCards';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CATEGORIES } from '@/lib/data/categories';
import type { WeekExplanation } from '@/lib/types/explanation';

interface WeeklyRow {
  weekOf: string;
  totalSeverity: number;
}

function formatWeekDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function computeTierCounts(explanation: WeekExplanation) {
  let capture = 0;
  let drift = 0;
  let warning = 0;
  for (const doc of explanation.topDocuments) {
    for (const tb of doc.tierBreakdown) {
      if (tb.tier === 'capture') capture += tb.count;
      else if (tb.tier === 'drift') drift += tb.count;
      else if (tb.tier === 'warning') warning += tb.count;
    }
  }
  return { capture, drift, warning };
}

export default function WeekDetailPage() {
  const router = useRouter();
  const { key, date } = router.query;
  const { readingLevel } = useReadingLevel();
  const [explanation, setExplanation] = useState<WeekExplanation | null>(null);
  const [sparklineData, setSparklineData] = useState<Array<{ week: string; score: number }>>([]);
  const [baselineAvg, setBaselineAvg] = useState(0);
  const [baselineStdDev, setBaselineStdDev] = useState(0);
  const [loading, setLoading] = useState(true);

  const category = CATEGORIES.find((c) => c.key === key);
  const title = category?.title ?? String(key ?? '');

  useEffect(() => {
    if (!key || !date || typeof key !== 'string' || typeof date !== 'string') return;

    async function loadData() {
      try {
        const [explainRes, weeklyRes, catRes] = await Promise.all([
          fetch(`/api/explain/week?category=${key}&weekOf=${date}&top=200`),
          fetch(`/api/history/weekly-scores?category=${key}`),
          fetch(`/api/category/${key}`),
        ]);

        if (explainRes.ok) setExplanation(await explainRes.json());
        if (weeklyRes.ok) {
          const rows: WeeklyRow[] = await weeklyRes.json();
          setSparklineData(rows.map((r) => ({ week: r.weekOf, score: Number(r.totalSeverity) })));
        }
        if (catRes.ok) {
          const catData = await catRes.json();
          setBaselineAvg(catData.baseline?.avg ?? 0);
          setBaselineStdDev(catData.baseline?.stddev ?? 0);
        }
      } catch (err) {
        console.error('Failed to load week detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [key, date]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-48 bg-dm-border/50 rounded" />
        <div className="h-8 w-64 bg-dm-border/50 rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-dm-border/30 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!explanation) {
    return (
      <>
        <Link href={`/category/${key}`} className="text-xs text-dm-accent hover:underline">
          &larr; Back to {title}
        </Link>
        <p className="mt-8 text-sm text-dm-text-secondary">No data found for this week.</p>
      </>
    );
  }

  const tierCounts = computeTierCounts(explanation);

  return (
    <>
      <Head>
        <title>
          Week of {formatWeekDate(String(date))} — {title} — Democracy Monitor
        </title>
      </Head>

      {/* Back link */}
      <Link href={`/category/${key}`} className="text-xs text-dm-accent hover:underline">
        &larr; Back to {title}
      </Link>

      {/* Header */}
      <header className="mt-4 mb-6">
        <h2 className="text-lg font-bold text-dm-text-primary">
          Week of {formatWeekDate(String(date))}
        </h2>
        <p className="text-xs text-dm-text-secondary mt-1">
          {title}
          {readingLevel === 'detailed' && <span className="font-mono ml-2">({key})</span>}
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-6">
        <WeekSummaryCards
          totalScore={explanation.totalSeverity}
          documentCount={explanation.documentCount}
          captureCount={tierCounts.capture}
          driftCount={tierCounts.drift}
          warningCount={tierCounts.warning}
          baselineAvg={baselineAvg}
        />
      </div>

      {/* Position in context sparkline */}
      {sparklineData.length > 0 && (
        <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
            Position in Context
          </h3>
          <Sparkline
            data={sparklineData}
            baselineAvg={baselineAvg}
            baselineStdDev={baselineStdDev}
            highlightWeek={String(date)}
          />
        </div>
      )}

      {/* Top keyword matches */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Top Keyword Matches
        </h3>
        <KeywordMatchesSection documents={explanation.topDocuments} readingLevel={readingLevel} />
      </div>

      {/* Suppressed matches (detailed mode only) */}
      {readingLevel === 'detailed' &&
        explanation.topDocuments.some((d) => d.suppressed.length > 0) && (
          <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
              Suppressed Matches
            </h3>
            <ul className="space-y-1">
              {explanation.topDocuments.flatMap((doc) =>
                doc.suppressed.map((s) => (
                  <li key={`${doc.url}-${s.keyword}`} className="text-xs text-dm-text-secondary">
                    &ldquo;{s.keyword}&rdquo;
                    <span className="text-dm-muted ml-1">&mdash; {s.reason}</span>
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

      {/* Document table */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <DocumentTable
          documents={explanation.topDocuments}
          category={String(key)}
          weekOf={String(date)}
        />
      </div>
    </>
  );
}
