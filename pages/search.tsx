import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DateRangeSelect } from '@/components/search/DateRangeSelect';
import { ExploreFilters, ExploreResults } from '@/components/search/ExploreResults';
import { parseStreamingSections } from '@/components/search/helpers';
import { ResearchResults } from '@/components/search/ResearchResults';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search/SearchHistory';
import type { ExploreResult, ResearchResult, SearchMode } from '@/components/search/types';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

type TierFilterValue = 'all' | 'action' | 'discussion';

export default function SearchPage() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const [mode, setMode] = useLocalStorage<SearchMode>('dm_search_mode', 'research');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { history, addEntry, clearHistory } = useSearchHistory();

  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [exploreResult, setExploreResult] = useState<ExploreResult | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);

  // Filters (date range shared by both modes)
  const [filterCategory, setFilterCategory] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterSort, setFilterSort] = useState('relevance');
  const [filterPage, setFilterPage] = useState(1);
  // Research facet (#552): 'all' = action-weighted tiered default
  const [tierFilter, setTierFilter] = useState<TierFilterValue>('all');

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Latest-search-wins (#race): each performSearch bumps the sequence and
  // cancels the previous run's stream/fetch; every state write checks it is
  // still the current run, so an abandoned search can never flash results
  // or stomp loading state.
  const searchSeq = useRef(0);
  const activeStream = useRef<EventSource | null>(null);
  const activeAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      activeStream.current?.close();
      activeAbort.current?.abort();
    },
    [],
  );

  const performSearch = useCallback(
    async (q: string, searchMode: SearchMode, page = 1, tierOverride?: TierFilterValue) => {
      const tier = tierOverride ?? tierFilter;
      if (!q.trim()) return;
      addEntry(q);
      setShowHistory(false);
      const seq = ++searchSeq.current;
      const isCurrent = () => seq === searchSeq.current;
      activeStream.current?.close();
      activeStream.current = null;
      activeAbort.current?.abort();
      const abort = new AbortController();
      activeAbort.current = abort;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ q, mode: searchMode });
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      if (datePreset) params.set('datePreset', datePreset);
      if (searchMode === 'research' && tier !== 'all') params.set('tier', tier);
      if (searchMode === 'explore') {
        if (filterCategory) params.set('category', filterCategory);
        if (filterSource) params.set('source', filterSource);
        if (filterSort !== 'relevance') params.set('sort', filterSort);
        if (page > 1) params.set('page', String(page));
      }
      router.replace(`/search?${params.toString()}`, undefined, { shallow: true });

      try {
        if (searchMode === 'research') {
          await performResearch(q, params, isCurrent, abort.signal);
        } else {
          const res = await fetch(`/api/search?${params.toString()}`, { signal: abort.signal });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Search failed (${res.status})`);
          }
          const data = (await res.json()) as ExploreResult;
          if (!isCurrent()) return;
          setExploreResult(data);
          setResearchResult(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isCurrent()) setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filterCategory,
      datePreset,
      filterDateFrom,
      filterDateTo,
      filterSource,
      filterSort,
      tierFilter,
      router,
    ],
  );

  const performResearch = async (
    q: string,
    urlParams: URLSearchParams,
    isCurrent: () => boolean,
    signal: AbortSignal,
  ) => {
    setExploreResult(null);

    // Phase 1: Fetch documents immediately (fast)
    const docsParams = new URLSearchParams(urlParams);
    docsParams.set('docsOnly', 'true');
    const docsRes = await fetch(`/api/search?${docsParams.toString()}`, { signal });
    if (!docsRes.ok) {
      const body = await docsRes.json().catch(() => ({}));
      throw new Error(body.error || `Search failed (${docsRes.status})`);
    }
    const docsData = await docsRes.json();

    // Show docs while synthesis runs
    const baseResult: ResearchResult = {
      answer: { expert: '', public: '' },
      documents: docsData.documents,
      dateRange: docsData.dateRange,
      queryConfidence: docsData.queryConfidence,
      relatedQuestions: [],
      corpusStats: docsData.corpusStats ?? null,
    };
    if (!isCurrent()) return;
    setResearchResult(baseResult);
    setLoading(false);
    setSynthesizing(true);

    // Phase 2: Stream single-pass Sonnet synthesis via SSE. Pass the exact
    // ordered doc ids from phase 1 so [Doc N] citations always match the doc
    // cards (#552) and the stream skips a redundant vector search.
    try {
      const streamParams = new URLSearchParams({ q });
      if (filterDateFrom) streamParams.set('dateFrom', filterDateFrom);
      if (filterDateTo) streamParams.set('dateTo', filterDateTo);
      const docIds = (docsData.documents as Array<{ id?: number }>)
        .map((d) => d.id)
        .filter((id): id is number => typeof id === 'number');
      if (docIds.length > 0) streamParams.set('ids', docIds.join(','));
      const eventSource = new EventSource(`/api/search/stream?${streamParams.toString()}`);
      activeStream.current = eventSource;
      let accumulated = '';

      await new Promise<void>((resolve, reject) => {
        eventSource.onmessage = (event) => {
          if (!isCurrent()) {
            eventSource.close();
            resolve();
            return;
          }
          const data = JSON.parse(event.data);

          if (data.type === 'chunk') {
            accumulated += data.text;
            const parsed = parseStreamingSections(accumulated);
            setResearchResult((prev) =>
              prev ? { ...prev, answer: { expert: parsed.expert, public: parsed.public } } : prev,
            );
          } else if (data.type === 'done') {
            eventSource.close();
            const final = parseStreamingSections(accumulated);
            setResearchResult((prev) =>
              prev
                ? {
                    ...prev,
                    answer: { expert: final.expert, public: final.public },
                    relatedQuestions: final.relatedQuestions,
                  }
                : prev,
            );
            resolve();
          } else if (data.type === 'error') {
            eventSource.close();
            reject(new Error(data.message));
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          reject(new Error('Stream connection lost'));
        };
      });
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Answer generation failed');
    } finally {
      if (isCurrent()) setSynthesizing(false);
    }
  };

  // Sync URL → state once router.query is populated
  const didInitFromUrl = useRef(false);
  useEffect(() => {
    if (!router.isReady || didInitFromUrl.current) return;
    didInitFromUrl.current = true;

    const q = router.query.q as string | undefined;
    const m = router.query.mode as SearchMode | undefined;
    if (q) setQuery(q);
    if (m && (m === 'research' || m === 'explore')) setMode(m);
    if (router.query.category) setFilterCategory(router.query.category as string);
    if (router.query.datePreset) setDatePreset(router.query.datePreset as string);
    if (router.query.dateFrom) setFilterDateFrom(router.query.dateFrom as string);
    if (router.query.dateTo) setFilterDateTo(router.query.dateTo as string);
    if (router.query.source) setFilterSource(router.query.source as string);
    if (router.query.sort) setFilterSort(router.query.sort as string);
    if (router.query.page) setFilterPage(Number(router.query.page));
    const t = router.query.tier as string | undefined;
    if (t === 'action' || t === 'discussion') setTierFilter(t);
    if (q && q.trim().length > 0) performSearch(q, m ?? mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilterPage(1);
    performSearch(query, mode, 1);
  };

  return (
    <>
      <SEOHead
        title="Search the Record"
        description="Search government documents by topic. Research mode synthesizes answers; explore mode provides filtered keyword and semantic search."
        canonicalPath="/search"
      />
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>
      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">
        Search the Documentary Record
      </h1>
      <p className="text-sm text-dm-muted mb-6">
        Search government documents indexed by Democracy Monitor.
      </p>

      {/* Mode toggle + date range (shared) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs text-dm-muted">Mode:</span>
        <div className="flex rounded-lg border border-dm-border overflow-hidden">
          {(['research', 'explore'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setResearchResult(null);
                setExploreResult(null);
                setError(null);
              }}
              className={`px-3 py-1 text-xs font-medium transition-colors capitalize ${
                mode === m
                  ? 'bg-dm-accent text-white'
                  : 'bg-dm-card text-dm-text-secondary hover:text-dm-text-primary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <DateRangeSelect
          datePreset={datePreset}
          dateFrom={filterDateFrom}
          dateTo={filterDateTo}
          onPresetChange={(preset, from, to) => {
            setDatePreset(preset);
            setFilterDateFrom(from);
            setFilterDateTo(to);
          }}
          onDateFromChange={setFilterDateFrom}
          onDateToChange={setFilterDateTo}
        />
      </div>

      <form onSubmit={handleSubmit} ref={formRef} className="mb-4">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowHistory(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowHistory(false);
              }}
              placeholder={
                mode === 'research'
                  ? 'Ask a question about the government record...'
                  : 'Search documents by keyword, title, or content...'
              }
              className="w-full px-3 py-2 rounded-lg border border-dm-border bg-dm-card text-dm-text-primary text-sm placeholder:text-dm-muted focus:outline-none focus:ring-2 focus:ring-dm-accent/50"
            />
            {showHistory && (
              <SearchHistoryDropdown
                history={history}
                onSelect={(q) => {
                  setQuery(q);
                  performSearch(q, mode);
                }}
                onClear={clearHistory}
                onClose={() => setShowHistory(false)}
                showCurated={mode === 'research'}
                filter={query}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg bg-dm-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {mode === 'research' && (
        <div
          className="flex items-center gap-2 mb-4"
          role="group"
          aria-label="Document type filter"
        >
          {(
            [
              ['all', 'All documents'],
              ['action', 'Government actions'],
              ['discussion', 'Commentary & debate'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTierFilter(value);
                if (query.trim()) performSearch(query, 'research', 1, value);
              }}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                tierFilter === value
                  ? 'bg-dm-accent text-white border-dm-accent'
                  : 'border-dm-border text-dm-muted hover:border-dm-accent'
              }`}
              aria-pressed={tierFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'explore' && (
        <ExploreFilters
          {...{
            filterCategory,
            setFilterCategory,
            filterSource,
            setFilterSource,
            filterSort,
            setFilterSort,
          }}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4 mb-6">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <p className="text-sm text-dm-muted">
            {mode === 'research'
              ? 'Retrieving documents and generating answer...'
              : 'Searching documents...'}
          </p>
        </div>
      )}

      {!loading && mode === 'research' && researchResult && (
        <ResearchResults
          result={researchResult}
          readingLevel={readingLevel}
          synthesizing={synthesizing}
          onRelatedQuestion={(q) => {
            setQuery(q);
            performSearch(q, 'research');
          }}
        />
      )}

      {!loading && mode === 'explore' && exploreResult && (
        <ExploreResults
          result={exploreResult}
          page={filterPage}
          onPageChange={(p) => {
            setFilterPage(p);
            performSearch(query, mode, p);
          }}
        />
      )}
    </>
  );
}
