import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DateRangeSelect } from '@/components/search/DateRangeSelect';
import { ExploreFilters, ExploreResults } from '@/components/search/ExploreResults';
import { parseStreamingSections } from '@/components/search/helpers';
import { ResearchResults } from '@/components/search/ResearchResults';
import { SearchDebugLog } from '@/components/search/SearchDebugLog';
import type { SearchDebugCapture } from '@/components/search/SearchDebugLog';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search/SearchHistory';
import { SearchModeIntro } from '@/components/search/SearchModeIntro';
import { SearchProgressStages } from '@/components/search/SearchProgressStages';
import { SearchTips } from '@/components/search/SearchTips';
import type { ExploreResult, ResearchResult, SearchMode } from '@/components/search/types';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { suggestTierFromQuestion } from '@/lib/services/tier-hint';

type TierFilterValue = 'all' | 'action' | 'discussion';

/** A completed synthesis stream whose text had no parseable sections — model
 *  nondeterminism, retried once silently before surfacing an error. */
class UnparseableSynthesisError extends Error {
  constructor() {
    super('The answer could not be generated from the response. Please try the search again.');
    this.name = 'UnparseableSynthesisError';
  }
}

export default function SearchPage() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const [mode, setMode] = useLocalStorage<SearchMode>('dm_search_mode', 'research');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugCapture, setDebugCapture] = useState<SearchDebugCapture | null>(null);
  const debugRef = useRef<SearchDebugCapture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [tierHintDismissed, setTierHintDismissed] = useState(false);
  const tierHint = suggestTierFromQuestion(query);
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
    async (
      q: string,
      searchMode: SearchMode,
      page = 1,
      tierOverride?: TierFilterValue,
      erasOverride?: string[],
      dateOverrides?: { dateFrom?: string; dateTo?: string; datePreset?: string },
    ) => {
      const tier = tierOverride ?? tierFilter;
      const df = dateOverrides?.dateFrom ?? filterDateFrom;
      const dt = dateOverrides?.dateTo ?? filterDateTo;
      const dp = dateOverrides?.datePreset ?? datePreset;
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
      const debugMode = router.query.debug === '1';
      if (debugMode) params.set('debug', '1');
      if (df) params.set('dateFrom', df);
      if (dt) params.set('dateTo', dt);
      if (dp) params.set('datePreset', dp);
      if (searchMode === 'research' && tier !== 'all') params.set('tier', tier);
      if (searchMode === 'research' && erasOverride && erasOverride.length > 0)
        params.set('eras', erasOverride.join(','));
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
    const debugMode = urlParams.get('debug') === '1';
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
      strata: docsData.strata ?? null,
      inferredDateFrom: docsData.inferredDateFrom ?? null,
      alsoSearched: docsData.alsoSearched ?? undefined,
    };
    if (!isCurrent()) return;
    setResearchResult(baseResult);
    if (debugMode) {
      debugRef.current = {
        question: q,
        requestedAt: new Date().toISOString(),
        docsPayload: docsData,
        synthesisPrompt: null,
        answer: null,
        quoteVerification: null,
        relatedQuestions: [],
      };
      setDebugCapture(debugRef.current);
    }
    setLoading(false);
    setSynthesizing(true);

    // Phase 2: Stream single-pass Sonnet synthesis via SSE. Pass the exact
    // ordered doc ids from phase 1 so [Doc N] citations always match the doc
    // cards (#552) and the stream skips a redundant vector search.
    try {
      const streamParams = new URLSearchParams({ q });
      if (debugMode) streamParams.set('debug', '1');
      const df = urlParams.get('dateFrom');
      const dt = urlParams.get('dateTo');
      if (df) streamParams.set('dateFrom', df);
      if (dt) streamParams.set('dateTo', dt);
      // Phase-1 docs cache key: lets the stream re-attach matched-passage
      // snippets to the synthesis context (#707 audit).
      if (docsData.docsKey) streamParams.set('dk', docsData.docsKey);
      const docIds = (docsData.documents as Array<{ id?: number }>)
        .map((d) => d.id)
        .filter((id): id is number => typeof id === 'number');
      if (docIds.length > 0) streamParams.set('ids', docIds.join(','));

      // An unparseable completed stream is model nondeterminism — one silent
      // retry (same doc ids, so no redundant vector search) resolves nearly
      // all of them. Only the second failure surfaces to the user.
      const MAX_SYNTHESIS_ATTEMPTS = 2;
      for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
        try {
          await attemptSynthesisStream(streamParams, isCurrent);
          break;
        } catch (err) {
          const retryable = err instanceof UnparseableSynthesisError;
          if (!retryable || attempt === MAX_SYNTHESIS_ATTEMPTS || !isCurrent()) throw err;
          console.warn(`[search] synthesis unparseable — retrying (attempt ${attempt + 1})`);
        }
      }
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Answer generation failed');
    } finally {
      if (isCurrent()) setSynthesizing(false);
    }
  };

  const attemptSynthesisStream = (streamParams: URLSearchParams, isCurrent: () => boolean) => {
    const eventSource = new EventSource(`/api/search/stream?${streamParams.toString()}`);
    activeStream.current = eventSource;
    let accumulated = '';

    return new Promise<void>((resolve, reject) => {
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
        } else if (data.type === 'debug') {
          if (debugRef.current) {
            debugRef.current = { ...debugRef.current, synthesisPrompt: data.synthesisPrompt };
            setDebugCapture(debugRef.current);
          }
        } else if (data.type === 'verification') {
          // Auto-corrected citations (#720): swap the accumulated answer for
          // the corrected text so both the live render and the final 'done'
          // parse carry the fixed [Doc N] brackets; the badge discloses each.
          if (data.correctedAnswer) {
            if (debugRef.current) {
              debugRef.current = { ...debugRef.current, answerBeforeCorrections: accumulated };
            }
            accumulated = data.correctedAnswer;
            const corrected = parseStreamingSections(accumulated);
            setResearchResult((prev) =>
              prev
                ? { ...prev, answer: { expert: corrected.expert, public: corrected.public } }
                : prev,
            );
          }
          const verification = {
            unavailable: data.unavailable ?? false,
            verificationMs: data.verificationMs,
            totalQuotes: data.totalQuotes ?? 0,
            verifiedCount: data.verifiedCount ?? 0,
            corrections: data.corrections ?? [],
            unverified: data.unverified ?? [],
          };
          setResearchResult((prev) => (prev ? { ...prev, quoteVerification: verification } : prev));
          if (debugRef.current) {
            debugRef.current = { ...debugRef.current, quoteVerification: verification };
            setDebugCapture(debugRef.current);
          }
        } else if (data.type === 'done') {
          eventSource.close();
          const final = parseStreamingSections(accumulated);
          if (!final.expert && !final.public) {
            // #598 spirit: a completed stream with no parseable answer is a
            // failure, not an empty page. Keep the documents visible.
            console.error(
              '[search] synthesis completed without parseable sections:',
              accumulated.slice(0, 300),
            );
            reject(new UnparseableSynthesisError());
            return;
          }
          setResearchResult((prev) =>
            prev
              ? {
                  ...prev,
                  answer: { expert: final.expert, public: final.public },
                  relatedQuestions: final.relatedQuestions,
                }
              : prev,
          );
          if (debugRef.current) {
            debugRef.current = {
              ...debugRef.current,
              answer: { expert: final.expert, public: final.public },
              relatedQuestions: final.relatedQuestions,
            };
            setDebugCapture(debugRef.current);
          }
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
    else if (router.query.dateFrom || router.query.dateTo) setDatePreset('custom');
    if (router.query.dateFrom) setFilterDateFrom(router.query.dateFrom as string);
    if (router.query.dateTo) setFilterDateTo(router.query.dateTo as string);
    if (router.query.source) setFilterSource(router.query.source as string);
    if (router.query.sort) setFilterSort(router.query.sort as string);
    if (router.query.page) setFilterPage(Number(router.query.page));
    const t = router.query.tier as string | undefined;
    if (t === 'action' || t === 'discussion') setTierFilter(t);
    // Shared-link fidelity: state setters above have not committed yet, so
    // the initial search must receive every parsed setting explicitly — a
    // clicked outreach URL is the complete instruction, no toggles needed.
    const eras = (router.query.eras as string | undefined)?.split(',').filter(Boolean);
    if (q && q.trim().length > 0) {
      performSearch(
        q,
        m ?? mode,
        Number(router.query.page) || 1,
        t === 'action' || t === 'discussion' ? t : undefined,
        eras,
        {
          dateFrom: router.query.dateFrom as string | undefined,
          dateTo: router.query.dateTo as string | undefined,
          datePreset: router.query.datePreset as string | undefined,
        },
      );
    }
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
      <SearchModeIntro />

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

      <form onSubmit={handleSubmit} ref={formRef} className="mb-4">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTierHintDismissed(false);
              }}
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

      <SearchTips mode={mode} />

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

      {loading &&
        (mode === 'research' ? (
          <SearchProgressStages />
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-dm-muted">Searching documents...</p>
          </div>
        ))}

      {!loading &&
        mode === 'research' &&
        researchResult &&
        tierFilter === 'all' &&
        !tierHintDismissed &&
        tierHint && (
          <div className="flex items-center gap-2 mb-3 text-xs text-dm-text-secondary">
            <span>
              Your question mentions “{tierHint.phrase}” —{' '}
              <button
                type="button"
                className="text-dm-accent hover:underline"
                onClick={() => {
                  setTierFilter(tierHint.tier);
                  performSearch(query, 'research', 1, tierHint.tier);
                }}
              >
                filter to{' '}
                {tierHint.tier === 'discussion' ? 'Commentary & debate' : 'Government actions'}
              </button>
              ?
            </span>
            <button
              type="button"
              aria-label="Dismiss filter suggestion"
              className="text-dm-muted hover:text-dm-text-secondary"
              onClick={() => setTierHintDismissed(true)}
            >
              ×
            </button>
          </div>
        )}

      {!loading && mode === 'research' && researchResult?.inferredDateFrom && (
        <p className="text-xs text-dm-muted mb-2">
          Applied a date floor of {researchResult.inferredDateFrom} from your question&apos;s
          phrasing. Use the Period control to override.
        </p>
      )}

      {!loading && mode === 'research' && researchResult?.strata && (
        <div className="flex flex-wrap items-center gap-2 mb-3" aria-label="Comparison eras">
          <span className="text-xs text-dm-muted">Comparing:</span>
          {researchResult.strata.map((s) => (
            <span
              key={s.key}
              title={
                s.dateConflict
                  ? 'Your date range excludes this era; its full term window was searched instead.'
                  : `${s.from} – ${s.to ?? 'present'}`
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs ${
                s.dateConflict
                  ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                  : 'border-dm-accent/40 text-dm-accent'
              }`}
            >
              {s.label} ({s.docCount} docs){s.dateConflict ? ' ⚠' : ''}
              {researchResult.strata!.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${s.label} from the comparison`}
                  className="hover:opacity-70"
                  onClick={() => {
                    const remaining = researchResult
                      .strata!.filter((x) => x.key !== s.key)
                      .map((x) => x.key);
                    performSearch(query, 'research', 1, undefined, remaining);
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!loading && mode === 'research' && researchResult && (
        <>
          <SearchDebugLog capture={debugCapture} />
          <ResearchResults
            result={researchResult}
            readingLevel={readingLevel}
            synthesizing={synthesizing}
            onRelatedQuestion={(q) => {
              setQuery(q);
              performSearch(q, 'research');
            }}
          />
        </>
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
