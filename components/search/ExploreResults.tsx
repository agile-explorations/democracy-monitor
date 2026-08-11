import { useMemo } from 'react';
import { CaseContext } from '@/components/shared/CaseContext';
import { CATEGORIES } from '@/lib/data/categories';
import { categoryLabel, formatDate } from './helpers';
import { AlsoSearchedChips, MatchSnippet } from './MatchSnippet';
import type { ExploreDocResult, ExploreResult } from './types';

interface GroupedDoc {
  url: string | null;
  title: string;
  publishedAt: string | null;
  sourceType: string;
  sourceOrigin: string | null;
  caseId: string | null;
  snippet: string | null;
  matchSnippet: string | null;
  matchedAlias: string | null;
  cosineSimilarity: number | null;
  aiReasoning: string | null;
  categories: ExploreDocResult[];
}

function groupByUrl(docs: ExploreDocResult[]): GroupedDoc[] {
  const map = new Map<string, GroupedDoc>();
  for (const doc of docs) {
    const key = doc.url ?? `_id_${doc.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.categories.push(doc);
      // Keep highest relevance
      if (doc.cosineSimilarity != null && (existing.cosineSimilarity ?? 0) < doc.cosineSimilarity) {
        existing.cosineSimilarity = doc.cosineSimilarity;
      }
      if (!existing.aiReasoning && doc.aiReasoning) existing.aiReasoning = doc.aiReasoning;
      if (!existing.matchSnippet && doc.matchSnippet) {
        existing.matchSnippet = doc.matchSnippet;
        existing.matchedAlias = doc.matchedAlias ?? null;
      }
    } else {
      map.set(key, {
        url: doc.url,
        title: doc.title,
        publishedAt: doc.publishedAt,
        sourceType: doc.sourceType,
        sourceOrigin: doc.sourceOrigin,
        caseId: doc.caseId ?? null,
        snippet: doc.snippet,
        matchSnippet: doc.matchSnippet ?? null,
        matchedAlias: doc.matchedAlias ?? null,
        cosineSimilarity: doc.cosineSimilarity,
        aiReasoning: doc.aiReasoning ?? null,
        categories: [doc],
      });
    }
  }
  return [...map.values()];
}

function CategoryRow({ doc }: { doc: ExploreDocResult }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      <span className="px-1.5 py-0 rounded bg-dm-border/50 text-dm-muted">
        {categoryLabel(doc.category)}
      </span>
      {doc.finalScore != null && (
        <span className="text-dm-text-secondary">Score: {doc.finalScore.toFixed(1)}</span>
      )}
      {doc.documentClass && doc.classMultiplier != null && doc.classMultiplier !== 1.0 && (
        <span className="text-dm-muted">
          {doc.documentClass} &times;{doc.classMultiplier.toFixed(1)}
        </span>
      )}
      {(doc.captureCount ?? 0) > 0 && <span className="text-red-500">{doc.captureCount}C</span>}
      {(doc.driftCount ?? 0) > 0 && <span className="text-amber-500">{doc.driftCount}D</span>}
      {doc.aiAssessment && (
        <span
          className={`font-medium ${
            doc.aiAssessment === 'clearly_concerning'
              ? 'text-red-500'
              : doc.aiAssessment === 'potentially_concerning'
                ? 'text-amber-500'
                : 'text-dm-muted'
          }`}
        >
          AI: {doc.aiAssessment.replace(/_/g, ' ')}
          {doc.aiConfidence != null && ` (${(doc.aiConfidence * 100).toFixed(0)}%)`}
        </span>
      )}
      {doc.aiErosionType && (
        <span className="text-dm-muted">{doc.aiErosionType.replace(/_/g, ' ')}</span>
      )}
    </div>
  );
}

function GroupedDocCard({ group }: { group: GroupedDoc }) {
  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-3">
      {group.url ? (
        <a
          href={group.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-dm-text-primary hover:text-dm-accent transition-colors"
        >
          {group.title}
        </a>
      ) : (
        <span className="text-sm font-medium text-dm-text-primary">{group.title}</span>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-dm-muted">
        {group.publishedAt && <span>{formatDate(group.publishedAt)}</span>}
        <span>{group.sourceOrigin ?? group.sourceType}</span>
        {group.cosineSimilarity != null && (
          <span>Relevance: {(group.cosineSimilarity * 100).toFixed(0)}%</span>
        )}
      </div>

      <div className="mt-2 space-y-1">
        {group.categories.map((doc) => (
          <CategoryRow key={doc.id} doc={doc} />
        ))}
      </div>

      {group.matchSnippet ? (
        <MatchSnippet snippet={group.matchSnippet} alias={group.matchedAlias} />
      ) : (
        group.snippet && (
          <p className="mt-2 text-xs text-dm-text-secondary line-clamp-2 italic">
            &ldquo;{group.snippet.trim()}&rdquo;
          </p>
        )
      )}

      {group.aiReasoning && (
        <p className="mt-2 text-xs text-dm-text-secondary line-clamp-2">
          <span className="text-dm-muted">AI review:</span> {group.aiReasoning}
        </p>
      )}

      <CaseContext caseId={group.caseId} />
    </div>
  );
}

export function ExploreFilters({
  filterCategory,
  setFilterCategory,
  filterSource,
  setFilterSource,
  filterSort,
  setFilterSort,
}: {
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterSource: string;
  setFilterSource: (v: string) => void;
  filterSort: string;
  setFilterSort: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
      <select
        value={filterCategory}
        onChange={(e) => setFilterCategory(e.target.value)}
        className="px-2 py-1.5 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.title}
          </option>
        ))}
      </select>
      <select
        value={filterSource}
        onChange={(e) => setFilterSource(e.target.value)}
        className="px-2 py-1.5 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
      >
        <option value="">All sources</option>
        <option value="federal_register">Federal Register</option>
        <option value="courtlistener">CourtListener</option>
        <option value="doj">DOJ</option>
        <option value="govinfo">GovInfo</option>
        <option value="govinfo_cpd">Presidential Docs (CPD)</option>
        <option value="fec">FEC</option>
        <option value="legiscan">LegiScan</option>
        <option value="oig">OIG</option>
        <option value="crec">CREC</option>
        <option value="chrg">Hearings</option>
        <option value="dhs_press">DHS/ICE/CBP Press</option>
      </select>
      <select
        value={filterSort}
        onChange={(e) => setFilterSort(e.target.value)}
        className="px-2 py-1.5 rounded border border-dm-border bg-dm-card text-dm-text-secondary text-xs"
      >
        <option value="relevance">Sort: Relevance</option>
        <option value="date">Sort: Date</option>
        <option value="score">Sort: Score</option>
      </select>
    </div>
  );
}

export function ExploreResults({
  result,
  page,
  onPageChange,
}: {
  result: ExploreResult;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const grouped = useMemo(() => groupByUrl(result.documents), [result.documents]);
  const totalPages = Math.ceil(result.totalResults / result.pageSize);

  return (
    <div>
      <p className="text-xs text-dm-muted mb-4">
        {result.totalResults.toLocaleString()} result{result.totalResults !== 1 ? 's' : ''}
        {grouped.length < result.documents.length && (
          <span> ({grouped.length} unique documents)</span>
        )}
      </p>
      <AlsoSearchedChips phrases={result.alsoSearched} />
      <div className="space-y-2">
        {grouped.map((group) => (
          <GroupedDocCard key={group.url ?? group.categories[0].id} group={group} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 text-xs rounded border border-dm-border text-dm-text-secondary hover:text-dm-text-primary disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-dm-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 text-xs rounded border border-dm-border text-dm-text-secondary hover:text-dm-text-primary disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
