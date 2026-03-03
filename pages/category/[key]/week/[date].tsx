import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AIAssessmentPanel } from '@/components/category/AIAssessmentPanel';
import { ConvergenceHeader } from '@/components/category/ConvergenceHeader';
import { StructuralSignaturePanel } from '@/components/category/StructuralSignaturePanel';
import { ThematicDriftPanel } from '@/components/category/ThematicDriftPanel';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { DocumentTable } from '@/components/week/DocumentTable';
import { WeekCategoryGrid } from '@/components/week/WeekCategoryGrid';
import { WeekSummaryCards } from '@/components/week/WeekSummaryCards';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CATEGORIES } from '@/lib/data/categories';
import { useWeekDetail } from '@/lib/hooks/useWeekDetail';
import type { WeekExplanation } from '@/lib/types/explanation';

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
  const categoryKey = typeof key === 'string' ? key : undefined;
  const weekDate = typeof date === 'string' ? date : undefined;
  const { readingLevel } = useReadingLevel();

  const category = CATEGORIES.find((c) => c.key === key);
  const title = category?.title ?? String(key ?? '');

  const { categorySummaries, overviewNarrative, explanation, layers, baseline, loading } =
    useWeekDetail(categoryKey, weekDate);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-48 bg-dm-border/50 rounded" />
        <div className="h-8 w-64 bg-dm-border/50 rounded" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-dm-border/30 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const tierCounts = explanation ? computeTierCounts(explanation) : null;

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

      {/* Category status grid */}
      {categorySummaries.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
            All Categories This Week
          </h3>
          <WeekCategoryGrid summaries={categorySummaries} weekOf={String(date)} />
        </div>
      )}

      {/* Overview narrative */}
      <div className="mb-6">
        <NarrativeSection narrative={overviewNarrative} readingLevel={readingLevel} />
      </div>

      {/* Convergence header for this category */}
      <ConvergenceHeader synthesis={layers?.convergenceDetail ?? null} />

      {/* Summary cards */}
      {explanation && tierCounts && (
        <div className="mb-6">
          <WeekSummaryCards
            totalScore={explanation.totalSeverity}
            documentCount={explanation.documentCount}
            captureCount={tierCounts.capture}
            driftCount={tierCounts.drift}
            warningCount={tierCounts.warning}
            baselineAvg={baseline.avg}
          />
        </div>
      )}

      {/* Three-layer panels */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <StructuralSignaturePanel
          score={layers?.structuralDetail ?? null}
          readingLevel={readingLevel}
        />
      </div>

      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <AIAssessmentPanel summary={layers?.aiDetail ?? null} readingLevel={readingLevel} />
      </div>

      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <ThematicDriftPanel drift={layers?.thematicDetail ?? null} readingLevel={readingLevel} />
      </div>

      {/* Document table */}
      {explanation && (
        <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
          <DocumentTable
            documents={explanation.topDocuments}
            category={String(key)}
            weekOf={String(date)}
          />
        </div>
      )}
    </>
  );
}
