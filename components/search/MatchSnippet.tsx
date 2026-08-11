/**
 * Matched-passage rendering for hybrid retrieval (#702): the excerpt around
 * the keyword hit (ts_headline with [[..]] markers — rendered as <mark>, no
 * raw HTML injection), and the "Also searched" transparency chips showing
 * which corpus-validated alias terms the search expanded to.
 */

const MARKER_SPLIT = /\[\[|\]\]/;

/** Render a [[..]]-marked headline as text with highlighted match terms. */
export function MatchSnippet({ snippet, alias }: { snippet: string; alias?: string | null }) {
  const parts = snippet.split(MARKER_SPLIT);
  return (
    <p className="mt-2 text-xs text-dm-text-secondary line-clamp-3">
      <span className="text-dm-muted">Matched passage{alias ? ` (“${alias}”)` : ''}:</span>{' '}
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-dm-accent/20 text-dm-text-primary rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/** Transparency chips: the alias terms the hybrid search also looked for. */
export function AlsoSearchedChips({ phrases }: { phrases?: string[] }) {
  if (!phrases || phrases.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[11px]">
      <span className="text-dm-muted">Also searched:</span>
      {phrases.map((p) => (
        <span
          key={p}
          className="px-1.5 py-0.5 rounded-full border border-dm-border bg-dm-card text-dm-text-secondary"
        >
          {p}
        </span>
      ))}
    </div>
  );
}
