import Link from 'next/link';
import { useState } from 'react';
import { ConcernLevelPill } from '@/components/ui/ConcernLevelPill';
import { Sparkline } from '@/components/ui/Sparkline';
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import { CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import {
  AI_FLAG_RATE_THRESHOLD,
  STRUCTURAL_ANOMALY_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { CategorySummary } from '@/lib/services/category-summary-service';

export interface CategoryTableProps {
  categories: CategorySummary[];
  readingLevel: ReadingLevel;
  highlightWeek?: string | null;
  linkParams?: string;
}

const LAYER_THRESHOLDS = [
  STRUCTURAL_ANOMALY_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
] as const;

export function CategoryTable({
  categories,
  readingLevel,
  highlightWeek,
  linkParams = '',
}: CategoryTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { resolvedMode } = useTheme();
  const elevatedColor = CONCERN_LEVEL_COLORS[resolvedMode].Elevated;

  const descriptionMap = new Map(CATEGORIES.map((c) => [c.key, c.description]));

  return (
    <div className="overflow-x-auto md:overflow-visible">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-dm-border text-left text-dm-muted">
            <th className="py-2 pr-3 font-medium align-bottom">Category</th>
            <th className="py-2 px-2 font-medium align-bottom">Status</th>
            <th className="py-2 px-2 font-medium align-bottom hidden sm:table-cell">
              Status Trend Line
            </th>
            {readingLevel === 'detailed' && (
              <>
                <th
                  className="py-2 px-2 font-medium text-right align-bottom"
                  title="Structural anomaly composite score"
                >
                  Structural
                </th>
                <th
                  className="py-2 px-2 font-medium text-right align-bottom"
                  title="AI document review flag rate z-score"
                >
                  AI
                </th>
                <th
                  className="py-2 px-2 font-medium text-right align-bottom"
                  title="Thematic drift z-score"
                >
                  Thematic
                </th>
                <th className="py-2 px-2 font-medium text-right align-bottom">Docs</th>
              </>
            )}
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
                highlightWeek={highlightWeek}
                linkParams={linkParams}
                elevatedColor={elevatedColor}
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
  highlightWeek,
  linkParams,
  elevatedColor,
  onToggle,
}: {
  cat: CategorySummary;
  description: string;
  isExpanded: boolean;
  readingLevel: ReadingLevel;
  highlightWeek?: string | null;
  linkParams: string;
  elevatedColor: string;
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
              href={`/category/${keyToSlug(cat.category)}${linkParams}`}
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
          {cat.convergenceStatus ? (
            <ConcernLevelPill status={cat.convergenceStatus} />
          ) : (
            <span className="text-[10px] text-dm-muted">No Data</span>
          )}
        </td>
        <td className="py-2 px-2 hidden sm:table-cell">
          <div className="w-[120px]">
            <Sparkline
              data={cat.sparklineData}
              baselineAvg={0}
              baselineStdDev={0}
              width={120}
              height={28}
              highlightWeek={highlightWeek ?? undefined}
            />
          </div>
        </td>
        {readingLevel === 'detailed' && (
          <>
            {([cat.structuralScore, cat.aiScore, cat.thematicScore] as const).map((score, i) => {
              const elevated = score != null && score >= LAYER_THRESHOLDS[i];
              return (
                <td
                  key={i}
                  className="py-2 px-2 text-right tabular-nums font-medium"
                  style={elevated ? { color: elevatedColor } : undefined}
                >
                  {score != null ? score.toFixed(1) : '\u2014'}
                </td>
              );
            })}
            <td className="py-2 px-2 text-right text-dm-text-secondary tabular-nums">
              {cat.documentCount}
            </td>
          </>
        )}
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={readingLevel === 'detailed' ? 7 : 3} className="px-4 py-3 bg-dm-border/10">
            <p className="text-xs text-dm-text-secondary leading-relaxed max-w-2xl ml-[18px]">
              {description}
            </p>
            {cat.summary && (
              <p className="text-xs text-dm-text-secondary leading-relaxed max-w-2xl ml-[18px] mt-2 font-medium">
                {cat.summary}
              </p>
            )}
            {cat.narrativeExcerpt && (
              <p className="text-xs text-dm-muted leading-relaxed max-w-2xl ml-[18px] mt-2 pl-3 border-l-2 border-dm-accent/30 italic">
                {cat.narrativeExcerpt}
              </p>
            )}
            {cat.weekOf && cat.documentCount > 0 && (
              <p className="ml-[18px] mt-2">
                <Link
                  href={`/category/${keyToSlug(cat.category)}?weekOf=${cat.weekOf}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-dm-accent hover:underline"
                >
                  See the {cat.documentCount} {cat.documentCount === 1 ? 'document' : 'documents'}{' '}
                  behind this status &rarr;
                </Link>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
