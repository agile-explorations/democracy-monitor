import type { ResearchResult } from './types';

type Verification = NonNullable<ResearchResult['quoteVerification']>;
type Unverified = Verification['unverified'][number];

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);

function CiteLink({ n }: { n: number }) {
  return (
    <a href={`#cite-${n}`} className="ml-1 text-dm-accent hover:underline font-medium">
      [{n}]
    </a>
  );
}

/** Citations the verifier rewrote in the displayed answer (#720) — full
 *  disclosure: the quote, its actual source, and what the answer had cited. */
function CorrectionList({
  corrections,
}: {
  corrections: NonNullable<Verification['corrections']>;
}) {
  return (
    <ul className="mt-1 space-y-1 pl-4">
      {corrections.map((c, i) => (
        <li key={i} className="text-[11px] text-dm-text-secondary/90 list-disc">
          <span className="text-dm-muted">Corrected:</span> &ldquo;{clip(c.quote, 120)}&rdquo; is
          verbatim from
          <CiteLink n={c.to} />
          <span className="text-dm-muted">
            {' '}
            — the answer originally cited {c.from.map((n) => `[${n}]`).join(' ')}.
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Term-of-art notes (#720): the quoted phrase exists in several context
 *  documents but not the cited one — informational, not a warning. */
function TermOfArtNotes({ notes }: { notes: Unverified[] }) {
  return (
    <ul className="mt-1 space-y-1 pl-4">
      {notes.map((u, i) => (
        <li key={i} className="text-[11px] text-dm-text-secondary/90 list-disc">
          <span className="text-dm-muted">Note:</span> &ldquo;{clip(u.quote, 120)}&rdquo; appears in
          {(u.ambiguousIn ?? []).map((n) => (
            <CiteLink key={n} n={n} />
          ))}
          <span className="text-dm-muted">
            {' '}
            but not the cited document — the citation likely marks the claim&rsquo;s source.
          </span>
        </li>
      ))}
    </ul>
  );
}

function WarningList({ warnings }: { warnings: Unverified[] }) {
  return (
    <ul className="mt-1 space-y-1 pl-4">
      {warnings.map((u, i) => (
        <li key={i} className="text-[11px] text-amber-500/90 list-disc">
          <span className="text-dm-muted">Answer quotes:</span> &ldquo;{clip(u.quote, 120)}&rdquo;
          {u.citations.map((n) => (
            <CiteLink key={n} n={n} />
          ))}
          {u.foundIn != null && (
            <span className="block text-dm-text-secondary/90">
              <span className="text-dm-muted">
                This quote is verbatim from a different source — the citation points to the wrong
                document; see
              </span>{' '}
              <a href={`#cite-${u.foundIn}`} className="text-dm-accent hover:underline">
                [{u.foundIn}]
              </a>
              .
            </span>
          )}
          {u.nearest && (
            <span className="block text-dm-text-secondary/90">
              <span className="text-dm-muted">Document reads:</span> &ldquo;…
              {clip(u.nearest.text, 180)}…&rdquo;{' '}
              <a href={`#cite-${u.nearest.citation}`} className="text-dm-accent hover:underline">
                see [{u.nearest.citation}]
              </a>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Deterministic quote-check result (#707): quotes matched against stored
 *  source content — a green line when all verify (counting auto-corrected
 *  citations, #720); term-of-art notes render as info; the amber caution
 *  lists remaining unverified quotes with citation links (#713). */
export function QuoteVerificationBadge({ verification }: { verification?: Verification | null }) {
  if (!verification || verification.totalQuotes === 0) return null;
  const corrections = verification.corrections ?? [];
  const notes = verification.unverified.filter((u) => u.ambiguousIn != null);
  const warnings = verification.unverified.filter((u) => u.ambiguousIn == null);
  return (
    <div className="mt-3">
      {warnings.length === 0 ? (
        <p
          className="text-[11px] text-emerald-500"
          title="Every quoted passage in the answer was string-matched against the full stored text of the source documents."
        >
          ✓ All {verification.totalQuotes} quoted passage
          {verification.totalQuotes !== 1 ? 's' : ''} verified verbatim against the source documents
          {corrections.length > 0 &&
            ` (${corrections.length} citation${corrections.length !== 1 ? 's' : ''} auto-corrected)`}
          .
        </p>
      ) : (
        <p
          className="text-[11px] text-amber-500"
          title="Quoted passages are string-matched against the full stored text of their cited documents; at least one could not be found verbatim."
        >
          ⚠ {warnings.length} of {verification.totalQuotes} quoted passage
          {verification.totalQuotes !== 1 ? 's' : ''} could not be verified verbatim against the
          source documents — treat quoted wording with caution:
        </p>
      )}
      {warnings.length > 0 && <WarningList warnings={warnings} />}
      {corrections.length > 0 && <CorrectionList corrections={corrections} />}
      {notes.length > 0 && <TermOfArtNotes notes={notes} />}
    </div>
  );
}
