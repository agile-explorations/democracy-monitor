/**
 * Matched-passage rendering for hybrid retrieval (#702): the excerpt around
 * the keyword hit, and the "Also searched" transparency chips showing which
 * corpus-validated alias terms the search expanded to.
 *
 * Highlighting is PHRASE-scoped (#728): ts_headline's [[..]] markers are
 * word-level — a "Schedule F" search marked every stem-match of "schedule"
 * and every bare "F", misrepresenting the search as word-sloppy when the
 * retrieval is phrase-strict. The markers now only pick the excerpt; the
 * highlight is re-derived here from the matched phrase itself (whether the
 * user's own wording or an "Also searched" expansion). Word-level marker
 * rendering remains the fallback when no phrase is known.
 */

import { useState } from 'react';

const MARKER_SPLIT = /\[\[|\]\]/;
const MARKER_STRIP = /\[\[|\]\]/g;

/** Case-insensitive matcher for the phrase with flexible gaps between words
 *  — corpus text hyphenates and line-breaks inside phrases (#717). */
export function phraseRegex(phrase: string): RegExp {
  const escaped = phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('[\\s\\u00a0-]+')})`, 'gi');
}

function Highlighted({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-dm-accent/20 text-dm-text-primary rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Excerpts longer than this get a "show more context" toggle — the payload
 *  carries the full window while the clamp shows roughly three lines. */
const EXPANDABLE_MIN_CHARS = 320;

/** Render an excerpt with the matched PHRASE highlighted; long excerpts are
 *  clamped with a toggle to read the context around the hit (#728). */
export function MatchSnippet({ snippet, alias }: { snippet: string; alias?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const parts = alias
    ? snippet.replace(MARKER_STRIP, '').split(phraseRegex(alias))
    : snippet.split(MARKER_SPLIT);
  const expandable = snippet.length > EXPANDABLE_MIN_CHARS;
  return (
    <div className="mt-2 text-xs text-dm-text-secondary">
      <p className={expanded ? '' : 'line-clamp-3'}>
        <span className="text-dm-muted">Matched passage{alias ? ` (“${alias}”)` : ''}:</span>{' '}
        <Highlighted parts={parts} />
      </p>
      {expandable && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-[11px] text-dm-accent hover:underline"
        >
          {expanded ? 'Show less' : 'Show more context'}
        </button>
      )}
    </div>
  );
}

/** Transparency chips: the alias terms the hybrid search also looked for. */
export function AlsoSearchedChips({ phrases }: { phrases?: string[] }) {
  if (!phrases || phrases.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mb-4 text-[11px]"
      title="Your wording expanded into the record's own terms — only terms verified to appear in the corpus are searched."
    >
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
