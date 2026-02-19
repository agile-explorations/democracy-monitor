import Head from 'next/head';
import { useEffect, useState } from 'react';
import { CategoryCard } from '@/components/landing/CategoryCard';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { MethodologyFooter } from '@/components/landing/MethodologyFooter';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CATEGORIES } from '@/lib/data/categories';
import type { CategorySummary } from '@/lib/services/category-summary-service';

export default function Home() {
  const { readingLevel } = useReadingLevel();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch('/api/categories/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CategorySummary[] = await res.json();
        const sorted = [...data].sort((a, b) => b.decayWeightedScore - a.decayWeightedScore);
        setCategories(sorted);
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
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
      <div className="min-h-screen bg-dm-bg">
        <main className="max-w-content mx-auto px-4 sm:px-6 py-8">
          <LandingHeader lastUpdated={lastUpdated} />

          {/* Positioning statement */}
          <section className="mb-8">
            <p className="text-sm text-dm-text-secondary leading-relaxed max-w-3xl">
              Democracy Monitor reads government documents published in the Federal Register and
              scores them using transparent, auditable keyword analysis. Unlike expert opinion
              indices, every assessment traces to specific documents and specific keywords. The
              methodology is open source.
            </p>
          </section>

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
                  decayWeightedScore={cat.decayWeightedScore}
                  baselineAvg={cat.baselineAvg}
                  baselineStdDev={cat.baselineStdDev}
                  sparklineData={cat.sparklineData}
                  documentCount={cat.documentCount}
                  flaggedCount={cat.flaggedCount}
                  summary={cat.summary}
                  readingLevel={readingLevel}
                />
              ))}
            </div>
          )}

          <MethodologyFooter />
        </main>
      </div>
    </>
  );
}
