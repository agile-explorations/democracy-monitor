import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AiReviewerNotes } from '@/components/category/AiReviewerNotes';
import { AssessmentSummary } from '@/components/category/AssessmentSummary';
import { EvidencePanel } from '@/components/category/EvidencePanel';
import { TrendChart } from '@/components/category/TrendChart';
import type { TrendDataPoint } from '@/components/category/TrendChart';
import { StatusPill } from '@/components/ui/StatusPill';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import type { EnhancedAssessment, StatusLevel } from '@/lib/types';

interface CategoryDetail {
  category: string;
  title: string;
  assessment: EnhancedAssessment | null;
  baseline: { avg: number; stddev: number };
}

interface WeeklyRow {
  weekOf: string;
  totalSeverity: number;
  documentCount: number;
}

export default function CategoryDetailPage() {
  const router = useRouter();
  const { key } = router.query;
  const { readingLevel } = useReadingLevel();
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [weeklyData, setWeeklyData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key || typeof key !== 'string') return;

    async function loadData() {
      try {
        const [detailRes, weeklyRes] = await Promise.all([
          fetch(`/api/category/${key}`),
          fetch(`/api/history/weekly-scores?category=${key}`),
        ]);
        if (detailRes.ok) setDetail(await detailRes.json());
        if (weeklyRes.ok) {
          const rows: WeeklyRow[] = await weeklyRes.json();
          setWeeklyData(
            rows.map((r) => ({
              week: r.weekOf,
              score: Number(r.totalSeverity),
              documentCount: Number(r.documentCount),
            })),
          );
        }
      } catch (err) {
        console.error('Failed to load category detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [key]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-dm-border/50 rounded" />
        <div className="h-64 bg-dm-border/30 rounded-lg" />
        <div className="h-32 bg-dm-border/30 rounded-lg" />
      </div>
    );
  }

  if (!detail) {
    return (
      <>
        <Link href="/" className="text-xs text-dm-accent hover:underline">
          &larr; Back to overview
        </Link>
        <p className="mt-8 text-sm text-dm-text-secondary">Category not found.</p>
      </>
    );
  }

  const assessment = detail.assessment;
  const status: StatusLevel = assessment?.status ?? 'Stable';
  const docCount = weeklyData[weeklyData.length - 1]?.documentCount ?? 0;
  const assessedAt = assessment?.assessedAt
    ? new Date(assessment.assessedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const suppressedKeywords = assessment?.keywordReview
    ?.filter((kr) => kr.assessment === 'false_positive')
    .map((kr) => ({
      keyword: kr.keyword,
      assessment: kr.assessment,
      reasoning: kr.reasoning,
    }));

  return (
    <>
      <Head>
        <title>{detail.title} — Democracy Monitor</title>
      </Head>

      {/* Back link */}
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      {/* Page header */}
      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-dm-text-primary">{detail.title}</h2>
            <p className="text-xs text-dm-text-secondary mt-1">
              {readingLevel === 'detailed' && (
                <span className="font-mono mr-2">{detail.category}</span>
              )}
              {assessedAt && <>Last assessed: {assessedAt}</>}
              {docCount > 0 && <> &middot; {docCount} docs this week</>}
            </p>
          </div>
          <StatusPill level={status} />
        </div>

        {/* Data coverage */}
        {assessment?.dataCoverage !== undefined && (
          <p className="mt-2 text-[11px] text-dm-muted">
            Data coverage: {(assessment.dataCoverage * 100).toFixed(0)}%
          </p>
        )}
      </header>

      {/* Assessment summary */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <AssessmentSummary
          reason={assessment?.reason ?? 'No assessment data available.'}
          howWeCouldBeWrong={assessment?.howWeCouldBeWrong ?? []}
          readingLevel={readingLevel}
        />
      </div>

      {/* Trend chart */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Trend
        </h2>
        <TrendChart
          data={weeklyData}
          baselineAvg={detail.baseline.avg}
          baselineStdDev={detail.baseline.stddev}
          readingLevel={readingLevel}
        />
      </div>

      {/* Evidence panel */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <EvidencePanel
          matches={assessment?.matches ?? []}
          keywordMatches={undefined}
          reviewedDocuments={assessment?.reviewedDocuments}
          suppressedKeywords={suppressedKeywords}
          readingLevel={readingLevel}
        />
      </div>

      {/* AI reviewer notes */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <AiReviewerNotes
          aiResult={assessment?.aiResult}
          keywordReview={assessment?.keywordReview}
          evidenceFor={assessment?.evidenceFor}
          evidenceAgainst={assessment?.evidenceAgainst}
          whatWouldChangeMind={assessment?.whatWouldChangeMind}
          keywordStatus={assessment?.keywordResult?.status ?? 'Stable'}
          readingLevel={readingLevel}
        />
      </div>
    </>
  );
}
