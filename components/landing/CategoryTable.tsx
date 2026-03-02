import Link from 'next/link';
import { useState } from 'react';
import { ConvergenceIndicator } from '@/components/ui/ConvergenceIndicator';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusPill } from '@/components/ui/StatusPill';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CATEGORIES } from '@/lib/data/categories';
import type { CategorySummary } from '@/lib/services/category-summary-service';

export interface CategoryTableProps {
  categories: CategorySummary[];
  readingLevel: ReadingLevel;
}

function formatRatio(score: number, baseline: number): string {
  if (baseline <= 0) return '\u2014';
  return `${(score / baseline).toFixed(1)}\u00d7`;
}

export function CategoryTable({ categories, readingLevel }: CategoryTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const descriptionMap = new Map(CATEGORIES.map((c) => [c.key, c.description]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-dm-border text-left text-dm-muted">
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 px-2 font-medium">Status</th>
            <th className="py-2 px-2 font-medium hidden md:table-cell">Layers</th>
            <th className="py-2 px-2 font-medium">Trend</th>
            <th className="py-2 px-2 font-medium text-right">Score</th>
            <th className="py-2 px-2 font-medium text-right hidden md:table-cell">vs Baseline</th>
            <th className="py-2 px-2 font-medium text-right">Docs</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const isExpanded = expandedKey === cat.category;
            const description = descriptionMap.get(cat.category) ?? '';

            return (
              <CategoryRow
                key={cat.category}
                cat={cat}
                description={description}
                isExpanded={isExpanded}
                readingLevel={readingLevel}
                onToggle={() => setExpandedKey(isExpanded ? null : cat.category)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRow({
  cat,
  description,
  isExpanded,
  readingLevel,
  onToggle,
}: {
  cat: CategorySummary;
  description: string;
  isExpanded: boolean;
  readingLevel: ReadingLevel;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-dm-border/50 hover:bg-dm-border/20 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 pr-3">
          <div className="flex items-center gap-1.5">
            <span className="text-dm-muted text-[10px] w-3 shrink-0" aria-hidden="true">
              {isExpanded ? '\u25BE' : '\u25B8'}
            </span>
            <Link
              href={`/category/${cat.category}`}
              onClick={(e) => e.stopPropagation()}
              className="text-dm-text-primary font-medium hover:text-dm-accent transition-colors"
            >
              {cat.title}
            </Link>
          </div>
          {readingLevel === 'detailed' && (
            <span className="text-[10px] font-mono text-dm-muted ml-[18px]">{cat.category}</span>
          )}
        </td>
        <td className="py-2 px-2">
          {cat.insufficientData ? (
            <span className="text-[10px] text-dm-muted">No Data</span>
          ) : (
            <StatusPill level={cat.status} />
          )}
        </td>
        <td className="py-2 px-2 hidden md:table-cell">
          {cat.convergenceStatus ? (
            <ConvergenceIndicator
              structural={cat.structuralElevated}
              ai={cat.aiElevated}
              thematic={cat.thematicElevated}
            />
          ) : (
            <span className="text-dm-muted">\u2014</span>
          )}
        </td>
        <td className="py-2 px-2">
          <div className="w-[120px]">
            <Sparkline
              data={cat.sparklineData}
              baselineAvg={cat.baselineAvg}
              baselineStdDev={cat.baselineStdDev}
              width={120}
              height={28}
            />
          </div>
        </td>
        <td className="py-2 px-2 text-right text-dm-text-primary font-medium tabular-nums">
          {cat.decayWeightedScore.toFixed(1)}
        </td>
        <td className="py-2 px-2 text-right text-dm-text-secondary tabular-nums hidden md:table-cell">
          {formatRatio(cat.decayWeightedScore, cat.baselineAvg)}
        </td>
        <td className="py-2 px-2 text-right text-dm-text-secondary tabular-nums">
          {cat.documentCount}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-dm-border/10">
            <p className="text-xs text-dm-text-secondary leading-relaxed max-w-2xl ml-[18px]">
              {description}
            </p>
            {cat.summary && (
              <p className="text-xs text-dm-muted leading-relaxed max-w-2xl ml-[18px] mt-2 italic">
                {cat.summary}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
