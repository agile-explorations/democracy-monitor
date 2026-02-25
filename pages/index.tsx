import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { CategoryCard } from '@/components/landing/CategoryCard';
import { DataIntegrityBanner } from '@/components/landing/DataIntegrityBanner';
import { MethodologyFooter } from '@/components/landing/MethodologyFooter';
import { SourceHealthBar } from '@/components/landing/SourceHealthBar';
import { CategoryDriftHeatmap } from '@/components/overview/CategoryDriftHeatmap';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import { StatusTimeline } from '@/components/overview/StatusTimeline';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import type { CategorySummary } from '@/lib/services/category-summary-service';
import type { MetaAssessment } from '@/lib/services/meta-assessment-service';
import type { SourceHealthCheck, SourceHealthSummary } from '@/lib/services/source-health-service';
import type { OverviewSummary } from '@/lib/types/overview';

export default function Home() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();
  const handleCellClick = useCallback(
    (category: string, week: string) => router.push(`/category/${category}/week/${week}`),
    [router],
  );
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [meta, setMeta] = useState<MetaAssessment | null>(null);
  const [healthSummary, setHealthSummary] = useState<SourceHealthSummary | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [catRes, overviewRes, metaRes, srcRes] = await Promise.all([
          fetch('/api/categories/summary'),
          fetch('/api/overview/summary'),
          fetch('/api/health/meta'),
          fetch('/api/health/sources'),
        ]);
        if (catRes.ok) {
          const data: CategorySummary[] = await catRes.json();
          setCategories([...data].sort((a, b) => b.decayWeightedScore - a.decayWeightedScore));
        }
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (metaRes.ok) setMeta(await metaRes.json());
        if (srcRes.ok) {
          const srcData = await srcRes.json();
          if (srcData.summary) setHealthSummary(srcData.summary);
          if (srcData.sources?.length) {
            const latest = (srcData.sources as SourceHealthCheck[]).reduce(
              (max: string, s: SourceHealthCheck) => (s.checkedAt > max ? s.checkedAt : max),
              srcData.sources[0].checkedAt,
            );
            setLastCheckedAt(latest);
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const lastUpdated = categories.find((c) => c.assessedAt)?.assessedAt ?? null;

  return (
    <>
      <Head>
        <title>Democracy Monitor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Automated, transparent analysis of U.S. government documents tracking institutional health across 11 categories."
        />
      </Head>
      <main>
        {/* Subtitle + last updated */}
        <div className="mb-6">
          <p className="text-sm text-dm-text-secondary">
            Automated analysis of the U.S. government documentary record
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-dm-muted mt-1">
              Last updated: {new Date(lastUpdated).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Data integrity banner (above everything when active) */}
        {meta && (
          <DataIntegrityBanner
            dataIntegrity={meta.dataIntegrity}
            summary={meta.summary}
            healthySources={healthSummary?.healthySources ?? 0}
            totalSources={healthSummary?.totalSources ?? 0}
          />
        )}

        {/* Positioning statement */}
        <section className="mb-6">
          <p className="text-sm text-dm-text-secondary leading-relaxed max-w-3xl">
            Democracy Monitor reads government documents published in the Federal Register and
            analyzes them using three-layer triangulated detection: structural anomaly analysis, AI
            document assessment, and thematic drift monitoring. Unlike expert opinion indices, every
            assessment traces to specific documents and reproducible metrics. The methodology is
            open source.
          </p>
        </section>

        {/* Source health summary bar */}
        {healthSummary && healthSummary.totalSources > 0 && (
          <SourceHealthBar
            healthySources={healthSummary.healthySources}
            degradedSources={healthSummary.degradedSources}
            unavailableSources={healthSummary.unavailableSources}
            silentSources={healthSummary.silentSources}
            totalSources={healthSummary.totalSources}
            lastCheckedAt={lastCheckedAt}
          />
        )}

        {/* Overview section — only shown when overview data is available */}
        {overview && (
          <div className="space-y-8 mb-8">
            {/* Status distribution */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-3">
                Current Status Distribution
              </h2>
              <OverviewStatusSummary statusCounts={overview.statusCounts} />
            </section>

            {/* Synchrony chart */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                Cross-Category Synchrony
              </h2>
              <p className="text-[11px] text-dm-muted mb-3">
                Number of categories at Elevated or above per week
              </p>
              <SynchronyChart data={overview.synchrony} mode={resolvedMode} />
            </section>

            {/* Drift heatmap */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                Convergence Score Heatmap
              </h2>
              <p className="text-[11px] text-dm-muted mb-3">
                Warmer colors indicate higher convergence scores across detection layers
              </p>
              <CategoryDriftHeatmap
                rows={overview.heatmap}
                mode={resolvedMode}
                onCellClick={handleCellClick}
              />
            </section>

            {/* Status timeline */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">Status Timeline</h2>
              <p className="text-[11px] text-dm-muted mb-3">
                Convergence status per category over time
              </p>
              <StatusTimeline
                entries={overview.statusTimeline}
                mode={resolvedMode}
                onCellClick={handleCellClick}
              />
            </section>
          </div>
        )}

        {/* Category grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: CATEGORIES.length }, (_, i) => (
              <div
                key={i}
                className="rounded-lg border border-dm-border bg-dm-card p-6 animate-pulse h-64"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <CategoryCard
                key={cat.category}
                category={cat.category}
                title={cat.title}
                status={cat.status}
                insufficientData={cat.insufficientData}
                decayWeightedScore={cat.decayWeightedScore}
                baselineAvg={cat.baselineAvg}
                baselineStdDev={cat.baselineStdDev}
                sparklineData={cat.sparklineData}
                documentCount={cat.documentCount}
                flaggedCount={cat.flaggedCount}
                summary={cat.summary}
                readingLevel={readingLevel}
                convergenceStatus={cat.convergenceStatus}
                structuralElevated={cat.structuralElevated}
                aiElevated={cat.aiElevated}
                thematicElevated={cat.thematicElevated}
              />
            ))}
          </div>
        )}

        <MethodologyFooter />
      </main>
    </>
  );
}
