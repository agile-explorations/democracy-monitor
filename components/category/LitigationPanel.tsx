import { useCallback, useEffect, useState } from 'react';
import { CaseContext } from '@/components/shared/CaseContext';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import { CATEGORIES } from '@/lib/data/categories';
import type { TrackedCaseListItem } from '@/pages/api/category/cases';

const CATEGORY_TITLES = new Map(CATEGORIES.map((c) => [c.key, c.title]));

/**
 * Category-level tracked-litigation panel (#696): case cards from
 * tracked_cases (zero CourtListener calls to render), with the shipped
 * CaseContext disclosure supplying the live entry-level timeline on expand.
 */

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function CaseCard({
  item,
  showCategories,
}: {
  item: TrackedCaseListItem;
  showCategories?: boolean;
}) {
  return (
    <div className="rounded border border-dm-border/60 bg-dm-bg/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-dm-text-primary">{item.caseName}</span>
        <span
          className={`px-1.5 py-0 rounded text-[10px] font-medium whitespace-nowrap ${
            item.status === 'open'
              ? 'bg-dm-accent/15 text-dm-accent'
              : 'bg-dm-border/50 text-dm-muted'
          }`}
        >
          {item.status === 'open' ? 'Open' : 'Terminated'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-dm-muted">
        {item.courtName && <span>{item.courtName}</span>}
        {item.docketNumber && <span>{item.docketNumber}</span>}
        <span>Filed {formatDate(item.dateFiled)}</span>
        {item.dateTerminated ? (
          <span>Terminated {formatDate(item.dateTerminated)}</span>
        ) : (
          item.dateLastFiling && <span>Last activity {formatDate(item.dateLastFiling)}</span>
        )}
        {item.natureOfSuit && <span>{item.natureOfSuit}</span>}
      </div>
      {showCategories && item.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {item.categories.map((key) => (
            <span
              key={key}
              className="px-1.5 py-0 rounded border border-dm-border/60 text-[10px] text-dm-text-secondary"
            >
              {CATEGORY_TITLES.get(key) ?? key}
            </span>
          ))}
        </div>
      )}
      {item.posture && <p className="mt-1 text-xs text-dm-muted italic">{item.posture.line}</p>}
      <CaseContext caseId={item.caseId} />
    </div>
  );
}

/** Omit categoryKey (or pass '_all') for the combined cross-category view. */
export function LitigationPanel({ categoryKey = '_all' }: { categoryKey?: string }) {
  const combined = categoryKey === '_all';
  const [cases, setCases] = useState<TrackedCaseListItem[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(
    async (nextPage: number, filter: 'open' | 'all', append: boolean) => {
      try {
        const res = await fetch(
          `/api/category/cases?key=${encodeURIComponent(categoryKey)}&status=${filter}&page=${nextPage}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setCases((prev) => (append ? [...prev, ...data.cases] : data.cases));
        setOpenCount(data.openCount);
        setTotalCount(data.totalCount);
        setHasMore(data.hasMore);
        setPage(nextPage);
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [categoryKey],
  );

  useEffect(() => {
    setState('loading');
    void load(1, statusFilter, false);
  }, [load, statusFilter]);

  if (state === 'ready' && totalCount === 0) return null;

  return (
    <section className="mt-6 mb-6">
      <CollapsiblePanel
        title={`Litigation${openCount != null ? ` — ${openCount} open case${openCount === 1 ? '' : 's'}` : ''}`}
        defaultOpen={false}
      >
        <div className="flex items-center gap-2 mb-3 text-[11px]">
          {(['open', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2 py-0.5 rounded border ${
                statusFilter === f
                  ? 'border-dm-accent text-dm-accent'
                  : 'border-dm-border text-dm-muted hover:text-dm-text-secondary'
              }`}
            >
              {f === 'open' ? 'Open cases' : 'All cases'}
            </button>
          ))}
          {totalCount != null && <span className="text-dm-muted">{totalCount} tracked</span>}
        </div>
        {state === 'loading' && (
          <p className="text-xs text-dm-muted">Loading tracked litigation…</p>
        )}
        {state === 'error' && (
          <p className="text-xs text-dm-muted">Tracked litigation unavailable</p>
        )}
        {state === 'ready' && cases.length === 0 && (
          <p className="text-xs text-dm-muted">No tracked litigation yet</p>
        )}
        {cases.length > 0 && (
          <div className="space-y-2">
            {cases.map((item) => (
              <CaseCard key={item.caseId} item={item} showCategories={combined} />
            ))}
          </div>
        )}
        {hasMore && (
          <button
            onClick={() => void load(page + 1, statusFilter, true)}
            className="mt-3 text-xs text-dm-accent hover:underline"
          >
            Load more
          </button>
        )}
      </CollapsiblePanel>
    </section>
  );
}
